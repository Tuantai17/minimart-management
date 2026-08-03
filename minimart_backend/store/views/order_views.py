
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.exceptions import ValidationError
from rest_framework.throttling import ScopedRateThrottle
from ..models import Cart, CartItem, Order
from ..serializers import CartSerializer, CartItemSerializer, OrderSerializer
from ..services.order_services import create_order, cancel_order, update_order_status
from ..services.cart_services import add_to_cart
from ..services.shipping import calculate_shipping, parse_and_validate_coords
from ..services.vnpay_service import (
    create_vnpay_payment_url, get_client_ip, validate_return_url,
    verify_vnpay_ipn, process_vnpay_payment_result,
)
from ..views.payment_views import _strip_secure_hash



class CartItemViewSet(viewsets.ModelViewSet):
    serializer_class = CartItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CartItem.objects.filter(cart__user=self.request.user, delete_at__isnull=True)

    def create(self, request, *args, **kwargs):
        product_id = request.data.get('product')

        if not product_id:
            return Response({"error": "Thiếu product_id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quantity = int(request.data.get('quantity', 1))
            if quantity < 1:
                raise ValueError
        except (ValueError, TypeError):
            return Response({"error": "Số lượng không hợp lệ"}, status=status.HTTP_400_BAD_REQUEST)

        item, is_new = add_to_cart(request.user, product_id, quantity)
        serializer = self.get_serializer(item)
        if is_new:
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.data, status=status.HTTP_200_OK)



class CartViewSet(viewsets.ModelViewSet):
    serializer_class = CartSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Cart.objects.filter(user=self.request.user).prefetch_related('items__product')

    @action(detail=False, methods=['GET'])
    def me(self, request):
        cart, created = Cart.objects.get_or_create(user=request.user)
        cart = Cart.objects.prefetch_related('items__product').get(pk=cart.pk)
        serializer = self.get_serializer(cart)
        return Response(serializer.data)



class OrderViewSet(viewsets.ModelViewSet):
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    serializer_class = OrderSerializer

    # [AUDIT FIX CRITICAL-03] cancel chuyển sang ADMIN_ONLY — user thường dùng MyOrderViewSet.cancel
    ADMIN_ONLY_ACTIONS = {'list', 'retrieve', 'partial_update', 'update_status', 'cancel'}
    AUTH_ACTIONS = {'create', 'calculate_shipping_preview'}

    def get_permissions(self):
        if self.action in self.ADMIN_ONLY_ACTIONS:
            return [IsAdminUser()]
        if self.action in self.AUTH_ACTIONS:
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def get_queryset(self):
        # [AUDIT FIX MEDIUM-06] Thêm select_related/prefetch_related tránh N+1
        if self.request.user.is_staff or self.request.user.is_superuser:
            return Order.objects.select_related(
                'user', 'voucher'
            ).prefetch_related(
                'items__product'
            ).all().order_by('-created_at')
        return Order.objects.none()

    def create(self, request, *args, **kwargs):
        # Giới hạn 10 lần tạo đơn/phút/user
        self.throttle_scope = 'order_create'
        self.check_throttles(request)
        order = create_order(request.user, request.data)
        serializer = self.get_serializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # POST /api/orders/calculate-shipping/
    @action(detail=False, methods=['POST'], url_path='calculate-shipping')
    def calculate_shipping_preview(self, request):
        delivery_lat = request.data.get('delivery_lat')
        delivery_lng = request.data.get('delivery_lng')

        try:
            cart = Cart.objects.get(user=request.user)
            cart_items = cart.items.all()
            if not cart_items.exists():
                return Response({"error": "Giỏ hàng trống!"}, status=status.HTTP_400_BAD_REQUEST)
        except Cart.DoesNotExist:
            return Response({"error": "Giỏ hàng trống!"}, status=status.HTTP_400_BAD_REQUEST)

        subtotal = sum(item.unit_price * item.quantity for item in cart_items)
        shipping_fee = 15000
        distance_km = None

        if delivery_lat is not None and delivery_lng is not None:
            try:
                lat, lng = parse_and_validate_coords(delivery_lat, delivery_lng)
                result = calculate_shipping(lat, lng)
                shipping_fee = result['shipping_fee']
                distance_km = result['distance_km']
            except (ValueError, TypeError):
                return Response({"error": "Tọa độ không hợp lệ"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "subtotal": subtotal,
            "distance_km": distance_km,
            "shipping_fee": shipping_fee,
            "total_amount": subtotal + shipping_fee,
        })

    # POST /api/orders/{id}/cancel/
    @action(detail=True, methods=['POST'], url_path='cancel')
    def cancel(self, request, pk=None):
        order = self.get_object()
        result = cancel_order(order)
        return Response(result, status=status.HTTP_200_OK)

    # PATCH /api/orders/{id}/update-status/
    @action(detail=True, methods=['PATCH'], url_path='update-status')
    def update_status(self, request, pk=None):
        order = self.get_object()
        new_status = request.data.get('status')
        if not new_status:
            return Response({"error": "Thiếu trường 'status'!"}, status=status.HTTP_400_BAD_REQUEST)
        result = update_order_status(order, new_status, request.user)
        return Response(result, status=status.HTTP_200_OK)



class MyOrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(
            user=self.request.user,
            delete_at__isnull=True
        ).order_by('-created_at')

    # POST /api/my-orders/{id}/cancel/
    @action(detail=True, methods=['POST'], url_path='cancel')
    def cancel(self, request, pk=None):
        order = self.get_object()

        # 409 Conflict: request hợp lệ nhưng xung đột trạng thái hiện tại (RFC 9110)
        if order.status != 'PENDING':
            return Response(
                {"error": "Chỉ hủy được đơn đang ở trạng thái PENDING"},
                status=status.HTTP_409_CONFLICT
            )
        result = cancel_order(order)
        return Response(result, status=status.HTTP_200_OK)

    # POST /api/my-orders/{id}/pay-vnpay/
    @action(detail=True, methods=['POST'], url_path='pay-vnpay')
    def pay_vnpay(self, request, pk=None):
        # Giới hạn 5 lần xin link VNPAY/phút/user
        self.throttle_scope = 'pay_vnpay'
        self.check_throttles(request)

        order = self.get_object()

        # ─── Guard conditions ─────────────────────────────────────────────
        if order.payment_method != 'VNPAY':
            return Response(
                {"error": "Đơn hàng không chọn thanh toán VNPAY."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.status == 'CANCELLED':
            return Response(
                {"error": "Đơn hàng đã bị hủy."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.payment_status == 'PAID':
            return Response(
                {"error": "Đơn hàng này đã được thanh toán."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ─── Validate return_url (nếu FE truyền lên) ─────────────────────
        return_url = request.data.get('return_url')
        if return_url:
            try:
                return_url = validate_return_url(return_url)
            except ValueError as e:
                return Response(
                    {"error": f"return_url không hợp lệ: {e}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        client_ip = get_client_ip(request)
        payment_url = create_vnpay_payment_url(order, client_ip, return_url=return_url)

        response_data = {
            "order_id":     order.id,
            "order_code":   order.order_code,
            "payment_url":  payment_url,
            "return_url":   return_url or settings.VNPAY_RETURN_URL,
            "message":      "Tạo điều hướng thanh toán VNPAY thành công.",
        }
        return Response(response_data, status=status.HTTP_200_OK)

    # POST /api/my-orders/{id}/verify-vnpay/
    @action(detail=True, methods=['POST'], url_path='verify-vnpay')
    def verify_vnpay(self, request, pk=None):
        """
        FE gọi sau khi VNPAY redirect về, truyền toàn bộ query params lên body.
        Backend xác minh chữ ký HMAC rồi cập nhật payment_status.

        Cần vì VNPAY IPN (server-to-server) không gọi được localhost khi dev.
        Production: IPN vẫn là nguồn chính thức, endpoint này là fallback.
        """
        order = self.get_object()

        # ─── Guards ───────────────────────────────────────────────────────
        if order.payment_method != 'VNPAY':
            return Response(
                {"error": "Đơn hàng không phải VNPAY."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if order.payment_status == 'PAID':
            return Response(
                {"payment_status": "PAID", "message": "Đơn hàng đã được thanh toán."},
                status=status.HTTP_200_OK,
            )
        if not request.data:
            return Response(
                {"error": "Thiếu query params từ VNPAY redirect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ─── Flatten + xác thực chữ ký ───────────────────────────────────
        flat_params = {k: (v[0] if isinstance(v, list) else v)
                       for k, v in request.data.items()}

        if not verify_vnpay_ipn(flat_params):
            return Response(
                {"error": "Chữ ký VNPAY không hợp lệ."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if flat_params.get('vnp_TxnRef', '') != order.order_code:
            return Response(
                {"error": "Mã đơn hàng không khớp với tham số VNPAY."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ─── Delegate cho service function dùng chung ────────────────────
        safe_params = _strip_secure_hash(flat_params)
        result = process_vnpay_payment_result(
            order_code=order.order_code,
            vnp_response_code=flat_params.get('vnp_ResponseCode', ''),
            vnp_transaction_no=flat_params.get('vnp_TransactionNo', ''),
            vnp_amount=flat_params.get('vnp_Amount', '0'),
            raw_params=safe_params,
        )

        if not result['success']:
            return Response({"error": result['message']}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "payment_status": result['payment_status'],
            "order_status":   result['order_status'],
            "message":        result['message'],
        }, status=status.HTTP_200_OK)
