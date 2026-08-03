from django.db import models
from django.contrib.auth.models import User

from .base import ActiveManager


class UserProfile(models.Model):
    user                 = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    phone                = models.CharField(max_length=20, blank=True)
    avatar_url           = models.ImageField(upload_to='avatars/', blank=True, null=True)
    receive_stock_alerts = models.BooleanField(default=False)
    firebase_uid         = models.CharField(max_length=128, unique=True, null=True, blank=True)

    class Meta:
        verbose_name        = "Hồ sơ người dùng"
        verbose_name_plural = "Hồ sơ người dùng"

    def __str__(self):
        return self.user.username


class Address(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='addresses')
    full_name  = models.CharField(max_length=100)
    phone      = models.CharField(max_length=20)
    province   = models.CharField(max_length=100)
    district   = models.CharField(max_length=100)
    street     = models.TextField()
    note       = models.TextField(blank=True, null=True)
    is_default = models.BooleanField(default=False)
    lat        = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    lng        = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    delete_at  = models.DateTimeField(null=True, blank=True)
    delete_by  = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name        = "Địa chỉ"
        verbose_name_plural = "Địa chỉ"

    def __str__(self):
        return f"{self.full_name} - {self.street}, {self.district}"
