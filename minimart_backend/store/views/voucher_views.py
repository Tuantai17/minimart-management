import logging
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import ValidationError, Throttled
from rest_framework.throttling import ScopedRateThrottle


from store.models import Voucher, UserVoucherUsage, UserVoucher
from store.serializers.voucher_serializers import VoucherApplySerializer, VoucherListSerializer, MyVoucherSerializer
from store.services.voucher_service import validate_voucher, calculate_discount, claim_voucher
from django.utils import timezone
import redis

logger = logging.getLogger(__name__)

# Giới hạn theo SPEC: 10 lần/60 giây/user+IP
_RATE_LIMIT = 10
_RATE_WINDOW = 60  # seconds


class VoucherListView(ListAPIView):
    """
    GET /api/vouchers/

    Danh sách voucher công khai — FE_CONTRACT §5.1.
    - Anonymous: xem được nhưng is_claimed luôn False
    - Authenticated: is_claimed, claim_status phản ánh đúng trạng thái của user
    """
    serializer_class = VoucherListSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        now = timezone.now()
        # Trả về voucher đang trong thời gian hiệu lực và active
        return Voucher.objects.filter(
            is_active=True,
            start_date__lte=now,
            end_date__gte=now,
        ).order_by('-created_at')


class MyVoucherListView(ListAPIView):
    """
    GET /api/my-vouchers/

    Ví voucher của user — FE_CONTRACT §5.3.
    Yêu cầu JWT. Chỉ trả về bản ghi của user đang đăng nhập.
    """
    serializer_class = MyVoucherSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            UserVoucher.objects
            .filter(user=self.request.user)
            .select_related('voucher')
            .order_by('-claimed_at')
        )

class VoucherClaimView(APIView):
    """
    POST /api/vouchers/{voucher_id}/claim/
    API Nhận voucher — FE_CONTRACT §5.2.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'voucher_claim'


    def post(self, request, pk):
        try:
            user_voucher = claim_voucher(request.user, pk)
            serializer = MyVoucherSerializer(user_voucher)
            return Response({
                "message": "Nhận voucher thành công.",
                "user_voucher": serializer.data
            }, status=200)
        except ValidationError as e:
            return Response(e.detail, status=400)

class VoucherApplyView(APIView):
    permission_classes = [IsAuthenticated]

    def _check_rate_limit(self, request):
        ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', ''))
        key = f"voucher_apply_rl:{request.user.id}"

        try:
            client = cache.client.get_client()
            with client.pipeline() as pipe:
                pipe.incr(key)
                pipe.expire(key, _RATE_WINDOW)
                count, _ = pipe.execute()

            if count > _RATE_LIMIT:
                raise Throttled(detail="Quá nhiều lần thử. Vui lòng chờ 1 phút.")
        except Throttled:
            raise
        except redis.exceptions.RedisError as e:
            logger.warning("Rate limit Redis unavailable for key %s: %s — skipping", key, e)

    def post(self, request):
        self._check_rate_limit(request)

        serializer = VoucherApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        code = serializer.validated_data['code']

        # validate_voucher() tự tính subtotal từ Cart của request.user
        # Không nhận subtotal từ FE — bảo mật theo quyết định Q1
        voucher, subtotal = validate_voucher(code, request.user)

        discount_amount = calculate_discount(voucher, subtotal)
        final_subtotal = subtotal - discount_amount

        return Response({
            "success": True,
            "voucher_code": voucher.code,
            "discount_type": voucher.discount_type,
            "discount_value": str(voucher.discount_value),
            "discount_amount": discount_amount,
            "original_subtotal": subtotal,
            "final_subtotal": final_subtotal,
            # FE_CONTRACT §5.4: shipping_discount_amount = 0 vì hệ thống hiện tại
            # chỉ hỗ trợ giảm theo đơn hàng (order scope), chưa hỗ trợ giảm phí ship.
            "shipping_discount_amount": 0,
            "applied_scope": "order",
            "message": f"Áp dụng mã {voucher.code} thành công! Bạn tiết kiệm {discount_amount:,.0f}đ.",
        })

