from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator

from .base import ActiveManager


class Category(models.Model):
    name        = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    image       = models.ImageField(upload_to='categories/', blank=True, null=True)
    parent      = models.ForeignKey(
        'self', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='children'
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    delete_at   = models.DateTimeField(null=True, blank=True)
    delete_by   = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name        = "Danh mục"
        verbose_name_plural = "Danh mục"

    def __str__(self):
        return self.name


class Product(models.Model):
    category       = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    name           = models.CharField(max_length=200)
    sku            = models.CharField(max_length=50, unique=True, null=True, blank=True)
    price          = models.DecimalField(max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
    discount_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    stock_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    unit           = models.CharField(max_length=50, help_text="chai, hộp, kg...")
    description    = models.TextField(blank=True, null=True)
    image          = models.ImageField(upload_to='products/', blank=True, null=True)
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at     = models.DateTimeField(auto_now=True)
    delete_at      = models.DateTimeField(null=True, blank=True)
    delete_by      = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    def __str__(self):
        return self.name

    class Meta:
        ordering            = ['-created_at', '-id']
        verbose_name        = "Sản phẩm"
        verbose_name_plural = "Sản phẩm"


class Banner(models.Model):
    title         = models.CharField(max_length=200)
    image         = models.ImageField(upload_to='banners/')
    link          = models.CharField(max_length=500, blank=True, null=True)
    is_active     = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)
    delete_at     = models.DateTimeField(null=True, blank=True)
    delete_by     = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name        = "Banner quảng cáo"
        verbose_name_plural = "Banner quảng cáo"

    def __str__(self):
        return self.title


class StoreLocation(models.Model):
    name      = models.CharField(max_length=200)
    lat       = models.DecimalField(max_digits=11, decimal_places=8)
    lng       = models.DecimalField(max_digits=11, decimal_places=8)
    is_active = models.BooleanField(default=True)
    delete_at = models.DateTimeField(null=True, blank=True)
    delete_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name        = "Vị trí cửa hàng"
        verbose_name_plural = "Vị trí cửa hàng"

    def __str__(self):
        return self.name


class CrawlerProduct(models.Model):
    SOURCE_CHOICES = [
        ('BHX', 'Bách Hóa Xanh'),
        ('WINMART', 'WinMart'),
    ]

    source          = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='BHX')
    external_id     = models.CharField(max_length=100, unique=True, help_text="ID của sp trên web đối thủ")
    name            = models.CharField(max_length=255)
    price           = models.DecimalField(max_digits=12, decimal_places=0)
    unit            = models.CharField(max_length=50, blank=True, null=True)
    image_url       = models.URLField(max_length=500, blank=True, null=True)
    category_name   = models.CharField(max_length=100, blank=True, null=True)
    target_category = models.ForeignKey(
        'Category', on_delete=models.SET_NULL,
        null=True, blank=True,
        help_text="Danh mục shop sẽ gán khi duyệt sản phẩm này"
    )
    source_url      = models.URLField(max_length=500, blank=True, null=True)
    scraped_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name        = "Sản phẩm đối thủ"
        verbose_name_plural = "Sản phẩm đối thủ"
        ordering            = ['-scraped_at']

    def __str__(self):
        return f"[{self.source}] {self.name}"
