from decimal import Decimal

from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError

from .base import ActiveManager


class Voucher(models.Model):
    """Mã giảm giá. Deactivate bằng is_active=False, không soft-delete."""

    DISCOUNT_TYPE_CHOICES = [
        ('PERCENT', 'Giảm theo phần trăm'),
        ('FIXED',   'Giảm số tiền cố định'),
    ]

    code = models.CharField(
        max_length=50, unique=True, db_index=True,
        help_text="Mã giảm giá. Tự động normalize UPPERCASE khi lưu."
    )
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE_CHOICES)
    discount_value = models.DecimalField(
        max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text="PERCENT: 0-100. FIXED: số tiền VNĐ."
    )
    max_discount_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="[Chỉ dùng với PERCENT] Mức giảm tối đa (VNĐ). NULL = không giới hạn."
    )
    min_order_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
        help_text="Giá trị đơn tối thiểu để áp dụng mã."
    )
    start_date = models.DateTimeField()
    end_date   = models.DateTimeField()

    max_usage = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Tổng lượt dùng tối đa. NULL = không giới hạn."
    )
    # Tăng usage_count bằng F('usage_count') + 1 trong transaction.atomic() để tránh race condition
    usage_count = models.PositiveIntegerField(default=0)
    max_usage_per_user = models.PositiveIntegerField(
        default=1,
        help_text="Số lượt tối đa mỗi user. Mặc định: 1."
    )

    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    class Meta:
        verbose_name        = "Mã giảm giá"
        verbose_name_plural = "Mã giảm giá"
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['end_date']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"[{self.discount_type}] {self.code}"


class UserVoucher(models.Model):
    """Voucher đã được user claim vào ví."""

    STATUS_CHOICES = (
        ('active', 'Active'),
        ('used', 'Used'),
        ('expired', 'Expired'),
        ('invalid', 'Invalid'),
    )

    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='wallet_vouchers')
    voucher    = models.ForeignKey(Voucher, on_delete=models.CASCADE, related_name='claimed_users')
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    claimed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = "Ví Voucher"
        verbose_name_plural = "Ví Voucher"
        unique_together     = ('user', 'voucher')

    def __str__(self):
        return f"{self.user.username} - {self.voucher.code} ({self.status})"


class UserVoucherUsage(models.Model):
    """
    Audit log mỗi lần user dùng voucher thành công.
    Append-only — không xóa kể cả khi đơn bị hủy.
    """

    user    = models.ForeignKey(User, on_delete=models.CASCADE, related_name='voucher_usages')
    voucher = models.ForeignKey(Voucher, on_delete=models.CASCADE, related_name='user_usages')
    order   = models.OneToOneField(
        'Order', on_delete=models.CASCADE,
        related_name='voucher_usage',
        help_text="1 đơn hàng chỉ được áp dụng 1 voucher."
    )
    used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = "Lịch sử dùng mã"
        verbose_name_plural = "Lịch sử dùng mã"
        unique_together     = ('user', 'voucher', 'order')
        indexes             = [models.Index(fields=['user', 'voucher'])]

    def __str__(self):
        return f"User#{self.user_id} dùng [{self.voucher.code}] → Order#{self.order_id}"
