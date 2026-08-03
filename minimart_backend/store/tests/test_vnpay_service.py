from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from store.services.vnpay_service import (
    _sign_hmac512,
    create_vnpay_payment_url,
    verify_vnpay_ipn,
)


@override_settings(
    VNPAY_TMN_CODE='WROXAMOX',
    VNPAY_HASH_SECRET='test_secret',
    VNPAY_PAYMENT_URL='https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    VNPAY_RETURN_URL='http://localhost:8081/payment/result',
    VNPAY_EXPIRE_MINUTES=15,
    TIME_ZONE='Asia/Ho_Chi_Minh',
    USE_TZ=True,
)
class VnPayServiceTest(SimpleTestCase):
    def test_create_payment_url_uses_vnpay_form_encoding_for_signature(self):
        order = SimpleNamespace(order_code='DH001', total_amount=Decimal('1000.00'))
        frozen_now = datetime(2026, 6, 10, 3, 0, 0, tzinfo=dt_timezone.utc)

        with patch('store.services.vnpay_service.timezone.now', return_value=frozen_now):
            payment_url = create_vnpay_payment_url(order, '127.0.0.1')

        query = urlsplit(payment_url).query
        parsed = {key: values[0] for key, values in parse_qs(query).items()}
        secure_hash = parsed.pop('vnp_SecureHash')

        expected_hash_data = (
            'vnp_Amount=100000&'
            'vnp_Command=pay&'
            'vnp_CreateDate=20260610100000&'
            'vnp_CurrCode=VND&'
            'vnp_ExpireDate=20260610101500&'
            'vnp_IpAddr=127.0.0.1&'
            'vnp_Locale=vn&'
            'vnp_OrderInfo=Thanh+toan+don+hang+DH001&'
            'vnp_OrderType=other&'
            'vnp_ReturnUrl=http%3A%2F%2Flocalhost%3A8081%2Fpayment%2Fresult&'
            'vnp_TmnCode=WROXAMOX&'
            'vnp_TxnRef=DH001&'
            'vnp_Version=2.1.0'
        )

        self.assertIn('vnp_OrderInfo=Thanh+toan+don+hang+DH001', query)
        self.assertNotIn('Thanh%20toan%20don%20hang%20DH001', query)
        self.assertEqual(
            secure_hash,
            _sign_hmac512('test_secret', expected_hash_data),
        )

    def test_verify_vnpay_ipn_accepts_plus_encoded_signed_values(self):
        params = {
            'vnp_Amount': '100000',
            'vnp_OrderInfo': 'Thanh toan don hang DH001',
            'vnp_TmnCode': 'WROXAMOX',
            'vnp_TxnRef': 'DH001',
        }
        hash_data = (
            'vnp_Amount=100000&'
            'vnp_OrderInfo=Thanh+toan+don+hang+DH001&'
            'vnp_TmnCode=WROXAMOX&'
            'vnp_TxnRef=DH001'
        )
        params['vnp_SecureHash'] = _sign_hmac512('test_secret', hash_data)

        self.assertTrue(verify_vnpay_ipn(params))
