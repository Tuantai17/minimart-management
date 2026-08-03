import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.request import Request

from store.models import FCMDevice
from store.serializers.device_serializers import FCMDeviceRegisterSerializer

logger = logging.getLogger(__name__)


class FCMDeviceRegisterView(APIView):
    """
    POST /api/devices/
    Đăng ký hoặc cập nhật FCM token cho thiết bị hiện tại.
    FE gọi sau khi nhận được FCM registration token từ Firebase SDK.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = FCMDeviceRegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        token       = serializer.validated_data['token']
        device_type = serializer.validated_data['device_type']

        # Upsert: token đã tồn tại → cập nhật user + device_type + is_active
        device, created = FCMDevice.objects.update_or_create(
            token=token,
            defaults={
                'user':        request.user,
                'device_type': device_type,
                'is_active':   True,
            }
        )

        logger.info(
            "FCM device %s: user_id=%s token=%s...%s",
            "registered" if created else "updated",
            request.user.id,
            token[:8],
            token[-4:],
        )

        return Response(
            {'detail': 'Đăng ký thiết bị thành công.'},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class FCMDeviceUnregisterView(APIView):
    """
    DELETE /api/devices/{token}/
    Hủy đăng ký FCM token (khi user logout hoặc gỡ app).
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request: Request, token: str) -> Response:
        deleted, _ = FCMDevice.objects.filter(
            token=token,
            user=request.user,
        ).update(is_active=False), None

        logger.info(
            "FCM device deactivated: user_id=%s token=%s...%s",
            request.user.id, token[:8], token[-4:],
        )

        return Response(status=status.HTTP_204_NO_CONTENT)
