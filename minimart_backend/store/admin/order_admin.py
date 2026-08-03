import logging

from django.contrib import admin, messages
from django.db import transaction
from django.utils import timezone
from django.utils.html import format_html
from rest_framework.exceptions import ValidationError

from store.models import Cart, CartItem, Order, OrderItem
from store.services.order_services import update_order_status, _restore_order_resources
from store.services.vnpay_service import refund_vnpay_order
from django.db import DatabaseError

logger = logging.getLogger(__name__)

class CartItemInline(admin.TabularInline):
    model          = CartItem
    extra          = 0
    readonly_fields = ('product', 'quantity', 'unit_price')

@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display  = ('user', 'created_at', 'updated_at')
    inlines       = [CartItemInline]
    list_per_page = 10

class SoftDeleteFilter(admin.SimpleListFilter):
    title          = 'Trạng thái thùng rác'
    parameter_name = 'deleted'

    def lookups(self, request, model_admin):
        return (
            ('active',  'Đang hoạt động (Mặc định)'),
            ('deleted', 'Đã xóa (Thùng rác)'),
            ('all',     'Tất cả'),
        )

    def queryset(self, request, queryset):
        if self.value() == 'deleted':
            return queryset.filter(delete_at__isnull=False)
        if self.value() == 'all':
            return queryset
        return queryset.filter(delete_at__isnull=True)

class OrderItemInline(admin.TabularInline):
    model           = OrderItem
    extra           = 0
    readonly_fields = ('product', 'product_name_snapshot', 'unit_price', 'quantity', 'subtotal')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display   = (
        'id', 'order_code', 'user', 'receiver_name',
        'total_amount', 'payment_method_display', 'payment_status_display',
        'status', 'created_at',
    )
    list_filter    = ('status', 'payment_method', 'payment_status', SoftDeleteFilter)
    search_fields  = ('order_code', 'receiver_name', 'receiver_phone')
    list_editable  = ('status',)
    list_select_related = ('user',)
    readonly_fields = (
        'order_code', 'user', 'created_at', 'updated_at', 'delete_at', 'delete_by',
        'payment_status', 'transaction_id', 'payment_log', 'discount_amount', 'payment_method',
        'subtotal', 'shipping_fee', 'total_amount', 'voucher', 'completed_at',
        'delivery_lat', 'delivery_lng', 'distance_km',
    )
    fieldsets = (
        ('📦 Thông tin đơn hàng', {
            'fields': ('order_code', 'user', 'status', 'note'),
        }),
        ('👤 Thông tin người nhận', {
            'fields': ('receiver_name', 'receiver_phone', 'address_text'),
        }),
        ('💰 Tài chính', {
            'fields': ('subtotal', 'shipping_fee', 'voucher', 'discount_amount', 'total_amount'),
        }),
        ('💳 Thanh toán', {
            'fields': ('payment_method', 'payment_status', 'transaction_id', 'payment_log'),
        }),
        ('🚚 Giao hàng', {
            'fields': ('delivery_lat', 'delivery_lng', 'distance_km'),
            'classes': ('collapse',),
        }),
        ('🗓️ Thời gian hệ thống', {
            'fields': ('created_at', 'updated_at', 'completed_at', 'delete_at', 'delete_by'),
            'classes': ('collapse',),
        }),
    )
    inlines        = [OrderItemInline]
    list_per_page  = 20
    date_hierarchy = 'created_at'
    actions        = ['restore_orders', 'soft_delete_orders', 'refund_and_cancel_orders']

    def get_queryset(self, request):
        return Order.all_objects.all()

    def payment_method_display(self, obj):
        labels = {'COD': '🏠 COD', 'VNPAY': '💳 VNPAY'}
        return labels.get(obj.payment_method, obj.payment_method)
    payment_method_display.short_description = 'Phương thức'
    payment_method_display.admin_order_field = 'payment_method'

    def payment_status_display(self, obj):
        mapping = {
            'UNPAID':   ('orange', '⏳ Chưa thanh toán'),
            'PAID':     ('green',  '✅ Đã thanh toán'),
            'FAILED':   ('red',    '❌ Thất bại'),
            'REFUNDED': ('gray',   '↩️ Đã hoàn tiền'),
        }
        color, label = mapping.get(obj.payment_status, ('black', obj.payment_status))
        return format_html('<b style="color:{};">{}</b>', color, label)
    payment_status_display.short_description = 'Thanh toán'
    payment_status_display.admin_order_field = 'payment_status'

    def get_readonly_fields(self, request, obj=None):
        base = list(self.readonly_fields)
        if obj and obj.status in ('COMPLETED', 'CANCELLED'):
            return base + ['status']
        return base

    def save_model(self, request, obj, form, change):
        if change and obj.pk and 'status' in form.changed_data:
            old_order = Order.objects.get(pk=obj.pk)
            if obj.status != old_order.status:
                try:
                    update_order_status(old_order, obj.status, request.user)
                except ValidationError as e:
                    self.message_user(request, f"Lỗi: {e.detail.get('error', e)}", level=messages.ERROR)
                    obj.status = old_order.status
                    return

        super().save_model(request, obj, form, change)

    def get_actions(self, request):
        actions = super().get_actions(request)
        if 'delete_selected' in actions:
            del actions['delete_selected']
        return actions

    @admin.action(description="✅ Khôi phục các đơn hàng đã chọn")
    def restore_orders(self, request, queryset):
        restorable = queryset.filter(delete_at__isnull=False)
        count      = restorable.count()
        if count == 0:
            self.message_user(request, "Không có đơn hàng nào cần khôi phục.", level=messages.WARNING)
            return
        restorable.update(delete_at=None, delete_by=None)
        self.message_user(request, f"Đã khôi phục {count} đơn hàng thành công.", level=messages.SUCCESS)

    @admin.action(description="💸 Hoàn tiền VNPAY & Hủy đơn hàng đã chọn")
    def refund_and_cancel_orders(self, request, queryset):
        """
        Hành động Admin: Gọi VNPAY Refund API rồi Hủy đơn + hoàn kho + hoàn voucher.
        Chỉ áp dụng cho đơn VNPAY đã thanh toán (PAID) chưa bị hủy.
        """
        eligible = queryset.filter(
            payment_method='VNPAY',
            payment_status='PAID',
            status__in=['CONFIRMED', 'SHIPPING', 'PENDING'],
        )

        if not eligible.exists():
            self.message_user(
                request,
                "Không có đơn hàng nào hợp lệ để hoàn tiền "
                "(phải là đơn VNPAY đã thanh toán và chưa hủy).",
                level=messages.WARNING
            )
            return

        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        admin_ip = x_forwarded_for.split(',')[0].strip() if x_forwarded_for else request.META.get('REMOTE_ADDR', '127.0.0.1')

        success_count = 0
        fail_count = 0

        for order in eligible:
            refund_result = refund_vnpay_order(order, admin_user_ip=admin_ip)

            if not refund_result['success']:
                self.message_user(
                    request,
                    f"Đơn {order.order_code}: VNPAY từ chối hoàn tiền — {refund_result['message']}. "
                    f"Đơn KHÔNG bị hủy, vui lòng xử lý thủ công.",
                    level=messages.ERROR
                )
                fail_count += 1
                continue

            try:
                with transaction.atomic():
                    order_lock = Order.objects.select_for_update().get(pk=order.pk)
                    order_lock.status = 'CANCELLED'
                    order_lock.payment_status = 'REFUNDED'
                    order_lock.payment_log = order_lock.payment_log or {}
                    order_lock.payment_log['refund_response'] = refund_result['raw']
                    order_lock.save(update_fields=['status', 'payment_status', 'payment_log'])
                    _restore_order_resources(order_lock)
                logger.info(
                    "[ADMIN REFUND] Admin %s đã hoàn tiền VNPAY cho đơn %s (tổng: %s VNĐ).",
                    request.user.username, order.order_code, order.total_amount
                )
                success_count += 1
            except DatabaseError:
                logger.exception("Lỗi cập nhật DB sau khi hoàn tiền VNPAY cho đơn %s", order.order_code)
                self.message_user(
                    request,
                    f"Đơn {order.order_code}: VNPAY đã hoàn tiền nhưng lỗi khi cập nhật DB. "
                    f"Hãy kiểm tra thủ công!",
                    level=messages.ERROR
                )
                fail_count += 1

        if success_count:
            self.message_user(
                request,
                f"Đã hoàn tiền VNPAY và hủy thành công {success_count} đơn hàng.",
                level=messages.SUCCESS
            )
        if fail_count:
            self.message_user(
                request,
                f"{fail_count} đơn hàng gặp lỗi, vui lòng kiểm tra log.",
                level=messages.WARNING
            )

    @admin.action(description="🗑️ Xóa các đơn hàng đã chọn (Đưa vào thùng rác)")
    def soft_delete_orders(self, request, queryset):
        self.delete_queryset(request, queryset)

    def delete_model(self, request, obj):
        if obj.delete_at is not None:
            self.message_user(
                request,
                f"Đơn hàng {obj.order_code} đã ở trong thùng rác rồi.",
                level=messages.WARNING
            )
            return

        if obj.status != 'CANCELLED':
            self.message_user(
                request,
                f"Không thể xóa đơn {obj.order_code}. "
                f"Chỉ được xóa đơn hàng có trạng thái 'Đã hủy' (hiện tại: {obj.status}).",
                level=messages.ERROR
            )
            return

        obj.delete_at = timezone.now()
        obj.delete_by = request.user
        obj.save(update_fields=['delete_at', 'delete_by'])
        self.message_user(
            request,
            f"Đơn hàng {obj.order_code} đã được đưa vào thùng rác.",
            level=messages.SUCCESS
        )

    def delete_queryset(self, request, queryset):
        valid_orders  = queryset.filter(status='CANCELLED', delete_at__isnull=True)
        valid_count   = valid_orders.count()
        invalid_count = queryset.count() - valid_count
        if valid_count > 0:
            valid_orders.update(delete_at=timezone.now(), delete_by=request.user)
            self.message_user(
                request,
                f"Đã đưa {valid_count} đơn hàng vào thùng rác.",
                level=messages.SUCCESS
            )
        if invalid_count > 0:
            self.message_user(
                request,
                f"Bỏ qua {invalid_count} đơn không hợp lệ (không phải Đã hủy hoặc đã trong thùng rác).",
                level=messages.WARNING
            )
