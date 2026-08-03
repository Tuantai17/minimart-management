import uuid
import logging
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from rest_framework.exceptions import ValidationError
from store.models import Cart, CartItem, Order, OrderItem, Product
from store.services.shipping import calculate_shipping, parse_and_validate_coords
from store.services.voucher_service import validate_voucher, calculate_discount, consume_voucher, restore_voucher
from store.services.notification_service import send_push_to_user

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# HELPER: Hoàn trả tồn kho khi hủy đơn
# ─────────────────────────────────────────────
def _restore_order_resources(order_lock):
    """Hoàn trả tồn kho và voucher khi hủy đơn — dùng chung cho cancel_order và update_order_status."""
    # order_by('product_id') để đảm bảo thứ tự khóa nhất quán → triệt tiêu Deadlock
    order_items = list(order_lock.items.select_related('product').order_by('product_id'))
    for item in order_items:
        product = Product.objects.select_for_update().get(pk=item.product_id)
        product.stock_quantity += item.quantity
        product.save(update_fields=['stock_quantity'])

    if order_lock.voucher:
        restore_voucher(order_lock.voucher, order_lock.user, order_lock)


# ─────────────────────────────────────────────
# TẠO ĐƠN HÀNG
# ─────────────────────────────────────────────
def create_order(user, data):
    try:
        cart = Cart.objects.get(user=user)
    except Cart.DoesNotExist:
        raise ValidationError({"error": "Giỏ hàng trống!"})

    # select_related tránh N+1, order_by tránh Deadlock
    cart_items = list(
        CartItem.objects.filter(cart=cart)
        .select_related('product')
        .order_by('product_id')
    )

    if not cart_items:
        raise ValidationError({"error": "Giỏ hàng trống!"})

    # Soft check tồn kho để báo lỗi sớm cho UX. Hard check sẽ diễn ra trong transaction.
    for item in cart_items:
        if item.quantity > item.product.stock_quantity:
            raise ValidationError({
                "error": f"Không đủ hàng! Sản phẩm '{item.product.name}' chỉ còn {item.product.stock_quantity} sản phẩm."
            })

    # Tính tổng tiền trên RAM, không query thêm
    subtotal = sum(item.unit_price * item.quantity for item in cart_items)

    delivery_lat = data.get('delivery_lat')
    delivery_lng = data.get('delivery_lng')

    distance_km = None
    shipping_fee = 15000  # Phí mặc định khi không có tọa độ

    if delivery_lat is not None and delivery_lng is not None:
        try:
            lat, lng = parse_and_validate_coords(delivery_lat, delivery_lng)
            result = calculate_shipping(lat, lng)
            distance_km = result['distance_km']
            shipping_fee = result['shipping_fee']
        except (ValueError, TypeError):
            raise ValidationError({"error": "Tọa độ không hợp lệ"})

    # Validate và tính discount bên trong transaction để đảm bảo trạng thái không bị race condition
    voucher_code = data.get('voucher_code', '').strip().upper() if data.get('voucher_code') else None

    with transaction.atomic():
        voucher = None
        discount = Decimal('0')

        if voucher_code:
            voucher, _ = validate_voucher(voucher_code, user)
            discount = calculate_discount(voucher, subtotal)

        total_amount = subtotal + shipping_fee - discount

        order_code = "ORD-" + uuid.uuid4().hex[:8].upper()

        order = Order.objects.create(
            user=user,
            order_code=order_code,
            receiver_name=data.get('receiver_name'),
            receiver_phone=data.get('receiver_phone'),
            address_text=data.get('address_text'),
            note=data.get('note'),
            delivery_lat=data.get('delivery_lat'),
            delivery_lng=data.get('delivery_lng'),
            distance_km=distance_km,
            subtotal=subtotal,
            shipping_fee=shipping_fee,
            voucher=voucher,
            discount_amount=discount,
            total_amount=total_amount,
            payment_method=data.get('payment_method', 'COD'),
        )

        # Consume voucher — TRONG cùng transaction để đảm bảo atomicity
        # Nếu consume fail (race condition — mã vừa hết lượt), transaction rollback
        if voucher:
            consume_voucher(voucher, user, order)


        for item in cart_items:
            # Khóa sản phẩm cứng, không deadlock nhờ order_by('product_id')
            product = Product.objects.select_for_update().get(pk=item.product_id)

            if product.stock_quantity < item.quantity:
                raise ValidationError({
                    "error": f"Không đủ hàng! '{product.name}' chỉ còn {product.stock_quantity}."
                })

            OrderItem.objects.create(
                order=order,
                product=product,
                product_name_snapshot=product.name,   # Snapshot tên tại thời điểm đặt
                unit_price=item.unit_price,            # Giá đã chốt lúc thêm vào giỏ
                quantity=item.quantity,
                subtotal=item.unit_price * item.quantity,
            )

            product.stock_quantity -= item.quantity
            product.save(update_fields=['stock_quantity'])

        # COD: Xóa giỏ hàng ngay vì không cần chờ thanh toán online
        # VNPAY: Giữ giỏ hàng lại — chỉ xóa khi IPN xác nhận PAID
        #        Nếu user hủy/fail → giỏ hàng vẫn còn nguyên
        if order.payment_method == 'COD':
            CartItem.objects.filter(cart=cart).delete()

    # Gửi thông báo cho user (chỉ COD, VNPAY đợi IPN)
    if order.payment_method == 'COD':
        send_push_to_user(
            user=order.user,
            title="Đặt hàng thành công!",
            body=f"Đơn hàng {order.order_code} đã được ghi nhận và đang chờ xử lý.",
            data={"order_code": order.order_code}
        )

    return order


# ─────────────────────────────────────────────
# HỦY ĐƠN HÀNG
# ─────────────────────────────────────────────
def cancel_order(order):
    # Kiểm tra trước khi vào transaction để fail nhanh, không chiếm lock
    if order.status != 'PENDING':
        raise ValidationError({
            "error": "Lỗi! Bạn chỉ có thể hủy đơn hàng đang ở trạng thái Chờ xử lý."
        })

    with transaction.atomic():
        # Khóa đơn hàng — ngăn race condition (double-click hủy hoặc staff duyệt đồng thời)
        order_lock = Order.objects.select_for_update().get(pk=order.pk)

        # Kiểm tra lại sau khi có lock — lần đầu chỉ để fail nhanh, lần này mới là check thật
        if order_lock.status != 'PENDING':
            raise ValidationError({
                "error": "Lỗi! Trạng thái đơn đã thay đổi trên hệ thống."
            })

        # Ngăn hủy đơn VNPAY vừa được thanh toán (IPN và cancel cùng lúc)
        if order_lock.payment_status == 'PAID':
            raise ValidationError({
                "error": "Không thể hủy đơn hàng đã thanh toán. Vui lòng liên hệ hỗ trợ để được hoàn tiền."
            })

        order_lock.status = 'CANCELLED'
        order_lock.save(update_fields=['status'])

        _restore_order_resources(order_lock)
        
    send_push_to_user(
        user=order.user,
        title="Đơn hàng đã hủy",
        body=f"Đơn hàng {order.order_code} của bạn đã được hủy thành công.",
        data={"order_code": order.order_code, "status": "CANCELLED"}
    )

    return {
        "message": f"Đã hủy thành công đơn hàng {order.order_code}! Tiền và Hàng đã chuẩn xác."
    }


# ─────────────────────────────────────────────
# CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG (Staff/Admin)
# ─────────────────────────────────────────────

# Khai báo thứ tự cho phép chuyển trạng thái
# COMPLETED và CANCELLED là trạng thái cuối — không cho chuyển đi đâu nữa
VALID_TRANSITIONS = {
    'PENDING':   ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['SHIPPING',  'CANCELLED'],
    'SHIPPING':  ['COMPLETED'],
    'COMPLETED': [],   # Đơn hoàn thành — không cho hủy, không cho về lại
    'CANCELLED': [],   # Đơn đã hủy — không cho phục hồi qua API này
}


def update_order_status(order, new_status, user):
    # Bỏ kiểm tra quyền khỏi service để tuân thủ SRP và dễ test
    allowed = VALID_TRANSITIONS.get(order.status, [])
    if new_status not in allowed:
        raise ValidationError({
            "error": f"Không thể chuyển từ '{order.status}' sang '{new_status}'! "
                     f"Các trạng thái hợp lệ: {allowed or ['(không có — đơn đã kết thúc)']}"
        })

    with transaction.atomic():
        order_lock = Order.objects.select_for_update().get(pk=order.pk)

        # Kiểm tra lại sau khi có lock — tránh race condition giữa lúc check và lúc lưu
        allowed_after_lock = VALID_TRANSITIONS.get(order_lock.status, [])
        if new_status not in allowed_after_lock:
            raise ValidationError({
                "error": f"Trạng thái đơn đã thay đổi trên hệ thống (hiện tại: {order_lock.status})."
            })

        # Ngăn không cho hủy đơn đã PAID tự động qua API
        if new_status == 'CANCELLED' and order_lock.payment_status == 'PAID':
            raise ValidationError({
                "error": "Không thể tự động hủy đơn hàng đã thanh toán (PAID) qua cổng. "
                         "Vui lòng thực hiện hoàn tiền theo quy trình ngoại tuyến trước khi hủy đơn hệ thống."
            })

        order_lock.status = new_status
        update_fields = ['status']
        
        # Nếu đơn hàng hoàn thành, update thêm completed_at
        if new_status == 'COMPLETED':
            order_lock.completed_at = timezone.now()
            update_fields.append('completed_at')

        order_lock.save(update_fields=update_fields)

        if new_status == 'CANCELLED':
            _restore_order_resources(order_lock)

    # ── Gửi push notification khi thay đổi trạng thái ──
    notify_map = {
        'CONFIRMED': ("Đơn hàng đã xác nhận", f"Đơn hàng {order.order_code} đã được shop xác nhận."),
        'SHIPPING':  ("Đơn hàng đang giao", f"Đơn hàng {order.order_code} đang trên đường giao đến bạn!"),
        'COMPLETED': ("Giao hàng thành công", f"Đơn hàng {order.order_code} đã giao thành công. Cảm ơn bạn!"),
        'CANCELLED': ("Đơn hàng bị hủy", f"Đơn hàng {order.order_code} đã bị hủy bởi shop."),
    }

    if new_status in notify_map:
        title, body = notify_map[new_status]
        send_push_to_user(
            user=order.user,
            title=title,
            body=body,
            data={"order_code": order.order_code, "status": new_status}
        )

    return {"message": f"Đã cập nhật đơn {order.order_code} sang trạng thái {new_status}!"}