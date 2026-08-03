from django.db import models
from django.contrib.auth.models import User

from .base import ActiveManager


class SupportTicket(models.Model):
    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='support_tickets')
    is_resolved = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    delete_at   = models.DateTimeField(null=True, blank=True)
    delete_by   = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name        = "Yêu cầu hỗ trợ"
        verbose_name_plural = "Yêu cầu hỗ trợ"


class SupportMessage(models.Model):
    ticket         = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name='messages')
    sender_user    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    is_admin_reply = models.BooleanField(default=False)
    message        = models.TextField()
    is_read        = models.BooleanField(default=False)
    created_at     = models.DateTimeField(auto_now_add=True)
    delete_at      = models.DateTimeField(null=True, blank=True)
    delete_by      = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        ordering            = ['created_at']
        verbose_name        = "Tin nhắn hỗ trợ"
        verbose_name_plural = "Tin nhắn hỗ trợ"

    def __str__(self):
        sender = self.sender_user.username if self.sender_user else "Ẩn danh"
        prefix = "👑 ADMIN" if self.is_admin_reply else "👤 KHÁCH"
        return f"{prefix}: {sender}"
