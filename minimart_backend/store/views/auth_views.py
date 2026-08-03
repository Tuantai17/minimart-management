import hmac
import secrets
import logging
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.request import Request
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken
from firebase_admin import auth as firebase_auth
from core.firebase import is_firebase_ready
from django.db import transaction, DatabaseError
from smtplib import SMTPException
from ..models import UserProfile
from ..serializers import (
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    VerifyOTPSerializer,
    ResetPasswordSerializer,
)

logger = logging.getLogger(__name__)


# ─── LOGIN ───────────────────────────────────────────────────────────────────
# Thêm throttle chống brute-force (rate limit ở settings.py)
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_login'


# ─── ĐĂNG KÝ ─────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def register(request: Request) -> Response:
    request.throttle_scope = 'auth_register'
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response({'message': 'Đăng kí thành công!'}, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── ĐỔI MẬT KHẨU ────────────────────────────────────────────────────────────
def _blacklist_user_tokens(user: User) -> None:
    """Thu hồi tất cả JWT outstanding tokens của user. Gọi sau khi đổi mật khẩu thành công."""
    try:
        # [AUDIT FIX HIGH-03] Dùng bulk_create thay vì loop get_or_create → 1 query thay N queries
        tokens = OutstandingToken.objects.filter(user=user)
        existing_ids = set(
            BlacklistedToken.objects.filter(token__in=tokens)
            .values_list('token_id', flat=True)
        )
        new_blacklisted = [
            BlacklistedToken(token=t) for t in tokens if t.id not in existing_ids
        ]
        if new_blacklisted:
            BlacklistedToken.objects.bulk_create(new_blacklisted, ignore_conflicts=True)
        logger.info("Blacklisted %d outstanding token(s) for user_id=%s", tokens.count(), user.id)
    except DatabaseError:
        # Không crash đổi mật khẩu nếu blacklist thất bại
        logger.exception("Failed to blacklist tokens for user_id=%s", user.id)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    
    # Áp dụng ScopedRateThrottle chống Brute-Force mật khẩu cũ
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_reset'

    def post(self, request: Request) -> Response:
        serializer = ChangePasswordSerializer(data=request.data)
        if serializer.is_valid():
            user = request.user
            # Kiểm tra old_password trước để tránh lộ thông tin "đúng mật khẩu nhưng trùng"
            if not user.check_password(serializer.data['old_password']):
                return Response({"error": "Mật khẩu cũ không đúng!"}, status=status.HTTP_400_BAD_REQUEST)
            if serializer.data['old_password'] == serializer.data['new_password']:
                return Response({"error": "Mật khẩu mới không được trùng với mật khẩu cũ!"}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(serializer.data['new_password'])
            user.save()
            # Blacklist tất cả phiên cũ để token cũ bị thu hồi ngay lập tức
            _blacklist_user_tokens(user)
            logger.info("User changed password successfully: user_id=%s", user.id)
            return Response({"message": "Đổi mật khẩu thành công!"})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─── QUÊN MẬT KHẨU — Bước 1: Gửi OTP ───────────────────────────────────────
class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_forgot'

    # Dùng thông điệp chung để chống lỗi User Enumeration
    _GENERIC_MSG = {"message": "Nếu tài khoản tồn tại và có email, mã OTP đã được gửi."}

    def post(self, request: Request) -> Response:
        serializer = ForgotPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.data['username']
        user = User.objects.filter(username=username).first()

        if not user or not user.email:
            return Response(self._GENERIC_MSG, status=status.HTTP_200_OK)

        # Dùng CSPRNG thay vì Mersenne Twister để sinh OTP an toàn
        otp = str(secrets.randbelow(900000) + 100000)
        cache.set(f"otp_{username}", otp, timeout=300)

        # Chỉ log OTP trong DEBUG
        if settings.DEBUG:
            logger.info(">>> [AUTH-DEBUG] Generated OTP for %s: %s", username, otp)

        try:
            send_mail(
                subject="[MiniMart] Mã OTP đặt lại mật khẩu",
                message=f"Chào {username},\n\nMã OTP của bạn là: {otp}\nMã có hiệu lực trong 5 phút.",
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[user.email],
                fail_silently=False,
            )
        except SMTPException:
            logger.exception("Email failed for user_id=%s", user.id)

        # Luôn trả về _GENERIC_MSG để chống enumeration
        return Response(self._GENERIC_MSG)


# ─── QUÊN MẬT KHẨU — Bước 2: Kiểm tra OTP ──────────────────────────────────
class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_verify'

    def post(self, request: Request) -> Response:
        serializer = VerifyOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.data['username']
        otp = serializer.data['otp']
        cached_otp = cache.get(f"otp_{username}")

        if cached_otp is None:
            return Response({"error": "Mã OTP đã hết hạn. Vui lòng yêu cầu lại!"}, status=status.HTTP_400_BAD_REQUEST)

        # Chống Timing Attack — so sánh constant-time
        if not hmac.compare_digest(cached_otp, otp):
            return Response({"error": "Mã OTP không đúng!"}, status=status.HTTP_400_BAD_REQUEST)

        # Xóa OTP ngay sau verify — chống Replay Attack
        cache.delete(f"otp_{username}")

        # Phát hành one-time reset_token ngẫu nhiên (32 bytes từ CSPRNG) thay thế boolean flag:
        # - Boolean flag gắn vào username → ai biết username đã verify đều dùng được
        # - reset_token là giá trị bí mật → phải trình lại đúng token mới reset được
        reset_token = secrets.token_urlsafe(32)
        cache.set(f"reset_token_{username}", reset_token, timeout=300)

        return Response({"message": "OTP hợp lệ!", "reset_token": reset_token})


# ─── QUÊN MẬT KHẨU — Bước 3: Đặt lại mật khẩu mới ─────────────────────────
class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_reset'

    def post(self, request: Request) -> Response:
        serializer = ResetPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.data['username']
        submitted_token = serializer.data['reset_token']
        new_password = serializer.data['new_password']

        # Xác minh one-time reset_token
        cached_token = cache.get(f"reset_token_{username}")
        if not cached_token or not hmac.compare_digest(str(cached_token), str(submitted_token)):
            return Response(
                {"error": "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng bắt đầu lại."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Xử lý DoesNotExist để tránh lỗi 500 nếu user bị xóa trong lúc reset
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"error": "Tài khoản không tồn tại."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        cache.delete(f"reset_token_{username}")
        logger.info("User reset password via OTP successfully: username=%s", username)
        return Response({"message": "Đặt lại mật khẩu thành công!"})


# ─── ĐĂNG NHẬP FIREBASE (SOCIAL LOGIN) ───────────────────────────────────────
class FirebaseLoginView(APIView):
    """
    POST /api/auth/firebase/
    Đăng nhập bằng Firebase ID Token (Google, Facebook, Phone, etc.)
    FE truyền lên `{ "id_token": "..." }`
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_login'

    def post(self, request: Request) -> Response:
        id_token = request.data.get('id_token')
        if not id_token:
            return Response({"error": "Thiếu id_token"}, status=status.HTTP_400_BAD_REQUEST)

        if not is_firebase_ready():
            return Response(
                {"error": "Tính năng đăng nhập Social hiện không khả dụng."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        try:
            # Verify token với Firebase (SDK tự cache public key, check expiry, signature)
            decoded_token = firebase_auth.verify_id_token(id_token)
            uid = decoded_token.get('uid')
            email = decoded_token.get('email', '')
            email_verified = decoded_token.get('email_verified', False)
            name = decoded_token.get('name', '')
            picture = decoded_token.get('picture', '')

            if not uid:
                return Response({"error": "Token không hợp lệ (thiếu UID)"}, status=status.HTTP_400_BAD_REQUEST)

            with transaction.atomic():
                user = User.objects.filter(profile__firebase_uid=uid).first()

                if not user:
                    # Ngăn chặn Account Takeover bằng cách chỉ link với email đã xác thực
                    if email and email_verified:
                        user = User.objects.filter(email=email).first()

                    if user:
                        user.profile.firebase_uid = uid
                        user.profile.save(update_fields=['firebase_uid'])
                        logger.info("Linked existing user %s to Firebase UID %s", user.id, uid)
                    else:
                        # Tạo username ngẫu nhiên tránh trùng lặp
                        username = f"fb_{uid[:8]}_{secrets.token_hex(4)}"
                        user = User.objects.create(
                            username=username,
                            email=email,
                            first_name=name[:30]
                        )
                        # Chặn đăng nhập bằng mật khẩu thường cho user Social
                        user.set_unusable_password()
                        user.save()

                        profile = UserProfile.objects.create(
                            user=user,
                            firebase_uid=uid
                        )
                        if picture:
                            # Tạm thời chỉ lưu URL gốc, nếu cần có thể tải về ImageField
                            pass
                        logger.info("Created new user %s from Firebase Social Login", user.id)

            refresh = RefreshToken.for_user(user)

            return Response({
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'is_active': user.is_active,
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'name': user.first_name or user.username,
                    'full_name': user.get_full_name() or user.username,
                    'is_staff': user.is_staff,
                    'is_superuser': user.is_superuser,
                    'is_active': user.is_active,
                }
            }, status=status.HTTP_200_OK)

        except firebase_auth.InvalidIdTokenError:
            return Response({"error": "Firebase token không hợp lệ"}, status=status.HTTP_401_UNAUTHORIZED)
        except firebase_auth.ExpiredIdTokenError:
            return Response({"error": "Firebase token đã hết hạn"}, status=status.HTTP_401_UNAUTHORIZED)
        except firebase_auth.FirebaseError:
            logger.exception("Lỗi đăng nhập Firebase")
            return Response({"error": "Lỗi xác thực. Vui lòng thử lại."}, status=status.HTTP_401_UNAUTHORIZED)

