from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils import timezone
from store.services.support_service import SupportService

from store.models import SupportTicket, SupportMessage, Review, ReviewMedia
from store.admin.order_admin import SoftDeleteFilter

class SupportMessageInline(admin.TabularInline):
    model           = SupportMessage
    extra           = 1
    fields          = ('message', 'is_read', 'created_at')
    readonly_fields = ('created_at', 'is_admin_reply')

    def get_queryset(self, request):
        return SupportMessage.all_objects.filter(delete_at__isnull=True)


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ('user', 'is_resolved_status', 'updated_at')
    list_select_related = ('user', 'user__profile')
    inlines      = [SupportMessageInline]

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for obj in instances:
            if isinstance(obj, SupportMessage) and not obj.pk:
                SupportService.send_message(
                    ticket=obj.ticket,
                    sender_user=request.user,
                    is_admin_reply=True,
                    message_text=obj.message,
                )
            else:
                obj.save()
        formset.save_m2m()

        for obj in formset.deleted_objects:
            obj.delete_at = timezone.now()
            obj.delete_by = request.user
            obj.save(update_fields=['delete_at', 'delete_by'])

    def is_resolved_status(self, obj):
        if obj.is_resolved:
            return format_html('<b style="color: {};">{}</b>', 'green', '✔ Xong')
        return format_html('<b style="color: {};">{}</b>', 'red', '🔥 Chờ xử lý')
    is_resolved_status.short_description = "Trạng thái"


@admin.register(SupportMessage)
class SupportMessageAdmin(admin.ModelAdmin):
    list_display    = ('id', 'ticket_info', 'sender_role', 'message_snippet', 'created_at', 'deleted_status')
    list_filter     = ('is_admin_reply', ('delete_at', admin.DateFieldListFilter))
    search_fields   = ('message', 'sender_user__username', 'ticket__user__username')
    readonly_fields = ('created_at', 'delete_at', 'delete_by', 'ticket', 'sender_user', 'is_admin_reply', 'message')

    def get_queryset(self, request):
        return SupportMessage.all_objects.all()

    def ticket_info(self, obj):
        return f"Ticket của {obj.ticket.user.username}"
    ticket_info.short_description = "Thuộc Ticket"

    def sender_role(self, obj):
        return "👑 Admin" if obj.is_admin_reply else "👤 Khách"
    sender_role.short_description = "Phe phái"

    def message_snippet(self, obj):
        return obj.message[:50] + "..." if len(obj.message) > 50 else obj.message
    message_snippet.short_description = "Nội dung"

    def deleted_status(self, obj):
        if obj.delete_at:
            nguoi_xoa = obj.delete_by.username if obj.delete_by else 'Ai đó'
            return format_html('<b style="color:red;">🗑️ Bị xoá bởi {}</b>', nguoi_xoa)
        return "Còn sống"
    deleted_status.short_description = "Trạng thái"


class ReviewMediaInline(admin.TabularInline):
    model = ReviewMedia
    extra = 0
    readonly_fields = ('media_preview', 'file', 'media_type', 'deleted_status', 'created_at')
    
    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
        
    def media_preview(self, obj):
        if obj.file:
            if obj.media_type == 'image':
                return format_html('<img src="{}" style="max-height: 150px; border-radius: 5px;"/>', obj.file.url)
            return format_html('<video src="{}" height="150" controls style="border-radius: 5px;" />', obj.file.url)
        return "Không có file"
    media_preview.short_description = "Xem thử"

    def deleted_status(self, obj):
        if obj.delete_at:
            return format_html('<b style="color:red;">🗑️ Đã ẩn ({})</b>', obj.delete_at.strftime('%d/%m/%Y'))
        return "Hiển thị"
    deleted_status.short_description = "Trạng thái"


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display  = ('id', 'product', 'user', 'rating', 'media_count', 'has_reply', 'deleted_status', 'created_at')
    list_filter   = ('rating', 'created_at', 'shop_replied_at', ('delete_at', admin.EmptyFieldListFilter))
    search_fields = ('product__name', 'user__username', 'comment', 'shop_reply')
    list_select_related = ('product', 'user', 'shop_replied_by')
    readonly_fields = (
        'product', 'user', 'rating', 'comment',
        'created_at', 'shop_replied_at', 'shop_replied_by',
        'delete_at', 'delete_by',
    )
    fieldsets = (
        ('Nội dung đánh giá của khách', {
            'fields': ('product', 'user', 'rating', 'comment', 'created_at')
        }),
        ('Phản hồi của cửa hàng', {
            'fields': ('shop_reply', 'shop_replied_at', 'shop_replied_by')
        }),
        ('Trạng thái hệ thống', {
            'fields': ('delete_at', 'delete_by'),
            'classes': ('collapse',),
        }),
    )
    inlines = [ReviewMediaInline]

    def get_queryset(self, request):
        return Review.all_objects.all()

    def save_model(self, request, obj, form, change):
        if 'shop_reply' in form.changed_data and obj.shop_reply:
            obj.shop_replied_at = timezone.now()
            obj.shop_replied_by = request.user
        super().save_model(request, obj, form, change)

    def media_count(self, obj):
        count = obj.media.count()
        if count > 0:
            return format_html('<b style="color: blue;">{} file</b>', count)
        return "Không có"
    media_count.short_description = "Ảnh/Video"

    def has_reply(self, obj):
        if obj.shop_reply:
            return format_html('<b style="color: {};">{}</b>', 'green', '✔ Đã trả lời')
        return format_html('<b style="color: {};">{}</b>', 'gray', 'Chưa có')
    has_reply.short_description = "Phản hồi cửa hàng"

    def deleted_status(self, obj):
        if obj.delete_at:
            nguoi_xoa = obj.delete_by.username if obj.delete_by else 'Ai đó'
            return format_html('<b style="color:red;">🗑️ Bị xoá bởi {}</b>', nguoi_xoa)
        return "Còn sống"
    deleted_status.short_description = "Trạng thái Soft-delete"
