from django.contrib import admin, messages
from django.utils.html import format_html
from django.core.files.base import ContentFile
from urllib.parse import urlparse
import requests
import os
from import_export import resources
from import_export.admin import ImportExportModelAdmin
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.conf import settings
import random
import re
import logging

logger = logging.getLogger(__name__)

from store.models import Category, Product, CrawlerProduct

class StockLevelFilter(admin.SimpleListFilter):
    title          = 'Trạng thái kho hàng'
    parameter_name = 'stock_status'

    def lookups(self, request, model_admin):
        return (
            ('out_of_stock', '❌ Đã hết hàng (0)'),
            ('low_stock',    '⚠️ Sắp hết hàng (<= 10)'),
            ('in_stock',     '✅ Còn hàng (> 10)'),
        )

    def queryset(self, request, queryset):
        if self.value() == 'out_of_stock':
            return queryset.filter(stock_quantity=0)
        if self.value() == 'low_stock':
            return queryset.filter(stock_quantity__gt=0, stock_quantity__lte=10)
        if self.value() == 'in_stock':
            return queryset.filter(stock_quantity__gt=10)
        return queryset

class ProductResource(resources.ModelResource):
    class Meta:
        model = Product
        import_id_fields = ('sku',)
        fields = ('id', 'sku', 'name', 'price', 'stock_quantity', 'unit', 'is_active', 'category')
        skip_unchanged = True
        report_skipped = True

@admin.register(Product)
class ProductAdmin(ImportExportModelAdmin):
    resource_classes = [ProductResource]
    list_display   = ('id', 'image_tag', 'name', 'category', 'price', 'stock_quantity', 'stock_colored', 'unit', 'is_active')
    list_filter    = ('category', 'is_active', StockLevelFilter)
    search_fields  = ('name', 'sku')
    list_editable  = ('price', 'stock_quantity', 'is_active')
    list_select_related = ('category',)
    list_per_page  = 50
    actions        = [
        'filter_out_of_stock', 'filter_low_stock', 'filter_in_stock',
        'bulk_set_stock_100', 'bulk_set_stock_50', 'bulk_set_stock_0',
        'bulk_set_stock_random'
    ]

    def get_actions(self, request):
        actions = super().get_actions(request)
        # Ẩn các bulk actions trên Production để đảm bảo an toàn dữ liệu
        if not settings.DEBUG:
            for action_name in ('bulk_set_stock_100', 'bulk_set_stock_50',
                                'bulk_set_stock_0', 'bulk_set_stock_random'):
                actions.pop(action_name, None)
        return actions

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def image_tag(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="width: 50px; height: 50px; border-radius: 5px; object-fit: cover;" />',
                obj.image.url
            )
        return "Không có ảnh"
    image_tag.short_description = 'Ảnh'

    def stock_colored(self, obj):
        if obj.stock_quantity == 0:
            color = "red"
        elif obj.stock_quantity <= 10:
            color = "orange"
        else:
            color = "white"
        return format_html(
            '<b style="color: {};">{} {}</b>',
            color, obj.stock_quantity, obj.unit
        )
    stock_colored.short_description   = 'Tồn kho'
    stock_colored.admin_order_field   = 'stock_quantity'

    def changelist_view(self, request, extra_context=None):
        action         = request.POST.get('action')
        filter_actions = ('filter_out_of_stock', 'filter_low_stock', 'filter_in_stock')
        if action in filter_actions and not request.POST.getlist('_selected_action'):
            return getattr(self, action)(request, queryset=None)
        return super().changelist_view(request, extra_context)

    @admin.action(description="❌ Xem sản phẩm HẾT HÀNG (stock = 0)")
    def filter_out_of_stock(self, request, queryset=None):
        return HttpResponseRedirect(
            reverse('admin:store_product_changelist') + '?stock_status=out_of_stock'
        )

    @admin.action(description="⚠️ Xem sản phẩm SẮP HẾT (stock 1–10)")
    def filter_low_stock(self, request, queryset=None):
        return HttpResponseRedirect(
            reverse('admin:store_product_changelist') + '?stock_status=low_stock'
        )

    @admin.action(description="✅ Xem sản phẩm CÒN HÀNG (stock > 10)")
    def filter_in_stock(self, request, queryset=None):
        return HttpResponseRedirect(
            reverse('admin:store_product_changelist') + '?stock_status=in_stock'
        )

    @admin.action(description="📦 Bơm đầy kho (Set 100)")
    def bulk_set_stock_100(self, request, queryset):
        updated = queryset.update(stock_quantity=100)
        self.message_user(request, f"Đã bơm thành công 100 sản phẩm vào {updated} mặt hàng!")

    @admin.action(description="📦 Bơm nửa kho (Set 50)")
    def bulk_set_stock_50(self, request, queryset):
        updated = queryset.update(stock_quantity=50)
        self.message_user(request, f"Đã bơm thành công 50 sản phẩm vào {updated} mặt hàng!")

    @admin.action(description="❌ Xóa sạch tồn kho (Về 0)")
    def bulk_set_stock_0(self, request, queryset):
        updated = queryset.update(stock_quantity=0)
        self.message_user(request, f"Đã đổ bỏ {updated} mặt hàng về 0!")

    @admin.action(description="🎲 Bơm tồn kho ngẫu nhiên (10 - 150)")
    def bulk_set_stock_random(self, request, queryset):
        items = list(queryset)
        for item in items:
            item.stock_quantity = random.randint(10, 150)
        Product.objects.bulk_update(items, ['stock_quantity'])
        self.message_user(request, f"Đã rải số lượng ngẫu nhiên cho {len(items)} mặt hàng!")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display  = ('id', 'category_image', 'name', 'parent', 'created_at')
    search_fields = ('name',)
    list_per_page = 20

    def get_queryset(self, request):
        return self.model.all_objects.all()

    def category_image(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;" />',
                obj.image.url
            )
        return "Không có ảnh"
    category_image.short_description = 'Icon'


# ─── 10. ADMIN CHO DỮ LIỆU CÀO ──────────────────────────────────────────────
@admin.register(CrawlerProduct)
class CrawlerProductAdmin(admin.ModelAdmin):
    list_display = ('id', 'thumbnail_preview', 'name', 'price_display', 'target_category', 'category_name', 'source')
    list_display_links = ('id', 'name')
    list_filter = ('source', 'category_name', 'target_category')
    search_fields = ('name', 'external_id', 'category_name')
    list_editable = ('target_category',)
    list_select_related = ('target_category',)
    list_per_page = 20
    actions = ['move_to_shop']

    def thumbnail_preview(self, obj):
        if obj.image_url:
            return format_html('<img src="{}" style="height: 50px; border-radius: 4px;" />', obj.image_url)
        return "No Image"
    thumbnail_preview.short_description = "Ảnh"

    def price_display(self, obj):
        price_str = "{:,.0f}".format(obj.price) if obj.price else "0"
        return format_html('<b style="color: #28a745;">{}đ</b>', price_str)
    price_display.short_description = "Giá BHX"

    @admin.action(description="🚚 Duyệt sản phẩm bộ chọn sang Shop chính")
    def move_to_shop(self, request, queryset):
        allowed_domains = getattr(settings, 'CRAWLER_ALLOWED_DOMAINS', [])
        created_count = 0
        updated_count = 0
        
        def is_safe_url(url):
            if not url or not url.startswith('http'):
                return False
            parsed = urlparse(url)
            return parsed.netloc in allowed_domains

        items = list(queryset)
        running_master = None
        
        for item in items:
            if item.target_category:
                running_master = item.target_category
                
            if running_master:
                target_cat = running_master
            else:
                cat_name = item.category_name if item.category_name else "Sản phẩm chưa rõ"
                cat_name = cat_name.replace('-', ' ').title()
                target_cat, _ = Category.objects.get_or_create(name=cat_name)

            product = Product.objects.filter(sku=f"BHX-{item.external_id}").first()
            is_new = not product
            if is_new:
                product = Product(sku=f"BHX-{item.external_id}")
                
            desc_text = ""
            if is_safe_url(item.source_url):
                try:
                    res2 = requests.get(item.source_url, timeout=5)
                    if res2.status_code == 200:
                        m = re.search(r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']', res2.text, re.IGNORECASE)
                        if m:
                            desc_text = m.group(1).strip()
                except requests.exceptions.RequestException as e:
                    logger.warning("Failed to fetch desc from %s: %s", item.source_url, e)
            
            product.name = item.name
            product.price = item.price
            product.unit = item.unit or "Cái"
            product.category = target_cat
            product.description = desc_text
            product.save()

            if is_safe_url(item.image_url):
                try:
                    res = requests.get(item.image_url, timeout=10)
                    if res.status_code == 200:
                        parsed = urlparse(item.image_url)
                        file_name = os.path.basename(parsed.path)
                        if not file_name or '.' not in file_name:
                            file_name = f"bhx_{item.external_id}.jpg"
                        
                        if not is_new and product.image:
                            product.image.delete(save=False)
                            
                        product.image.save(file_name, ContentFile(res.content), save=True)
                except requests.exceptions.RequestException as e:
                    logger.warning("Failed to fetch image from %s: %s", item.image_url, e)

            if is_new:
                created_count += 1
            else:
                updated_count += 1
        
        self.message_user(request, f"Đã quét xong: Mở bán mới {created_count} | Cập nhật {updated_count} mặt hàng.")

