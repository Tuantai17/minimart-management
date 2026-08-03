"""
VNPAY IPN Webhook View
Nhận kết quả thanh toán ngầm từ server VNPAY (server-to-server GET call).
Tài liệu: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html#code-ipn-url

Bảng RspCode phản hồi bắt buộc:
  00 - Confirm Success       (VNPAY dừng retry)
  01 - Order not found       (VNPAY retry)
  02 - Order already confirmed (VNPAY dừng retry — idempotent)
  04 - Invalid amount        (VNPAY retry)
  97 - Invalid signature     (VNPAY retry)
  99 - Unknown error         (VNPAY retry)
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from ..services.vnpay_service import verify_vnpay_ipn, process_vnpay_payment_result


def _strip_secure_hash(params):
    """Loại bỏ vnp_SecureHash khỏi params trước khi lưu vào DB (minimum data principle)."""
    return {k: v for k, v in params.items()
            if k not in ('vnp_SecureHash', 'vnp_SecureHashType')}


class VNPayIPNView(APIView):
    """
    GET /api/webhooks/vnpay-ipn/
    Endpoint nhận IPN từ VNPAY — server-to-server, không cần JWT.
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # Bỏ qua authentication cho webhook

    def get(self, request, *args, **kwargs):
        # QueryDict trả về list cho mỗi key — flatten về scalar
        flat_params = {k: (v[0] if isinstance(v, list) else v)
                       for k, v in request.GET.dict().items()}

        if not verify_vnpay_ipn(flat_params):
            return Response({'RspCode': '97', 'Message': 'Invalid signature'})

        safe_params = _strip_secure_hash(flat_params)
        result = process_vnpay_payment_result(
            order_code=flat_params.get('vnp_TxnRef', ''),
            vnp_response_code=flat_params.get('vnp_ResponseCode', ''),
            vnp_transaction_no=flat_params.get('vnp_TransactionNo', ''),
            vnp_amount=flat_params.get('vnp_Amount', '0'),
            raw_params=safe_params,
        )

        return Response({'RspCode': result['rsp_code'], 'Message': result['message']})
