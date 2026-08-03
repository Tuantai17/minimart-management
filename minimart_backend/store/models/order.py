from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator

from .base import ActiveManager
from .product import Product


class Cart(models.Model):
    user       = models.OneToOneField(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    delete_at  = models.DateTimeField(null=True, blank=True)
    delete_by  = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name        = "Giỏ hàng"
        verbose_name_plural = "Giỏ hàng"


class CartItem(models.Model):
    cart       = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    product    = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity   = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)  # Giá snapshot lúc thêm giỏ
    delete_at  = models.DateTimeField(null=True, blank=True)
    delete_by  = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        unique_together     = ('cart', 'product')
        verbose_name        = "Sản phẩm trong giỏ"
        verbose_name_plural = "Sản phẩm trong giỏ"


PAYMENT_METHOD_CHOICES = [
    ('COD',  'Thanh toán khi nhận hàng'),
    ('VNPAY', 'Cổng thanh toán VNPAY'),
]

PAYMENT_STATUS_CHOICES = [
    ('UNPAID',   'Chưa thanh toán'),
    ('PAID',     'Đã thanh toán'),
    ('FAILED',   'Thanh toán thất bại'),
    ('REFUNDED', 'Đã hoàn tiền'),
]


class Order(models.Model):
    STATUS_CHOICES = [
        ('PENDING',   'Chờ xử lý'),
        ('CONFIRMED', 'Đã xác nhận'),
        ('SHIPPING',  'Đang giao hàng'),
        ('COMPLETED', 'Hoàn thành'),
        ('CANCELLED', 'Đã hủy'),
    ]

    user           = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    order_code     = models.CharField(max_length=20, unique=True)
    receiver_name  = models.CharField(max_length=200)
    receiver_phone = models.CharField(max_length=20)
    address_text   = models.TextField()

    subtotal        = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_fee    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    voucher         = models.ForeignKey(
        'Voucher', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='orders',
        help_text="Voucher đã áp dụng (nếu có)."
    )
    discount_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text="total = subtotal + shipping_fee - discount_amount"
    )
    total_amount    = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    note        = models.TextField(blank=True, null=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Thời điểm xác nhận hoàn thành đơn hàng (dùng cho báo cáo doanh thu)."
    )

    delivery_lat = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    delivery_lng = models.DecimalField(max_digits=11, decimal_places=8, null=True, blank=True)
    distance_km  = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    # ─── PAYMENT ─────────────────────────────────────────────────────────────
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='COD',
        help_text="Phương thức thanh toán khách chọn lúc đặt hàng."
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default='UNPAID',
        help_text="Trạng thái thanh toán: UNPAID → PAID / FAILED / REFUNDED."
    )
    transaction_id = models.CharField(
        max_length=100, null=True, blank=True, db_index=True,
        help_text="Mã giao dịch cổng thanh toán (transId/vnp_TransactionNo) — dùng đối soát tài chính."
    )
    payment_log = models.JSONField(
        null=True, blank=True,
        help_text="Raw JSON từ IPN — dùng giải quyết khiếu nại."
    )

    delete_at = models.DateTimeField(null=True, blank=True)
    delete_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name        = "Đơn hàng"
        verbose_name_plural = "Đơn hàng"


class OrderItem(models.Model):
    order                 = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product               = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    product_name_snapshot = models.CharField(max_length=200)  # Tên sản phẩm tại thời điểm mua
    unit_price            = models.DecimalField(max_digits=12, decimal_places=2)
    quantity              = models.PositiveIntegerField()
    subtotal              = models.DecimalField(max_digits=12, decimal_places=2)
    delete_at             = models.DateTimeField(null=True, blank=True)
    delete_by             = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name        = "Sản phẩm trong đơn"
        verbose_name_plural = "Sản phẩm trong đơn"
