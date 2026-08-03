from django.contrib import admin, messages
from django.utils.html import format_html
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User

from store.models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display  = ('user', 'phone', 'avatar_tag')
    raw_id_fields = ('user',)
    list_select_related = ('user',)
    search_fields = ('user__username', 'user__email', 'phone')
    list_editable = ('phone',)
    list_per_page = 10

    def avatar_tag(self, obj):
        if obj.avatar_url:
            return format_html(
                '<img src="{}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;" />',
                obj.avatar_url.url
            )
        return "Không có ảnh"
    avatar_tag.short_description = 'Ảnh đại diện'


admin.site.unregister(User)

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display  = ('username', 'email', 'first_name', 'is_active', 'is_staff', 'is_superuser', 'date_joined')
    list_filter   = ('is_active', 'is_staff', 'is_superuser')
    list_editable = ('is_active', 'is_staff')
    actions       = ['lock_users', 'unlock_users']

    @admin.action(description="🔒 Khóa tài khoản đã chọn")
    def lock_users(self, request, queryset):
        queryset = queryset.exclude(id=request.user.id)
        count    = queryset.update(is_active=False)
        self.message_user(request, f"Đã khóa {count} tài khoản.", level=messages.SUCCESS)

    @admin.action(description="🔓 Mở khóa tài khoản đã chọn")
    def unlock_users(self, request, queryset):
        count = queryset.update(is_active=True)
        self.message_user(request, f"Đã mở khóa {count} tài khoản.", level=messages.SUCCESS)

    def save_model(self, request, obj, form, change):
        if obj.id == request.user.id:
            obj.is_active    = True
            obj.is_staff     = True
            obj.is_superuser = True
        super().save_model(request, obj, form, change)

        instances = formset.save(commit=False)
        for obj in instances:
            if obj.id == request.user.id:
                obj.is_active    = True
                obj.is_staff     = True
                obj.is_superuser = True
            obj.save()
        formset.save_m2m()
