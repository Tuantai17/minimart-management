from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError
from store.models import Voucher, UserVoucherUsage

class VoucherAdminForm(forms.ModelForm):
    class Meta:
        model = Voucher
        fields = '__all__'

    def clean(self):
        cleaned_data = super().clean()
        discount_type = cleaned_data.get('discount_type')
        discount_value = cleaned_data.get('discount_value')
        code = cleaned_data.get('code')

        if code:
            cleaned_data['code'] = code.strip().upper()

        if discount_type == 'PERCENT' and discount_value is not None:
            if discount_value > 100:
                raise ValidationError({
                    'discount_value': f'Giảm theo % không được vượt quá 100. Bạn đang nhập {discount_value}%.'
                })
        return cleaned_data

@admin.register(Voucher)
class VoucherAdmin(admin.ModelAdmin):
    form = VoucherAdminForm
    list_display = (
        'code', 'discount_type', 'discount_value', 'min_order_amount', 
        'usage_count', 'max_usage', 'is_active', 'end_date'
    )
    list_filter = ('discount_type', 'is_active', 'start_date', 'end_date')
    search_fields = ('code',)
    readonly_fields = ('usage_count', 'created_at', 'updated_at', 'created_by')
    
    fieldsets = (
        ('Thông tin cơ bản', {
            'fields': ('code', 'is_active', 'created_by')
        }),
        ('Cấu hình Giảm giá', {
            'fields': ('discount_type', 'discount_value', 'max_discount_amount')
        }),
        ('Điều kiện & Giới hạn', {
            'fields': ('min_order_amount', 'start_date', 'end_date', 'max_usage', 'usage_count', 'max_usage_per_user')
        }),
        ('Thời gian', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def save_model(self, request, obj, form, change):
        if not obj.pk:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
    
    def has_delete_permission(self, request, obj=None):
        if obj and obj.usage_count > 0:
            return False
        return super().has_delete_permission(request, obj)


@admin.register(UserVoucherUsage)
class UserVoucherUsageAdmin(admin.ModelAdmin):
    list_display = ('user', 'voucher', 'order', 'used_at')
    list_filter = ('used_at', 'voucher__discount_type')
    search_fields = ('user__username', 'voucher__code', 'order__order_code')
    readonly_fields = ('user', 'voucher', 'order', 'used_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
