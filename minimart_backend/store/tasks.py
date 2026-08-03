import logging
from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.db import transaction, DatabaseError
from django.utils import timezone
from .services.order_services import _restore_order_resources
from .models import Product,Order

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# JOB 1: Tự động hủy đơn VNPAY hết hạn
# ─────────────────────────────────────────────
def auto_cancel_expired_vnpay_orders():
    """
    Cronjob: Tự động hủy các đơn hàng VNPAY ở trạng thái PENDING quá 15 phút.
    Lý do: Sau khi đặt hàng, tồn kho bị trừ ngay. Nếu khách không trả tiền và tắt App,
    đơn nằm PENDING mãi gây kẹt hàng. Job này nhả tồn kho + voucher về lại.

    Chạy mỗi 5 phút qua APScheduler.
    """

    cutoff_time = timezone.now() - timezone.timedelta(minutes=15)
    expired_orders = Order.objects.filter(
        payment_method='VNPAY',
        status='PENDING',
        payment_status='UNPAID',
        created_at__lt=cutoff_time,
    )

    count = expired_orders.count()
    if count == 0:
        logger.debug("auto_cancel: Không có đơn VNPAY hết hạn.")
        return

    cancelled = 0
    for order in expired_orders:
        try:
            with transaction.atomic():
                order_lock = Order.objects.select_for_update().get(pk=order.pk)

                # Double-check: tránh race với IPN đến cùng lúc
                if order_lock.status != 'PENDING' or order_lock.payment_status != 'UNPAID':
                    continue

                order_lock.status = 'CANCELLED'
                order_lock.save(update_fields=['status'])

                _restore_order_resources(order_lock)
                cancelled += 1
                logger.info(
                    "auto_cancel: Đã hủy đơn hàng %s (VNPAY hết hạn 15 phút).",
                    order_lock.order_code
                )
        except DatabaseError:
            logger.exception(
                "auto_cancel: Lỗi khi hủy đơn %s.", order.order_code
            )

    logger.info("auto_cancel: Đã hủy %d/%d đơn VNPAY hết hạn.", cancelled, count)


# ─────────────────────────────────────────────
# JOB 2: Báo cáo tồn kho sắp hết
# ─────────────────────────────────────────────
def check_low_stock_and_notify_admin():
    # [AUDIT FIX HIGH-04] Dùng .only() tránh load toàn bộ fields + evaluate 1 lần
    low_stock_products = list(
        Product.objects.filter(stock_quantity__lte=10, is_active=True)
        .only('id', 'name', 'stock_quantity')
        .order_by('stock_quantity')
    )
    
    if not low_stock_products:
        return "Kho hàng ổn định. Không cần gửi báo cáo."
    
    rows = ""
    for p in low_stock_products:
        rows += f"""
        <tr>
            <td style="padding:8px;border:1px solid #ddd;">{p.id}</td>
            <td style="padding:8px;border:1px solid #ddd;">{p.name}</td>
            <td style="padding:8px;border:1px solid #ddd;color:red;font-weight:bold;">{p.stock_quantity}</td>
        </tr>"""
    
    html_content = f"""
    <h2>⚠️ Báo Cáo Tồn Kho Sắp Hết - MiniMart</h2>
    <p>Các sản phẩm sau đây có tồn kho dưới 10 đơn vị:</p>
    <table style="border-collapse:collapse;width:100%;">
        <tr style="background:#f2f2f2;">
            <th style="padding:8px;border:1px solid #ddd;">ID</th>
            <th style="padding:8px;border:1px solid #ddd;">Tên Sản Phẩm</th>
            <th style="padding:8px;border:1px solid #ddd;">Tồn Kho</th>
        </tr>
        {rows}
    </table>
    <p>Vui lòng nhập hàng sớm!</p>
    """
    
    recipients = User.objects.filter(
        is_staff=True, 
        profile__receive_stock_alerts=True
    ).values_list('email', flat=True)

    recipient_list = [email for email in recipients if email]
    
    if not recipient_list:
         return "Có sản phẩm sắp hết hàng nhưng không có Admin/Staff nào bật nhận email."

    send_mail(
        subject="[MiniMart] ⚠️ Cảnh Báo Tồn Kho Sắp Hết!",
        message="Vui lòng xem email dưới dạng HTML.",
        from_email=settings.EMAIL_HOST_USER,
        recipient_list=recipient_list,
        html_message=html_content,
        fail_silently=False,
    )
    
    return f"Đã gửi báo cáo {len(low_stock_products)} sản phẩm sắp hết hàng!"
