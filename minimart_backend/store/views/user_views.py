import os
import re
import logging
import math
import requests

from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied

from ..models import UserProfile, Address, Review, ReviewMedia
from ..serializers import MeSerializer, AddressSerializer, UserProfileSerializer, ReviewSerializer
from ..serializers.user_serializers import ReviewMediaSerializer

# Whitelist MIME type và extension được phép upload
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
ALLOWED_VIDEO_TYPES = {'video/mp4', 'video/quicktime', 'video/webm'}
ALLOWED_IMAGE_EXT   = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
ALLOWED_VIDEO_EXT   = {'.mp4', '.mov', '.webm'}

logger = logging.getLogger(__name__)
RECENT_REVERSE_GEOCODE_RESULTS = []
MAX_RECENT_REVERSE_GEOCODE_RESULTS = 50



# ─── GIỚI HẠN KÍCH THƯỚC FILE UPLOAD ────────────────────────────────────────
MAX_IMAGE_SIZE   = 5  * 1024 * 1024   # 5 MB
MAX_VIDEO_SIZE   = 50 * 1024 * 1024   # 50 MB

# ─── THỜI GIAN CHO PHÉP SỬA REVIEW ──────────────────────────────────────────
# Chuẩn nghiệp vụ: chỉ cho sửa trong N ngày đầu sau khi đăng
# Sau đó khóa lại — giống Shopee/Tiki, tránh user sửa review sau khi bị shop dụ
REVIEW_EDIT_DAYS = 7

# [AUDIT FIX HIGH-07] Regex validate số điện thoại VN
PHONE_REGEX = re.compile(r'^(\+84|0)\d{9,10}$')


def detect_image_type(file):
    """
    Tự phát hiện loại file ảnh dựa trên magic bytes (thay thế cho imghdr.what đã bị xóa ở Python 3.13)
    """
    try:
        position = file.tell()
        file.seek(0)
        header = file.read(12)
        file.seek(position)

        if header.startswith(b'\xff\xd8\xff'):
            return 'jpeg'
        if header.startswith(b'\x89PNG\r\n\x1a\n'):
            return 'png'
        if header.startswith(b'GIF87a') or header.startswith(b'GIF89a'):
            return 'gif'
        if header.startswith(b'RIFF') and len(header) >= 12 and header[8:12] == b'WEBP':
            return 'webp'
    except Exception:
        pass
    return None


def _check_review_editable(review):
    """Raise PermissionDenied nếu review đã quá thời hạn chỉnh sửa."""
    deadline = review.created_at + timezone.timedelta(days=REVIEW_EDIT_DAYS)
    if timezone.now() > deadline:
        raise PermissionDenied(
            f"Review chỉ được chỉnh sửa trong {REVIEW_EDIT_DAYS} ngày đầu. "
            f"Thời hạn đã hết vào {deadline.strftime('%d/%m/%Y %H:%M')}."
        )


# ─── ĐÁNH GIÁ SẢN PHẨM ──────────────────────────────────────────────────────
class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer

    # Tắt hoàn toàn DELETE — review không được xóa dù bởi ai
    # Lý do nghiệp vụ: review là bằng chứng trải nghiệm thật, tránh shop ép user xóa review xấu
    # Admin muốn ẩn review vi phạm → dùng action 'hide' thay vì xóa
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = Review.objects.select_related(
            'user', 'user__profile'
        ).prefetch_related(
            Prefetch(
                'media',
                queryset=ReviewMedia.objects.filter(delete_at__isnull=True)
            )
        ).order_by('-created_at')

        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        if self.action in ['manage_reply', 'hide', 'unhide']:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def get_object(self):
        # Admin dùng all_objects để thấy review bị ẩn, User dùng objects (ActiveManager).
        # Prefetch media luôn filter delete_at__isnull=True để tránh đếm sai khi upload.
        active_media_qs = ReviewMedia.objects.filter(delete_at__isnull=True)

        if self.request.user.is_staff:
            qs = Review.all_objects.select_related(
                'user', 'user__profile'
            ).prefetch_related(
                Prefetch('media', queryset=active_media_qs)
            )
        else:
            qs = Review.objects.select_related(
                'user', 'user__profile'
            ).prefetch_related(
                Prefetch('media', queryset=active_media_qs)
            )

        obj = get_object_or_404(qs, pk=self.kwargs['pk'])
        self.check_object_permissions(self.request, obj)

        # Chỉ cho sửa review của chính mình (trừ staff)
        if self.action in ['update', 'partial_update', 'manage_media']:
            if obj.user != self.request.user and not self.request.user.is_staff:
                raise PermissionDenied("Bạn không có quyền chỉnh sửa review này.")
        return obj

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        instance.delete_at = timezone.now()
        instance.delete_by = self.request.user
        instance.save(update_fields=['delete_at', 'delete_by'])

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        _check_review_editable(instance)
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.pop('partial', False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


    # ── ADMIN: ẨN REVIEW VI PHẠM ─────────────────────────────────────────────
    # Nghiệp vụ: review vi phạm (spam, chửi bới, fake) → admin ẩn đi
    # Không xóa vì cần giữ audit trail, có thể unhide nếu xử lý nhầm
    # delete_at dùng lại để đánh dấu "ẩn" — delete_by ghi lại admin nào ẩn
    @action(detail=True, methods=['POST'], url_path='hide')
    def hide(self, request, pk=None):
        review = self.get_object()

        if review.delete_at is not None:
            return Response(
                {"error": "Review này đã bị ẩn rồi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        review.delete_at = timezone.now()
        review.delete_by = request.user
        review.save(update_fields=['delete_at', 'delete_by'])
        return Response({"message": "Đã ẩn review thành công."}, status=status.HTTP_200_OK)

    # ── ADMIN: HIỆN LẠI REVIEW ĐÃ ẨN ────────────────────────────────────────
    # Nghiệp vụ: admin ẩn nhầm hoặc sau khi user giải trình → hiện lại
    @action(detail=True, methods=['POST'], url_path='unhide')
    def unhide(self, request, pk=None):
        review = self.get_object()

        if review.delete_at is None:
            return Response(
                {"error": "Review này đang hiển thị bình thường."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        review.delete_at = None
        review.delete_by = None
        review.save(update_fields=['delete_at', 'delete_by'])
        return Response(
            ReviewSerializer(review, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )

    # ── ADMIN: REPLY / XÓA REPLY ─────────────────────────────────────────────
    @action(detail=True, methods=['POST', 'DELETE'], url_path='reply')
    def manage_reply(self, request, pk=None):
        review = self.get_object()

        if request.method == 'DELETE':
            review.shop_reply      = None
            review.shop_replied_at = None
            review.shop_replied_by = None
            review.save(update_fields=['shop_reply', 'shop_replied_at', 'shop_replied_by'])
            return Response(status=status.HTTP_204_NO_CONTENT)

        content = request.data.get('content', '')
        if not content.strip():
            return Response({"error": "Nội dung reply không được để trống."}, status=400)

        if len(content) > 1000:
            return Response({"error": "Reply không được vượt quá 1000 ký tự."}, status=400)

        review.shop_reply      = content
        review.shop_replied_at = timezone.now()
        review.shop_replied_by = request.user
        review.save(update_fields=['shop_reply', 'shop_replied_at', 'shop_replied_by'])
        return Response(ReviewSerializer(review, context={'request': request}).data)

    # ── UPLOAD / XÓA MEDIA ───────────────────────────────────────────────────
    # Nghiệp vụ: upload/xóa media cũng bị chặn sau 7 ngày — cùng deadline với sửa nội dung
    @action(detail=True, methods=['POST', 'DELETE'], url_path='media')
    def manage_media(self, request, pk=None):
        review = self.get_object()

        # Kiểm tra thời hạn sửa trước khi thay đổi media
        _check_review_editable(review)

        # ── XÓA 1 FILE ──────────────────────────────────────────────────────
        if request.method == 'DELETE':
            media_id = request.data.get('media_id')
            if not media_id:
                return Response({'error': 'Cần truyền media_id trong Body.'}, status=400)
            try:
                media = review.media.get(pk=media_id)
            except ReviewMedia.DoesNotExist:
                return Response(
                    {'error': 'Không tìm thấy file hoặc file không thuộc review này.'},
                    status=404,
                )

            # Xóa mềm Media
            media.delete_at = timezone.now()
            media.delete_by = request.user
            media.save(update_fields=['delete_at', 'delete_by'])
            return Response(status=status.HTTP_204_NO_CONTENT)

        file = request.FILES.get('file')
        if not file:
            return Response(
                {'error_code': 'NO_FILE', 'message': 'Chưa chọn file.'},
                status=400,
            )

        content_type = (file.content_type or '').lower()
        file_name = file.name or ''
        ext = os.path.splitext(file_name)[1].lower()


        if ext in ALLOWED_IMAGE_EXT:
            media_type = 'image'
        elif ext in ALLOWED_VIDEO_EXT:
            media_type = 'video'
        else:
            return Response(
                {
                    'error_code': 'UNSUPPORTED_TYPE',
                    'message': 'Chỉ hỗ trợ ảnh (.jpg/.png/.webp) và video (.mp4/.mov).',
                },
                status=400,
            )

        allowed_types = ALLOWED_IMAGE_TYPES if media_type == 'image' else ALLOWED_VIDEO_TYPES
        if content_type not in allowed_types:
            return Response(
                {'error_code': 'MIME_MISMATCH', 'message': 'Loại file không hợp lệ.'},
                status=400,
            )

        # Validate magic bytes để chống MIME spoofing
        if media_type == 'image':
            detected = detect_image_type(file)
            if detected not in {'jpeg', 'png', 'webp', 'gif'}:
                return Response(
                    {'error_code': 'UNSUPPORTED_TYPE', 'message': 'File ảnh không hợp lệ hoặc bị giả mạo.'},
                    status=400,
                )


        if media_type == 'image' and file.size > MAX_IMAGE_SIZE:
            return Response(
                {'error_code': 'FILE_TOO_LARGE', 'message': 'Ảnh không được vượt quá 5MB.'},
                status=400,
            )
        if media_type == 'video' and file.size > MAX_VIDEO_SIZE:
            return Response(
                {'error_code': 'FILE_TOO_LARGE', 'message': 'Video không được vượt quá 50MB.'},
                status=400,
            )

        # Đếm media bằng query DB trực tiếp để tránh đếm sai do cache prefetch hoặc race condition.
        media_counts = {
            item['media_type']: item['count']
            for item in ReviewMedia.objects.filter(
                review=review,
                delete_at__isnull=True,
            ).values('media_type').annotate(count=Count('id'))
        }
        if media_type == 'image' and media_counts.get('image', 0) >= 5:
            return Response(
                {'error_code': 'MEDIA_LIMIT_EXCEEDED', 'message': 'Tối đa 5 ảnh mỗi review.'},
                status=400,
            )
        if media_type == 'video' and media_counts.get('video', 0) >= 1:
            return Response(
                {'error_code': 'MEDIA_LIMIT_EXCEEDED', 'message': 'Tối đa 1 video mỗi review.'},
                status=400,
            )

        media = ReviewMedia.objects.create(
            review=review,
            file=file,
            media_type=media_type,
        )
        return Response(
            ReviewMediaSerializer(media, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

# ─── THÔNG TIN NGƯỜI DÙNG ───────────────────────────────────────────────────────
class UserProfileViewSet(viewsets.ModelViewSet):
    serializer_class   = UserProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return UserProfile.objects.filter(user=self.request.user)


# ─── ĐỊA CHỈ GIAO HÀNG ──────────────────────────────────────────────────────
class AddressViewSet(viewsets.ModelViewSet):
    serializer_class   = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(
            user=self.request.user
        ).order_by('-is_default', '-created_at')

    def perform_create(self, serializer):
        # Bọc transaction để tránh mất trạng thái default nếu save fail
        is_default = self.request.data.get('is_default', False)
        with transaction.atomic():
            if is_default:
                Address.objects.filter(user=self.request.user).update(is_default=False)
            serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        # Bọc transaction để tránh mất trạng thái default nếu save fail
        is_default = self.request.data.get('is_default', False)
        with transaction.atomic():
            if is_default:
                Address.objects.filter(user=self.request.user).update(is_default=False)
            serializer.save()

    @action(detail=True, methods=['POST'])
    def set_default(self, request, pk=None):
        address = self.get_object()
        with transaction.atomic():
            Address.objects.filter(user=request.user).update(is_default=False)
            address.is_default = True
            address.save(update_fields=['is_default'])
        return Response({'message': 'Đặt địa chỉ mặc định thành công.'})


# ─── THÔNG TIN CÁ NHÂN GỘP ───────────────────────────────────────────────────
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = MeSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    def patch(self, request):
        user    = request.user
        data    = request.data
        profile, _ = UserProfile.objects.get_or_create(user=user)

        if 'name' in data:
            user.first_name = data['name']
        user.save()

        if 'phone' in data:
            # [AUDIT FIX HIGH-07] Validate phone format
            phone = str(data['phone']).strip()
            if phone and not PHONE_REGEX.match(phone):
                return Response(
                    {"error": "Số điện thoại không hợp lệ. Định dạng: 0xxxxxxxxx hoặc +84xxxxxxxxx"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            profile.phone = phone

        if 'avatar' in request.FILES:
            file = request.FILES['avatar']
            # Khóa dung lượng ảnh 5MB chống Spam DoS
            if file.size > MAX_IMAGE_SIZE:
                return Response(
                    {"error": "Ảnh đại diện tải lên quá lớn, tối đa 5MB!"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            ext = os.path.splitext(file.name or '')[1].lower()
            if ext not in ALLOWED_IMAGE_EXT:
                return Response(
                    {"error": "Chỉ hỗ trợ định dạng ảnh (.jpg, .png, .webp, .gif)"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # [AUDIT FIX HIGH-06] Validate MIME type
            content_type = (file.content_type or '').lower()
            if content_type not in ALLOWED_IMAGE_TYPES:
                return Response(
                    {"error": "MIME type ảnh không hợp lệ."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # [AUDIT FIX HIGH-06] Validate magic bytes chống MIME spoofing
            detected = detect_image_type(file)
            if detected not in {'jpeg', 'png', 'webp', 'gif'}:
                return Response(
                    {"error": "File ảnh không hợp lệ hoặc bị giả mạo."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            profile.avatar_url = file

        profile.save()

        serializer = MeSerializer(user, context={'request': request})
        return Response(serializer.data)


# ─── BẬT/TẮT NHẬN MAIL CẢNH BÁO TỒN KHO ────────────────────────────────────
class StockAlertToggleView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        user = request.user

        if not (user.is_staff or user.is_superuser):
            return Response(
                {"error": "Tài khoản không được phép cài đặt thông báo này."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if 'receive_stock_alerts' not in request.data:
            return Response(
                {"error": "Trường receive_stock_alerts là bắt buộc."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = UserProfile.objects.get_or_create(user=user)

        val = request.data['receive_stock_alerts']
        if isinstance(val, str):
            val = val.lower() == 'true'
        if not isinstance(val, bool):
            return Response(
                {"error": "Dữ liệu phải có định dạng boolean."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile.receive_stock_alerts = val
        profile.save(update_fields=['receive_stock_alerts'])

        return Response({
            "message": "Cập nhật tuỳ chọn cảnh báo thành công.",
            "receive_stock_alerts": profile.receive_stock_alerts,
        })


# ─── PROXY ĐỊNH VỊ NGƯỢC (REVERSE GEOCODING PROXY) ──────────────────────────
# Dùng để bypass CORS trên trình duyệt Web khi gọi Nominatim OpenStreetMap
def _reverse_geocode_cache_key(lat: float, lng: float) -> str:
    return f"reverse_geocode:{round(lat, 5)}:{round(lng, 5)}"


def _fallback_reverse_geocode_payload(lat: float, lng: float) -> dict:
    display_name = f"V\u1ecb tr\u00ed \u0111\u00e3 ch\u1ecdn ({lat:.6f}, {lng:.6f})"
    return {
        "place_id": None,
        "lat": str(lat),
        "lon": str(lng),
        "display_name": display_name,
        "name": "V\u1ecb tr\u00ed \u0111\u00e3 ch\u1ecdn",
        "address": {
            "road": display_name,
            "country": "Vi\u1ec7t Nam",
        },
        "source": "fallback",
    }


def _distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_m = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lng / 2) ** 2
    )
    return earth_radius_m * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _remember_reverse_geocode_result(lat: float, lng: float, data: dict) -> None:
    cached = {**data, "source": data.get("source") or "nominatim"}
    cache.set(_reverse_geocode_cache_key(lat, lng), cached, timeout=60 * 60 * 24)

    RECENT_REVERSE_GEOCODE_RESULTS.append({
        "lat": lat,
        "lng": lng,
        "data": cached,
    })
    del RECENT_REVERSE_GEOCODE_RESULTS[:-MAX_RECENT_REVERSE_GEOCODE_RESULTS]


def _get_nearby_reverse_geocode_result(lat: float, lng: float) -> dict | None:
    cached = cache.get(_reverse_geocode_cache_key(lat, lng))
    if isinstance(cached, dict):
        return {**cached, "source": "cache"}

    nearest = None
    nearest_distance = None
    for item in RECENT_REVERSE_GEOCODE_RESULTS:
        distance = _distance_meters(lat, lng, item["lat"], item["lng"])
        if nearest_distance is None or distance < nearest_distance:
            nearest = item["data"]
            nearest_distance = distance

    if nearest is not None and nearest_distance is not None and nearest_distance <= 1200:
        return {**nearest, "source": "nearby-cache"}

    return None


def _reverse_geocode_with_photon(lat: float, lng: float) -> dict | None:
    response = requests.get(
        "https://photon.komoot.io/reverse",
        params={"lat": lat, "lon": lng},
        headers={
            "User-Agent": "MiniMartApp/1.0 (nguyentruong23082005@gmail.com)",
            "Accept": "application/json",
        },
        timeout=5,
    )
    response.raise_for_status()
    data = response.json()
    feature = (data.get("features") or [None])[0]
    if not isinstance(feature, dict):
        return None

    props = feature.get("properties") or {}
    geometry = feature.get("geometry") or {}
    coordinates = geometry.get("coordinates") or [lng, lat]
    photon_lng = coordinates[0] if len(coordinates) > 0 else lng
    photon_lat = coordinates[1] if len(coordinates) > 1 else lat

    street_parts = [
        props.get("housenumber"),
        props.get("street"),
        props.get("name") if props.get("name") != props.get("street") else None,
    ]
    street = " ".join(str(part).strip() for part in street_parts if part)
    display_parts = [
        street,
        props.get("district"),
        props.get("city"),
        props.get("postcode"),
        props.get("country"),
    ]
    display_name = ", ".join(str(part).strip() for part in display_parts if part)

    if not display_name:
        return None

    return {
        "place_id": props.get("osm_id"),
        "lat": str(photon_lat),
        "lon": str(photon_lng),
        "display_name": display_name,
        "name": props.get("name") or street or display_name,
        "address": {
            "house_number": props.get("housenumber") or "",
            "road": props.get("street") or props.get("name") or "",
            "district": props.get("district") or "",
            "city": props.get("city") or "",
            "postcode": props.get("postcode") or "",
            "country": props.get("country") or "",
            "country_code": props.get("countrycode") or "",
        },
        "source": "photon",
    }


class ReverseGeocodeProxyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        lat_raw = request.query_params.get('lat')
        lng_raw = request.query_params.get('lng')
        if not lat_raw or not lng_raw:
            return Response({"error": "Missing lat or lng"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lat = float(lat_raw)
            lng = float(lng_raw)
        except (TypeError, ValueError):
            return Response({"error": "Invalid lat or lng"}, status=status.HTTP_400_BAD_REQUEST)

        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            return Response({"error": "Coordinates out of range"}, status=status.HTTP_400_BAD_REQUEST)

        fallback_payload = _fallback_reverse_geocode_payload(lat, lng)
        cached_payload = _get_nearby_reverse_geocode_result(lat, lng)
        if cached_payload:
            cached_payload.setdefault("requested_lat", str(lat))
            cached_payload.setdefault("requested_lon", str(lng))
            return Response(cached_payload, status=status.HTTP_200_OK)

        try:
            response = requests.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "format": "jsonv2",
                    "lat": lat,
                    "lon": lng,
                    "accept-language": "vi",
                    "addressdetails": 1,
                },
                headers={
                    "User-Agent": "MiniMartApp/1.0 (nguyentruong23082005@gmail.com)",
                    "Accept": "application/json",
                },
                timeout=5,
            )
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Reverse geocode proxy fallback for lat=%s lng=%s: %s", lat, lng, exc)
            try:
                photon_payload = _reverse_geocode_with_photon(lat, lng)
                if photon_payload:
                    _remember_reverse_geocode_result(lat, lng, photon_payload)
                    return Response(photon_payload, status=status.HTTP_200_OK)
            except (requests.RequestException, ValueError) as photon_exc:
                logger.warning("Photon reverse geocode fallback failed for lat=%s lng=%s: %s", lat, lng, photon_exc)

            cached_payload = _get_nearby_reverse_geocode_result(lat, lng)
            if cached_payload:
                cached_payload.setdefault("requested_lat", str(lat))
                cached_payload.setdefault("requested_lon", str(lng))
                return Response(cached_payload, status=status.HTTP_200_OK)
            return Response(fallback_payload, status=status.HTTP_200_OK)

        if not isinstance(data, dict) or not data.get("display_name"):
            try:
                photon_payload = _reverse_geocode_with_photon(lat, lng)
                if photon_payload:
                    _remember_reverse_geocode_result(lat, lng, photon_payload)
                    return Response(photon_payload, status=status.HTTP_200_OK)
            except (requests.RequestException, ValueError) as photon_exc:
                logger.warning("Photon reverse geocode fallback failed for lat=%s lng=%s: %s", lat, lng, photon_exc)
            return Response(fallback_payload, status=status.HTTP_200_OK)

        data.setdefault("lat", str(lat))
        data.setdefault("lon", str(lng))
        data.setdefault("address", fallback_payload["address"])
        data["source"] = "nominatim"
        _remember_reverse_geocode_result(lat, lng, data)
        return Response(data, status=status.HTTP_200_OK)
