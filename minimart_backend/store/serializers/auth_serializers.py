from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from ..models import UserProfile


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):

    # Chuyển thông báo lỗi sang Tiếng Việt
    default_error_messages = {
        'no_active_account': 'Tài khoản của bạn đã bị khóa hoặc sai thông tin. Vui lòng liên hệ Admin!'
    }

    def validate(self, attrs):
        data = super().validate(attrs)  # Chạy login gốc + tự check is_active
        data['is_staff'] = self.user.is_staff
        data['is_superuser'] = self.user.is_superuser
        data['is_active'] = self.user.is_active
        return data


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField()
    phone = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=6)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if User.objects.filter(username=data['email']).exists():
            raise serializers.ValidationError({'email': 'Email này đã được sử dụng'})
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Mật khẩu không khớp'})
        # Kiểm tra mật khẩu yếu bằng Django validators
        try:
            validate_password(data['password'])
        except DjangoValidationError as e:
            raise serializers.ValidationError({'password': list(e.messages)})
        return data

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data['full_name']
        )
        UserProfile.objects.create(
            user=user,
            phone=validated_data['phone']
        )
        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=6)
    confirm_password = serializers.CharField(required=True)

    def validate(self, data):
        if data.get('new_password') != data.get('confirm_password'):
            raise serializers.ValidationError({'confirm_password': 'Mật khẩu mới không khớp.'})
            
        # Chặn mật khẩu yếu
        try:
            validate_password(data['new_password'])
        except DjangoValidationError as e:
            raise serializers.ValidationError({'new_password': list(e.messages)})
        return data


class ForgotPasswordSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)


class VerifyOTPSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)


# ResetPasswordSerializer dùng reset_token (one-time token) thay cho OTP
class ResetPasswordSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    reset_token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=6)
    confirm_password = serializers.CharField(required=True)

    def validate(self, data):
        if data.get('new_password') != data.get('confirm_password'):
            raise serializers.ValidationError({'confirm_password': 'Mật khẩu mới không khớp.'})
            
        # Chặn mật khẩu yếu
        try:
            validate_password(data['new_password'])
        except DjangoValidationError as e:
            raise serializers.ValidationError({'new_password': list(e.messages)})
        return data
