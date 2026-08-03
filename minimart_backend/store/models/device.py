from django.db import models
from django.contrib.auth.models import User


class FCMDevice(models.Model):
    """
    Lưu FCM registration token của mỗi thiết bị người dùng.
    Mỗi user có thể có nhiều thiết bị (mobile + web).
    """

    DEVICE_TYPES = [
        ('android', 'Android'),
        ('ios', 'iOS'),
        ('web', 'Web Browser'),
    ]

    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='fcm_devices')
    token       = models.CharField(max_length=255, unique=True, db_index=True)
    device_type = models.CharField(max_length=10, choices=DEVICE_TYPES, default='android')
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = 'Thiết bị FCM'
        verbose_name_plural = 'Thiết bị FCM'
        indexes = [
            models.Index(fields=['user', 'is_active']),
        ]

    def __str__(self):
        return f"{self.user.username} — {self.device_type} ({'active' if self.is_active else 'inactive'})"
