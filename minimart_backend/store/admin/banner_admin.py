from django.contrib import admin
from django.utils.html import format_html

from store.models import Banner

@admin.register(Banner)
class BannerAdmin(admin.ModelAdmin):
    list_display  = ('id', 'title', 'image_tag', 'is_active', 'display_order', 'created_at')
    list_filter   = ('is_active',)
    search_fields = ('title',)
    list_editable = ('is_active', 'display_order')
    list_per_page = 10

    def image_tag(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="width: 100px; height: auto; border-radius: 5px;" />',
                obj.image.url
            )
        return "Không có ảnh"
    image_tag.short_description = 'Ảnh Banner'
