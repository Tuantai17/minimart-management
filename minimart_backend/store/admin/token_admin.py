from django.contrib import admin
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from rest_framework_simplejwt.token_blacklist.admin import OutstandingTokenAdmin as BaseOutstandingTokenAdmin

# Ghi đè OutstandingTokenAdmin mặc định để bổ sung tính năng quản lý
try:
    admin.site.unregister(OutstandingToken)
except admin.sites.NotRegistered:
    pass

@admin.register(OutstandingToken)
class OutstandingTokenAdmin(BaseOutstandingTokenAdmin):
    list_display = ('user', 'jti', 'created_at', 'expires_at')
    actions = ['blacklist_tokens']

    @admin.action(description="🚫 Vô hiệu hóa (Blacklist) các Token đã chọn")
    def blacklist_tokens(self, request, queryset):
        for token in queryset:
            BlacklistedToken.objects.get_or_create(token=token)
        self.message_user(request, f"Đã vô hiệu hóa thành công {queryset.count()} token.")

# Giữ nguyên bảng BlacklistedToken mặc định vì nó chỉ để xem
