from django.test import TestCase, override_settings
from django.urls import reverse
from django.core.cache import cache
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APIClient
from decimal import Decimal
from unittest.mock import patch
from store.models import Product, Category, Order
from store.services.report_services import get_revenue_summary

class SystemVerificationTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.cat = Category.objects.create(name="Test Cat")
        for i in range(5):
            Product.objects.create(
                name=f"Product {i}",
                category=self.cat,
                price=Decimal('100.00'),
                stock_quantity=10,
                unit="chai"
            )

    # ─── BẢO MẬT: THROTTLING ──────────────────────────────────────────────────
    @override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
    def test_forgot_password_throttling(self):
        """Xác nhận bộ chặn (Rate Limit) hoạt động đúng Spec (3 lần/10 phút)"""
        url = reverse('forgot-password')
        data = {'username': 'testuser'}
        
        for _ in range(3):
            response = self.client.post(url, data)
            self.assertIn(response.status_code, [200, 400])
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    # ─── HIỆU NĂNG: N+1 QUERY ────────────────────────────────────────────────
    def test_product_list_query_count(self):
        """Xác nhận API Product List không bị lỗi N+1 (Sử dụng select_related)"""
        url = reverse('product-list')
        
        # Với 5 sản phẩm cùng category, nếu có N+1 sẽ tốn 1 (product) + 5 (category) = 6 queries
        # Với Pagination mặc định, ta tốn 2 queries: 1 COUNT và 1 SELECT JOIN (tối ưu)
        with self.assertNumQueries(2):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)

    # ─── ỔN ĐỊNH: FALLBACK ───────────────────────────────────────────────────
    def test_revenue_summary_fallback_on_db_error(self):
        """Xác nhận service Revenue trả về 0 nếu DB gặp sự cố (Stability)"""
        with patch('django.db.models.query.QuerySet.aggregate') as mocked_agg:
            mocked_agg.side_effect = Exception("Database is down")
            result = get_revenue_summary()
            self.assertEqual(result['summary']['last_24_hours']['revenue'], 0)
            self.assertEqual(result['summary']['last_7_days']['order_count'], 0)
            self.assertEqual(result['currency'], "VND")
