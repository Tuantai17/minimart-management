from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator

from .base import ActiveManager
from .product import Product


class Review(models.Model):
    product         = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    user            = models.ForeignKey(User, on_delete=models.CASCADE)
    rating          = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment         = models.TextField(blank=True, null=True)
    created_at      = models.DateTimeField(auto_now_add=True)

    shop_reply      = models.TextField(blank=True, null=True)
    shop_replied_at = models.DateTimeField(null=True, blank=True)
    shop_replied_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='shop_replies'
    )

    delete_at = models.DateTimeField(null=True, blank=True)
    delete_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    objects     = ActiveManager()
    all_objects = models.Manager()

    class Meta:
        unique_together     = ('user', 'product')
        verbose_name        = "Đánh giá"
        verbose_name_plural = "Đánh giá"


class ReviewMedia(models.Model):
    MEDIA_TYPE_CHOICES = [
        ('image', 'Ảnh'),
        ('video', 'Video'),
    ]

    review     = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='media')
    file       = models.FileField(upload_to='reviews/')
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    delete_at = models.DateTimeField(null=True, blank=True)
    delete_by = models.ForeignKey(
        User, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )

    class Meta:
        verbose_name        = "Ảnh/Video đánh giá"
        verbose_name_plural = "Ảnh/Video đánh giá"

    def __str__(self):
        return f"{self.media_type} #{self.id} của Review #{self.review_id}"
