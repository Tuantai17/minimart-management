import logging
from decimal import Decimal
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from store.models import Voucher, UserVoucherUsage, Order, Cart, UserVoucher

logger = logging.getLogger(__name__)

def _get_cart_subtotal(user) -> Decimal:
    """Helper tính tổng giá trị giỏ hàng của user."""
    try:
        cart = Cart.objects.get(user=user)
        result = cart.items.aggregate(total=Sum(F('quantity') * F('unit_price')))
        return result['total'] or Decimal('0')
    except Cart.DoesNotExist:
        return Decimal('0')

def _check_voucher_usage_limits(voucher: Voucher, user) -> None:
    """Kiểm tra giới hạn số lượt dùng của toàn hệ thống và của từng user."""
    if voucher.max_usage is not None and voucher.usage_count >= voucher.max_usage:
        raise ValidationError({
            "error_code": "VOUCHER_MAX_USAGE_REACHED",
            "message": "Mã giảm giá đã được dùng hết lượt."
        })

    # Guard max_usage_per_user vì có thể là None
    if voucher.max_usage_per_user is not None:
        user_usage_count = UserVoucherUsage.objects.filter(user=user, voucher=voucher).count()
        if user_usage_count >= voucher.max_usage_per_user:
            raise ValidationError({
                "error_code": "VOUCHER_USER_LIMIT_REACHED",
                "message": "Bạn đã dùng mã này rồi."
            })

def claim_voucher(user, voucher_id: int) -> UserVoucher:
    """Xử lý logic nhận voucher của user (§5.2 FE_CONTRACT)."""
    try:
        voucher = Voucher.objects.get(id=voucher_id, is_active=True)
    except Voucher.DoesNotExist:
        raise ValidationError({
            "error_code": "VOUCHER_NOT_FOUND",
            "message": "Mã giảm giá không tồn tại hoặc đã bị ẩn."
        })

    now = timezone.now()
    if voucher.start_date and voucher.start_date > now:
        raise ValidationError({
            "error_code": "VOUCHER_NOT_STARTED",
            "message": "Voucher này chưa đến thời gian nhận."
        })
    if voucher.end_date and voucher.end_date < now:
        raise ValidationError({
            "error_code": "VOUCHER_CLAIM_EXPIRED",
            "message": "Voucher này đã hết hạn nhận."
        })

    if voucher.max_usage is not None and voucher.usage_count >= voucher.max_usage:
        raise ValidationError({
            "error_code": "VOUCHER_OUT_OF_STOCK",
            "message": "Voucher này đã phát hết."
        })

    # Dùng transaction và select_for_update để tránh race condition double-claim.
    with transaction.atomic():
        voucher_locked = Voucher.objects.select_for_update().get(pk=voucher.pk)

        if UserVoucher.objects.filter(user=user, voucher=voucher_locked).exists():
            raise ValidationError({
                "error_code": "VOUCHER_ALREADY_CLAIMED",
                "message": "Bạn đã nhận voucher này rồi."
            })

        user_voucher = UserVoucher.objects.create(
            user=user,
            voucher=voucher_locked,
            status='active'
        )
    return user_voucher




def validate_voucher(code: str, user) -> tuple[Voucher, Decimal]:
    """
    Kiểm tra tính hợp lệ của voucher bằng cách tính subtotal từ Cart của user.
    Pure validation, không update usage_count.
    """
    code = code.strip().upper()
    try:
        voucher = Voucher.objects.get(code=code, is_active=True)
    except Voucher.DoesNotExist:
        raise ValidationError({
            "error_code": "VOUCHER_NOT_FOUND",
            "message": "Mã giảm giá không hợp lệ."
        })

    now = timezone.now()
    # Guard start_date vì có thể là None
    if voucher.start_date and voucher.start_date > now:
        raise ValidationError({
            "error_code": "VOUCHER_NOT_STARTED",
            "message": "Mã giảm giá chưa đến thời gian áp dụng."
        })
    if voucher.end_date and voucher.end_date < now:
        raise ValidationError({
            "error_code": "VOUCHER_EXPIRED",
            "message": "Mã giảm giá đã hết hạn sử dụng."
        })

    subtotal = _get_cart_subtotal(user)

    if subtotal <= 0:
        raise ValidationError({
            "error_code": "INVALID_SUBTOTAL",
            "message": "Giá trị đơn hàng không hợp lệ."
        })

    if subtotal < voucher.min_order_amount:
        raise ValidationError({
            "error_code": "INSUFFICIENT_ORDER_AMOUNT",
            "message": f"Đơn hàng chưa đạt giá trị tối thiểu {voucher.min_order_amount:,.0f}đ để dùng mã này."
        })

    # Bug #5 note: subtotal được lấy từ Cart tại thời điểm validate.
    # Race condition: user có thể xóa item SAU KHI validate nhưng TRƯỚC KHI đặt hàng.
    # → consume_voucher phải luôn được gọi trong transaction.atomic() của order để bảo vệ toàn vẹn.
    _check_voucher_usage_limits(voucher, user)

    return voucher, subtotal


def calculate_discount(voucher: Voucher, subtotal: Decimal) -> Decimal:
    """
    Tính số tiền giảm thực tế dựa trên loại voucher và tổng giá trị đơn hàng.
    - PERCENT: Tính theo % và giới hạn bởi max_discount_amount (nếu có).
    - FIXED: Giảm số tiền cố định nhưng không vượt quá subtotal.
    """
    if voucher.discount_type == 'PERCENT':
        discount = subtotal * (voucher.discount_value / Decimal('100'))
        if voucher.max_discount_amount:
            discount = min(discount, voucher.max_discount_amount)
    elif voucher.discount_type == 'FIXED':
        discount = min(voucher.discount_value, subtotal)
    else:
        discount = Decimal('0')
        
    return discount.quantize(Decimal('0.01'))


def consume_voucher(voucher: Voucher, user, order: Order) -> None:
    """
    Ghi nhận việc sử dụng voucher.
    PHẢI được gọi BÊN TRONG transaction.atomic() của caller.
    """
    # Khóa dòng (row-level lock) để serialize các request cùng voucher
    voucher_locked = Voucher.objects.select_for_update().get(pk=voucher.pk)

    # Kiểm tra lại giới hạn sau khi có lock (atomic check-and-set).
    _check_voucher_usage_limits(voucher_locked, user)

    # Increment bằng F() expression
    Voucher.objects.filter(pk=voucher.pk).update(usage_count=F('usage_count') + 1)

    # Cập nhật trạng thái 'used' và kiểm tra kết quả update.
    updated = UserVoucher.objects.filter(user=user, voucher=voucher_locked, status='active').update(status='used')
    if updated == 0:
        # Không crash — luồng apply không bắt buộc phải qua claim trước
        logger.warning(
            "UserVoucher not found or already used: user=%s, voucher=%s",
            user.id, voucher_locked.pk
        )

    UserVoucherUsage.objects.create(
        user=user,
        voucher=voucher_locked,
        order=order
    )
    # Log audit khi consume voucher thành công.
    logger.info(
        "Voucher consumed: code=%s, user=%s, order=%s",
        voucher_locked.code, user.id, order.id
    )

def restore_voucher(voucher: Voucher, user, order: Order) -> None:
    """
    Hoàn trả lại lượt sử dụng voucher khi đơn hàng bị hủy hoặc thanh toán thất bại.
    PHẢI được gọi BÊN TRONG transaction.atomic() của caller.
    """
    # Khóa dòng để tránh race condition.
    voucher_locked = Voucher.objects.select_for_update().get(pk=voucher.pk)

    # Hoàn lại số lượt dùng (đảm bảo không âm).
    if voucher_locked.usage_count > 0:
        Voucher.objects.filter(pk=voucher.pk).update(usage_count=F('usage_count') - 1)

    UserVoucher.objects.filter(user=user, voucher=voucher_locked, status='used').update(status='active')

    UserVoucherUsage.objects.filter(user=user, voucher=voucher_locked, order=order).delete()

    logger.info(
        "Voucher restored: code=%s, user=%s, order=%s",
        voucher_locked.code, user.id, order.id
    )


