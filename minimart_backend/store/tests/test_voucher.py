import pytest
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta
from django.db import transaction
from django.contrib.auth.models import User
from rest_framework.exceptions import ValidationError

from store.models import Voucher, Cart, CartItem, Product, Category, Order, UserVoucherUsage
from store.services.voucher_service import validate_voucher, calculate_discount, consume_voucher
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
import threading
from store.services.order_services import create_order

@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", password="testpassword")

@pytest.fixture
def cart_with_items(db, user):
    cart = Cart.objects.create(user=user)
    category = Category.objects.create(name="Test Category")
    product = Product.objects.create(name="Test Product", category=category, price=100000)
    CartItem.objects.create(cart=cart, product=product, quantity=2, unit_price=100000)
    return cart

@pytest.fixture
def empty_cart(db, user):
    return Cart.objects.create(user=user)

@pytest.fixture
def active_percent_voucher(db):
    return Voucher.objects.create(
        code="PERCENT20",
        discount_type="PERCENT",
        discount_value=Decimal('20.00'),
        max_discount_amount=Decimal('50000.00'),
        min_order_amount=Decimal('100000.00'),
        start_date=timezone.now() - timedelta(days=1),
        end_date=timezone.now() + timedelta(days=10),
        max_usage=100,
        max_usage_per_user=1,
        is_active=True
    )

@pytest.fixture
def active_fixed_voucher(db):
    return Voucher.objects.create(
        code="FIXED50K",
        discount_type="FIXED",
        discount_value=Decimal('50000.00'),
        min_order_amount=Decimal('150000.00'),
        start_date=timezone.now() - timedelta(days=1),
        end_date=timezone.now() + timedelta(days=10),
        max_usage=100,
        max_usage_per_user=1,
        is_active=True
    )

@pytest.fixture
def order(db, user):
    return Order.objects.create(
        user=user,
        order_code="TEST-ORD",
        receiver_name="Test Name",
        receiver_phone="0123456789",
        address_text="Test Address",
        subtotal=Decimal('200000'),
        total_amount=Decimal('200000')
    )

@pytest.mark.django_db(transaction=True)
class TestVoucherService:

    # ────────────────────────────────────────────────────────────────────────
    # Tests cho validate_voucher()
    # ────────────────────────────────────────────────────────────────────────

    def test_validate_percent_success(self, user, cart_with_items, active_percent_voucher):
        voucher, subtotal = validate_voucher("PERCENT20", user)
        assert voucher.code == "PERCENT20"
        assert subtotal == 200000

    def test_validate_fixed_success(self, user, cart_with_items, active_fixed_voucher):
        voucher, subtotal = validate_voucher("fixed50k", user)
        assert voucher.code == "FIXED50K"
        assert subtotal == 200000

    def test_validate_voucher_not_found(self, user, cart_with_items, active_percent_voucher):
        active_percent_voucher.is_active = False
        active_percent_voucher.save()
        
        with pytest.raises(ValidationError) as exc_info:
            validate_voucher("PERCENT20", user)
        assert exc_info.value.detail['error_code'] == 'VOUCHER_NOT_FOUND'

    def test_validate_expired_voucher(self, user, cart_with_items, active_percent_voucher):
        active_percent_voucher.end_date = timezone.now() - timedelta(days=1)
        active_percent_voucher.save()
        
        with pytest.raises(ValidationError) as exc_info:
            validate_voucher("PERCENT20", user)
        assert exc_info.value.detail['error_code'] == 'VOUCHER_EXPIRED'

    def test_validate_not_started_voucher(self, user, cart_with_items, active_percent_voucher):
        active_percent_voucher.start_date = timezone.now() + timedelta(days=1)
        active_percent_voucher.save()
        
        with pytest.raises(ValidationError) as exc_info:
            validate_voucher("PERCENT20", user)
        assert exc_info.value.detail['error_code'] == 'VOUCHER_NOT_STARTED'

    def test_validate_min_order_not_met(self, user, cart_with_items, active_percent_voucher):
        active_percent_voucher.min_order_amount = Decimal('300000.00')
        active_percent_voucher.save()
        
        with pytest.raises(ValidationError) as exc_info:
            validate_voucher("PERCENT20", user)
        assert exc_info.value.detail['error_code'] == 'INSUFFICIENT_ORDER_AMOUNT'

    def test_validate_max_usage_reached(self, user, cart_with_items, active_percent_voucher):
        active_percent_voucher.usage_count = 100
        active_percent_voucher.max_usage = 100
        active_percent_voucher.save()
        
        with pytest.raises(ValidationError) as exc_info:
            validate_voucher("PERCENT20", user)
        assert exc_info.value.detail['error_code'] == 'VOUCHER_MAX_USAGE_REACHED'

    def test_validate_user_limit_reached(self, user, cart_with_items, active_percent_voucher, order):
        UserVoucherUsage.objects.create(user=user, voucher=active_percent_voucher, order=order)
        
        with pytest.raises(ValidationError) as exc_info:
            validate_voucher("PERCENT20", user)
        assert exc_info.value.detail['error_code'] == 'VOUCHER_USER_LIMIT_REACHED'

    def test_validate_invalid_subtotal(self, user, empty_cart, active_percent_voucher):
        with pytest.raises(ValidationError) as exc_info:
            validate_voucher("PERCENT20", user)
        assert exc_info.value.detail['error_code'] == 'INVALID_SUBTOTAL'

    # ────────────────────────────────────────────────────────────────────────
    # Tests cho calculate_discount()
    # ────────────────────────────────────────────────────────────────────────

    def test_calculate_percent_capped(self, active_percent_voucher):
        discount = calculate_discount(active_percent_voucher, Decimal('300000.00'))
        assert discount == Decimal('50000.00')

    def test_calculate_percent_no_cap(self, active_percent_voucher):
        discount = calculate_discount(active_percent_voucher, Decimal('100000.00'))
        assert discount == Decimal('20000.00')

    def test_calculate_fixed_no_exceed_subtotal(self, active_fixed_voucher):
        discount = calculate_discount(active_fixed_voucher, Decimal('40000.00'))
        assert discount == Decimal('40000.00')

    def test_calculate_fixed_normal(self, active_fixed_voucher):
        discount = calculate_discount(active_fixed_voucher, Decimal('100000.00'))
        assert discount == Decimal('50000.00')

    # ────────────────────────────────────────────────────────────────────────
    # Tests cho consume_voucher()
    # ────────────────────────────────────────────────────────────────────────

    def test_consume_voucher_success(self, user, active_percent_voucher, order):
        # consume_voucher() PHẢI được gọi trong transaction.atomic() — đúng như SPEC yêu cầu
        with transaction.atomic():
            consume_voucher(active_percent_voucher, user, order)
        
        active_percent_voucher.refresh_from_db()
        assert active_percent_voucher.usage_count == 1
        
        usage_record = UserVoucherUsage.objects.filter(user=user, voucher=active_percent_voucher, order=order).first()
        assert usage_record is not None

    def test_consume_voucher_max_usage_reached_during_lock(self, user, active_percent_voucher, order):
        active_percent_voucher.usage_count = 100
        active_percent_voucher.max_usage = 100
        active_percent_voucher.save()

        with pytest.raises(ValidationError) as exc_info:
            # consume_voucher() PHẢI được gọi trong transaction.atomic()
            with transaction.atomic():
                consume_voucher(active_percent_voucher, user, order)
        assert exc_info.value.detail['error_code'] == 'VOUCHER_MAX_USAGE_REACHED'


# ════════════════════════════════════════════════════════════════════════════
# Integration Tests (API Layer — Task 3)
# ════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(db, api_client):
    """APIClient đã được authenticate bằng JWT."""
    user = User.objects.create_user(username="apiuser", password="pass1234")
    refresh = RefreshToken.for_user(user)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    api_client._user = user
    return api_client


@pytest.fixture
def cart_for_api_user(db, auth_client):
    """Giỏ hàng với 2 sản phẩm — subtotal = 200,000."""
    user = auth_client._user
    cart = Cart.objects.create(user=user)
    category = Category.objects.create(name="API Category")
    product = Product.objects.create(
        name="API Product", category=category,
        price=100000, stock_quantity=50, unit="cái"
    )
    CartItem.objects.create(cart=cart, product=product, quantity=2, unit_price=100000)
    return cart


@pytest.fixture
def voucher_percent(db):
    return Voucher.objects.create(
        code="API20",
        discount_type="PERCENT",
        discount_value=Decimal('20.00'),
        max_discount_amount=Decimal('50000.00'),
        min_order_amount=Decimal('100000.00'),
        start_date=timezone.now() - timedelta(days=1),
        end_date=timezone.now() + timedelta(days=10),
        max_usage=100,
        max_usage_per_user=1,
        is_active=True
    )


@pytest.mark.django_db(transaction=True)
class TestVoucherAPI:

    APPLY_URL = '/api/vouchers/apply/'

    # ── /api/vouchers/apply/ tests ──────────────────────────────────────────

    def test_apply_unauthenticated(self, api_client):
        """Không có JWT → 401. Không cần cart vì auth check xảy ra trước."""
        resp = api_client.post(self.APPLY_URL, {'code': 'API20'}, format='json')
        assert resp.status_code == 401

    def test_apply_valid_voucher_returns_200(self, auth_client, voucher_percent, cart_for_api_user):
        """Mã hợp lệ, giỏ hàng có đủ hàng → 200 + discount_amount."""
        resp = auth_client.post(self.APPLY_URL, {'code': 'API20'}, format='json')
        assert resp.status_code == 200
        data = resp.json()
        assert data['success'] is True
        assert data['voucher_code'] == 'API20'
        # 20% of 200,000 = 40,000 (under cap of 50,000)
        assert data['discount_amount'] == 40000

    def test_apply_correct_discount_not_exceed_cap(self, auth_client, voucher_percent, cart_for_api_user):
        """discount_amount không vượt max_discount_amount."""
        resp = auth_client.post(self.APPLY_URL, {'code': 'api20'}, format='json')
        assert resp.status_code == 200
        assert resp.json()['discount_amount'] <= float(voucher_percent.max_discount_amount)

    def test_apply_does_not_increment_usage_count(self, auth_client, voucher_percent, cart_for_api_user):
        """Gọi /apply/ không được tăng usage_count."""
        auth_client.post(self.APPLY_URL, {'code': 'API20'}, format='json')
        voucher_percent.refresh_from_db()
        assert voucher_percent.usage_count == 0

    def test_apply_invalid_code_returns_400(self, auth_client, cart_for_api_user):
        """Mã không tồn tại → 400 với VOUCHER_NOT_FOUND."""
        resp = auth_client.post(self.APPLY_URL, {'code': 'NONEXISTENT'}, format='json')
        assert resp.status_code == 400
        assert resp.json()['error_code'] == 'VOUCHER_NOT_FOUND'

    def test_apply_expired_voucher(self, auth_client, voucher_percent, cart_for_api_user):
        """Mã hết hạn → 400 với VOUCHER_EXPIRED."""
        voucher_percent.end_date = timezone.now() - timedelta(days=1)
        voucher_percent.save()
        resp = auth_client.post(self.APPLY_URL, {'code': 'API20'}, format='json')
        assert resp.status_code == 400
        assert resp.json()['error_code'] == 'VOUCHER_EXPIRED'

    # ── POST /api/orders/ integration tests ─────────────────────────────────

    def test_create_order_with_voucher_saves_discount(self, auth_client, voucher_percent, cart_for_api_user):
        """Tạo đơn hàng với voucher_code → discount_amount được lưu vào Order."""
        payload = {
            'receiver_name': 'Test User',
            'receiver_phone': '0123456789',
            'address_text': '123 Test St',
            'voucher_code': 'API20',
        }
        resp = auth_client.post('/api/orders/', payload, format='json')
        assert resp.status_code == 201
        data = resp.json()
        assert float(data['discount_amount']) == 40000.0
        assert float(data['total_amount']) == 175000.0

    def test_create_order_with_voucher_increments_usage_count(self, auth_client, voucher_percent, cart_for_api_user):
        """Sau khi tạo đơn thành công, usage_count tăng 1."""
        payload = {
            'receiver_name': 'Test User',
            'receiver_phone': '0123456789',
            'address_text': '123 Test St',
            'voucher_code': 'API20',
        }
        auth_client.post('/api/orders/', payload, format='json')
        voucher_percent.refresh_from_db()
        assert voucher_percent.usage_count == 1

    def test_create_order_without_voucher_works(self, auth_client, cart_for_api_user):
        """Tạo đơn không có voucher_code → vẫn thành công, discount_amount = 0."""
        payload = {
            'receiver_name': 'Test User',
            'receiver_phone': '0123456789',
            'address_text': '123 Test St',
        }
        resp = auth_client.post('/api/orders/', payload, format='json')
        assert resp.status_code == 201
        assert float(resp.json()['discount_amount']) == 0.0

    def test_rate_limit_triggered(self, auth_client, voucher_percent, cart_for_api_user):
        """Gọi /apply/ lần thứ 11 trong 1 user/IP -> 429."""
        for _ in range(10):
            resp = auth_client.post(self.APPLY_URL, {'code': 'API20'}, format='json')
            assert resp.status_code == 200
        
        resp = auth_client.post(self.APPLY_URL, {'code': 'API20'}, format='json')
        assert resp.status_code == 429
        assert "Quá nhiều lần thử" in resp.json()['detail']


# ════════════════════════════════════════════════════════════════════════════
# Security & Concurrency Tests (Task 4)
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.django_db(transaction=True)
class TestVoucherSecurity:
    """
    Kiểm tra các kịch bản tấn công và tranh chấp tài nguyên (Race Condition).
    """

    def test_race_condition_max_usage(self, db, auth_client, cart_for_api_user):
        """
        10 thread đồng thời tạo đơn với voucher max_usage=1.
        Kết quả: đúng 1 thành công, usage_count == 1, UserVoucherUsage == 1.
        """
        voucher = Voucher.objects.create(
            code="RACE1",
            discount_type="FIXED",
            discount_value=Decimal('10000.00'),
            min_order_amount=Decimal('50000.00'),
            start_date=timezone.now() - timedelta(days=1),
            end_date=timezone.now() + timedelta(days=1),
            max_usage=1,
            usage_count=0,
            is_active=True
        )

        user = auth_client._user
        payload = {
            'receiver_name': 'Race User',
            'receiver_phone': '0909090909',
            'address_text': 'Race Location',
            'voucher_code': 'RACE1'
        }

        results = []
        errors = []

        def worker():
            try:
                # Gọi trực tiếp service create_order để test concurrency ở tầng nghiệp vụ/DB
                # (Dùng client.post cũng được nhưng worker cần handle auth context phức tạp hơn)
                order = create_order(user, payload)
                results.append(order)
            except ValidationError as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()

        voucher.refresh_from_db()
        assert len(results) == 1
        assert voucher.usage_count == 1
        assert UserVoucherUsage.objects.filter(voucher=voucher).count() == 1
        assert len(errors) == 9

