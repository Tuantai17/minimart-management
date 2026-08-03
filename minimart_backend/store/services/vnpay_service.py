import hashlib
import hmac
import logging
import requests
import urllib.parse
from datetime import datetime, timedelta
from urllib.parse import urlparse

from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

from store.models import Order, Cart, CartItem
from store.services.order_services import _restore_order_resources
from store.services.notification_service import send_push_to_user
from django.db import DatabaseError



# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_client_ip(request) -> str:
    """Lấy IP thật của client (ưu tiên X-Forwarded-For khi qua proxy/nginx)."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


def _sign_hmac512(secret: str, data: str) -> str:
    """Ký chuỗi data bằng HMAC-SHA512 với key là secret."""
    return hmac.new(
        secret.encode('utf-8'),
        data.encode('utf-8'),
        hashlib.sha512
    ).hexdigest()


def _build_vnpay_hash_data(params: dict) -> str:
    """
    Build checksum payload theo format x-www-form-urlencoded cua VNPAY.

    PHP demo cua VNPAY dung urlencode(), tuong duong quote_plus() trong Python:
    space phai thanh '+', khong phai '%20'.
    """
    return '&'.join(
        f'{urllib.parse.quote_plus(str(key), safe="")}='
        f'{urllib.parse.quote_plus(str(value), safe="")}'
        for key, value in sorted(params.items())
    )


def _build_vnpay_query_string(params: dict) -> str:
    return urllib.parse.urlencode(
        sorted(params.items()),
        quote_via=urllib.parse.quote_plus,
    )


def validate_return_url(return_url: str) -> str:
    """
    Validate return_url từ FE theo whitelist để chống open-redirect.

    Rules:
    - Chỉ chấp nhận scheme http hoặc https
    - Origin phải nằm trong VNPAY_ALLOWED_ORIGINS
    - Path phải khớp VNPAY_ALLOWED_CALLBACK_PATH

    Raises:
        ValueError nếu return_url không hợp lệ
    """
    parsed = urlparse(return_url)

    if parsed.scheme not in ('http', 'https'):
        raise ValueError("return_url chỉ chấp nhận http hoặc https.")

    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in settings.VNPAY_ALLOWED_ORIGINS:
        raise ValueError(
            f"Origin '{origin}' không nằm trong danh sách cho phép."
        )

    if parsed.path != settings.VNPAY_ALLOWED_CALLBACK_PATH:
        raise ValueError(
            f"Path phải là '{settings.VNPAY_ALLOWED_CALLBACK_PATH}'."
        )

    return return_url


# ─── Create Payment URL ───────────────────────────────────────────────────────

def create_vnpay_payment_url(order, client_ip: str, return_url: str = None) -> str:
    """
    Tạo URL thanh toán VNPAY (redirect khách hàng đến cổng VNPAY).

    Quy tắc tạo chữ ký (theo tài liệu VNPAY + demo Python chính thức):
    1. Gom tất cả tham số vnp_* vào dict
    2. Sắp xếp key tăng dần (alphabetical)
    3. Tạo hashData = "key1=value1&key2=value2&..." (key+value đều urlencode bằng quote_plus)
    4. Ký HMAC-SHA512(vnp_HashSecret, hashData)
    5. Build querystring bằng urlencode(quote_via=quote_plus) + append vnp_SecureHash

    Args:
        order: Order instance với order_code, total_amount
        client_ip: IP thật của client request
        return_url: URL FE muốn VNPAY redirect về (đã validate). Nếu None → dùng default.

    Returns:
        URL thanh toán đầy đủ (redirect đến VNPAY)
    """
    # Fallback: nếu FE không truyền return_url → dùng config mặc định
    effective_return_url = return_url or settings.VNPAY_RETURN_URL
    created_at = timezone.localtime(timezone.now())
    expire_minutes = int(getattr(settings, 'VNPAY_EXPIRE_MINUTES', 15))
    expired_at = created_at + timedelta(minutes=expire_minutes)

    vnp_params = {
        'vnp_Version':   '2.1.0',
        'vnp_Command':   'pay',
        'vnp_TmnCode':   settings.VNPAY_TMN_CODE,
        'vnp_Amount':    str(int(round(order.total_amount * 100))),  # ⚠️ Nhân 100, VND — round() tránh truncation Decimal
        'vnp_CurrCode':  'VND',
        'vnp_TxnRef':    order.order_code,                    # Mã đơn duy nhất
        'vnp_OrderInfo': f'Thanh toan don hang {order.order_code}',
        'vnp_OrderType': 'other',
        'vnp_Locale':    'vn',
        'vnp_ReturnUrl': effective_return_url,
        'vnp_IpAddr':    client_ip,
        'vnp_CreateDate': created_at.strftime('%Y%m%d%H%M%S'),
        'vnp_ExpireDate': expired_at.strftime('%Y%m%d%H%M%S'),
    }

    hash_data = _build_vnpay_hash_data(vnp_params)
    secure_hash = _sign_hmac512(settings.VNPAY_HASH_SECRET, hash_data)
    query_string = _build_vnpay_query_string(vnp_params)

    return f'{settings.VNPAY_PAYMENT_URL}?{query_string}&vnp_SecureHash={secure_hash}'


# ─── Verify IPN ──────────────────────────────────────────────────────────────

def verify_vnpay_ipn(query_params: dict) -> bool:
    """
    Xác thực chữ ký HMAC-SHA512 từ IPN callback do VNPAY gửi về.

    Quy tắc xác thực (theo tài liệu VNPAY):
    1. Tách vnp_SecureHash ra khỏi params
    2. Loại bỏ vnp_SecureHashType nếu có
    3. Sắp xếp params còn lại theo key alphabetical
    4. Tạo hashData = "key1=urlencode(val1)&key2=urlencode(val2)&..."
    5. Tính HMAC-SHA512 và so sánh bằng compare_digest (chống timing attack)

    Args:
        query_params: dict từ request.GET (đã là dict, không phải QueryDict)

    Returns:
        True nếu chữ ký hợp lệ, False nếu không
    """
    params = dict(query_params)
    received_hash = params.pop('vnp_SecureHash', '')
    params.pop('vnp_SecureHashType', None)

    hash_data = _build_vnpay_hash_data(params)
    computed_hash = _sign_hmac512(settings.VNPAY_HASH_SECRET, hash_data)

    # compare_digest chống timing attack
    return hmac.compare_digest(computed_hash, received_hash.lower())


# ─── Process Payment Result ──────────────────────────────────────────────────

def process_vnpay_payment_result(order_code, vnp_response_code, vnp_transaction_no, vnp_amount, raw_params):
    """
    Logic xử lý kết quả thanh toán VNPAY — dùng chung cho IPN handler và verify endpoint.

    Args:
        order_code:        Mã đơn hàng (vnp_TxnRef)
        vnp_response_code: Mã kết quả từ VNPAY ('00' = thành công)
        vnp_transaction_no: Mã giao dịch tại VNPAY
        vnp_amount:        Số tiền × 100 (string)
        raw_params:        Dict params gốc (đã loại bỏ vnp_SecureHash)

    Returns:
        dict với keys:
        - success (bool): True nếu xử lý thành công (không có lỗi hệ thống)
        - rsp_code (str): Mã phản hồi cho VNPAY IPN ('00', '01', '02', '04', '99')
        - payment_status (str): Trạng thái thanh toán sau xử lý
        - order_status (str): Trạng thái đơn hàng sau xử lý
        - message (str): Thông điệp kết quả
    """

    try:
        order = Order.objects.get(order_code=order_code)
    except Order.DoesNotExist:
        return {'success': False, 'rsp_code': '01', 'payment_status': None,
                'order_status': None, 'message': 'Order not found'}

    expected_amount = int(round(order.total_amount * 100))
    try:
        received_amount = int(vnp_amount)
    except (ValueError, TypeError):
        return {'success': False, 'rsp_code': '04', 'payment_status': None,
                'order_status': None, 'message': 'Invalid amount'}

    if received_amount != expected_amount:
        return {'success': False, 'rsp_code': '04', 'payment_status': None,
                'order_status': None, 'message': 'Invalid amount'}

    # Fast check idempotency trước khi lock
    if order.payment_status == 'PAID':
        return {'success': True, 'rsp_code': '02', 'payment_status': 'PAID',
                'order_status': order.status, 'message': 'Order already confirmed'}

    try:
        with transaction.atomic():
            order_lock = Order.objects.select_for_update().get(pk=order.pk)

            if order_lock.payment_status == 'PAID':
                return {'success': True, 'rsp_code': '02', 'payment_status': 'PAID',
                        'order_status': order_lock.status, 'message': 'Order already confirmed'}

            # Đơn đã bị hủy trước khi IPN/verify đến
            if order_lock.status == 'CANCELLED':
                raw_params['SYSTEM_WARNING'] = 'Payment result received but order already CANCELLED.'
                order_lock.payment_log = raw_params
                order_lock.save(update_fields=['payment_log'])
                return {'success': True, 'rsp_code': '02',
                        'payment_status': order_lock.payment_status,
                        'order_status': 'CANCELLED', 'message': 'Order already cancelled'}

            if vnp_response_code == '00':
                order_lock.payment_status = 'PAID'
                order_lock.status         = 'CONFIRMED'
                order_lock.transaction_id = vnp_transaction_no
                order_lock.payment_log    = raw_params
                order_lock.save(update_fields=[
                    'payment_status', 'status', 'transaction_id', 'payment_log',
                ])

                # Xóa giỏ hàng — đơn VNPAY giữ giỏ đến khi PAID
                if order_lock.user_id:
                    try:
                        cart = Cart.objects.get(user_id=order_lock.user_id)
                        CartItem.objects.filter(cart=cart).delete()
                    except Cart.DoesNotExist:
                        pass

                if order_lock.user:
                    send_push_to_user(
                        user=order_lock.user,
                        title="Thanh toán thành công!",
                        body=f"Đơn hàng {order_lock.order_code} đã được thanh toán và xác nhận.",
                        data={"order_code": order_lock.order_code, "status": "CONFIRMED"}
                    )

                return {'success': True, 'rsp_code': '00', 'payment_status': 'PAID',
                        'order_status': 'CONFIRMED', 'message': 'Confirm Success'}
            else:
                order_lock.payment_status = 'FAILED'
                order_lock.status         = 'CANCELLED'
                order_lock.payment_log    = raw_params
                order_lock.save(update_fields=[
                    'payment_status', 'status', 'transaction_id', 'payment_log',
                ])
                _restore_order_resources(order_lock)

                return {'success': True, 'rsp_code': '00', 'payment_status': 'FAILED',
                        'order_status': 'CANCELLED',
                        'message': 'Payment failed or cancelled',
                        'vnp_response_code': vnp_response_code}

    except (DatabaseError, ValueError, TypeError):
        logger.exception("Error processing VNPAY payment result for order %s", order_code)
        return {'success': False, 'rsp_code': '99', 'payment_status': None,
                'order_status': None, 'message': 'Unknown error'}


# ─── Refund ──────────────────────────────────────────────────────────────────

VNPAY_REFUND_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction"


def refund_vnpay_order(order, admin_user_ip: str = '127.0.0.1') -> dict:
    """
    Gọi VNPAY Refund API để hoàn tiền toàn phần cho 1 đơn hàng đã PAID.

    Điều kiện bắt buộc trước khi gọi hàm này:
    - order.payment_status == 'PAID'
    - order.transaction_id khác rỗng (vnp_TransactionNo từ IPN)

    Returns:
        dict với keys:
        - success (bool): True nếu VNPAY hoàn tiền thành công (RspCode == '00')
        - message (str): Thông điệp từ VNPAY hoặc lỗi nội bộ
        - raw (dict): Toàn bộ response VNPAY (để lưu log)
    """
    now = datetime.now()
    create_date = now.strftime('%Y%m%d%H%M%S')
    request_id = now.strftime('%Y%m%d%H%M%S') + '_' + order.order_code

    params = {
        'vnp_RequestId':      request_id,
        'vnp_Version':        '2.1.0',
        'vnp_Command':        'refund',
        'vnp_TmnCode':        settings.VNPAY_TMN_CODE,
        'vnp_TransactionType': '02',                               # 02 = hoàn toàn phần
        'vnp_TxnRef':         order.order_code,
        'vnp_Amount':         str(int(order.total_amount * 100)),  # VND × 100
        'vnp_OrderInfo':      f'Hoan tien don hang {order.order_code}',
        'vnp_TransactionNo':  str(order.transaction_id),           # Mã GD tại VNPAY
        'vnp_TransactionDate': order.created_at.strftime('%Y%m%d%H%M%S'),
        'vnp_CreateDate':     create_date,
        'vnp_CreateBy':       'admin',
        'vnp_IpAddr':         admin_user_ip,
    }

    # Ký: ghép theo thứ tự field đặc biệt của Refund API
    hash_fields = [
        params['vnp_RequestId'], params['vnp_Version'], params['vnp_Command'],
        params['vnp_TmnCode'], params['vnp_TransactionType'], params['vnp_TxnRef'],
        params['vnp_Amount'], params['vnp_TransactionNo'],
        params['vnp_TransactionDate'], params['vnp_CreateDate'],
        params['vnp_CreateBy'], params['vnp_IpAddr'],
    ]
    hash_data = '|'.join(hash_fields)
    params['vnp_SecureHash'] = _sign_hmac512(settings.VNPAY_HASH_SECRET, hash_data)

    try:
        response = requests.post(
            VNPAY_REFUND_URL,
            json=params,
            timeout=10,
        )
        response.raise_for_status()
        result = response.json()

        rsp_code = result.get('vnp_ResponseCode', '')
        success = rsp_code == '00'

        if success:
            logger.info(
                "VNPAY Refund SUCCESS: order=%s, amount=%s",
                order.order_code, params['vnp_Amount']
            )
        else:
            logger.warning(
                "VNPAY Refund FAILED: order=%s, RspCode=%s, message=%s",
                order.order_code, rsp_code, result.get('vnp_Message', '')
            )

        return {
            'success': success,
            'message': result.get('vnp_Message', ''),
            'raw': result,
        }

    except requests.RequestException as exc:
        logger.exception("VNPAY Refund request error for order %s", order.order_code)
        return {
            'success': False,
            'message': f'Không kết nối được đến VNPAY: {exc}',
            'raw': {},
        }
