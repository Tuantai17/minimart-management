from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, serializers
from django.conf import settings
from django.db import transaction
from store.models import CrawlerProduct


# ─── Serializer validate từng item crawler ────────────────────────────────────
class CrawlerProductItemSerializer(serializers.Serializer):
    """Validate input cho từng sản phẩm nhận từ crawler tool."""
    external_id   = serializers.CharField(max_length=100, required=True)
    name          = serializers.CharField(max_length=255, required=True)
    price         = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=0, required=True)
    unit          = serializers.CharField(max_length=50, allow_blank=True, required=False, default='')
    image_url     = serializers.URLField(max_length=500, allow_blank=True, required=False, default='')
    category_name = serializers.CharField(max_length=100, allow_blank=True, required=False, default='')
    source_url    = serializers.URLField(max_length=500, allow_blank=True, required=False, default='')


class CrawlerImportView(APIView):
    """
    API Ẩn: API này được dùng làm 'Đường hầm' để nhận dữ liệu từ tool cào
    đang chạy ngoài Windows vào hệ thống Docker.
    """
    def post(self, request):
        # Xác thực bằng Secret Key truyền qua header
        secret_key = request.headers.get('X-Crawler-Secret')
        if secret_key != settings.CRAWLER_SECRET:
            return Response({"error": "Mật khẩu hầm bí mật không đúng!"}, status=status.HTTP_403_FORBIDDEN)
            
        products = request.data.get('products', [])
        if not products:
            return Response({"error": "Không có dữ liệu đầu vào"}, status=status.HTTP_400_BAD_REQUEST)
            
        if len(products) > 200:
            return Response(
                {"error": "Payload quá lớn! Tối đa 200 sản phẩm mỗi lần gửi để tránh OOM Server."}, 
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )

        # [AUDIT FIX CRITICAL-01 + HIGH-01] Validate input + wrap trong transaction
        count = 0
        errors = []
        with transaction.atomic():
            for idx, item in enumerate(products):
                item_serializer = CrawlerProductItemSerializer(data=item)
                if not item_serializer.is_valid():
                    errors.append({"index": idx, "errors": item_serializer.errors})
                    continue

                validated = item_serializer.validated_data
                obj, created = CrawlerProduct.objects.update_or_create(
                    external_id=validated['external_id'],
                    source='BHX',
                    defaults={
                        'name':          validated['name'],
                        'price':         validated['price'],
                        'unit':          validated.get('unit', ''),
                        'image_url':     validated.get('image_url', ''),
                        'category_name': validated.get('category_name', ''),
                        'source_url':    validated.get('source_url', ''),
                    }
                )
                if created:
                    count += 1

        response_data = {
            "message": "Đã nhận hàng từ ngoài hầm vào an toàn!",
            "new_items_added": count,
            "total_items_processed": len(products),
        }
        if errors:
            response_data["validation_errors"] = errors[:20]  # Giới hạn 20 lỗi để không bloat response
        return Response(response_data)
