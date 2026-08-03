from datetime import datetime
import hashlib

from django.core.cache import cache
from django.conf import settings
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.views import APIView
from django.db.models import Count, Sum, DecimalField, Value
from django.db.models.functions import Coalesce

from ..models import Category, Product, Banner, OrderItem
from ..serializers import CategorySerializer, ProductSerializer, BannerSerializer


# ─── HELPER ──────────────────────────────────────────────────────────────────

def invalidate_product_cache():
    """Xóa cache product khi có thay đổi data."""
    try:
        cache.delete_pattern("products_*")
    except AttributeError:
        cache.clear()


# ─── DANH MỤC ────────────────────────────────────────────────────────────────

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.prefetch_related('children', 'products').all()
    serializer_class = CategorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'parent__name', 'parent__parent__name']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]


# ─── SẢN PHẨM ────────────────────────────────────────────────────────────────

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'category__name']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]

    def get_queryset(self):
        # select_related('category') để tránh lỗi N+1 query
        queryset = Product.objects.select_related('category').all()
        category_id = self.request.query_params.get('category_id')
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        return queryset

    def list(self, request, *args, **kwargs):
        page        = request.query_params.get('page', 1)
        category_id = request.query_params.get('category_id', 'all')
        search      = request.query_params.get('search', '')[:100]  # Giới hạn 100 ký tự
        
        # Hash cache key bằng MD5 để tiết kiệm RAM thay vì lưu chuỗi dài
        raw_key     = f"products_cat{category_id}_page{page}_search{search}"
        cache_key   = "products_" + hashlib.md5(raw_key.encode('utf-8')).hexdigest()

        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, timeout=60)
        return response

    def perform_create(self, serializer):
        serializer.save()
        invalidate_product_cache()

    def perform_update(self, serializer):
        serializer.save()
        invalidate_product_cache()

    def perform_destroy(self, instance):
        instance.delete()
        invalidate_product_cache()

    @action(detail=False, methods=['GET'], permission_classes=[IsAdminUser], url_path='low-stock')
    def low_stock(self, request):
        products = list(
            Product.objects.filter(stock_quantity__lte=10, is_active=True)
            .order_by('stock_quantity')
        )
        serializer = self.get_serializer(products, many=True)
        return Response({
            "count": len(products),
            "results": serializer.data,
        }, status=status.HTTP_200_OK)


# ─── BANNER ──────────────────────────────────────────────────────────────────

class BannerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Banner.objects.filter(is_active=True).order_by('display_order')
    serializer_class = BannerSerializer
    permission_classes = [AllowAny]


# ─── SẢN PHẨM BÁN CHẠY ──────────────────────────────────────────────────────

class BestSellingProductsAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        # ── Validate limit ───────────────────────────────
        try:
            limit = int(request.query_params.get("limit", 10))
            if not 1 <= limit <= 50:
                raise ValueError
        except ValueError:
            return Response(
                {"error": "limit phải là số nguyên từ 1-50"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Validate dates ───────────────────────────────
        try:
            start_date = datetime.strptime(request.query_params["start_date"], "%Y-%m-%d").date() if "start_date" in request.query_params else None
            end_date   = datetime.strptime(request.query_params["end_date"],   "%Y-%m-%d").date() if "end_date"   in request.query_params else None
            
            if start_date and end_date and start_date > end_date:
                return Response(
                    {"error": "start_date không được lớn hơn end_date"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except ValueError:
            return Response(
                {"error": "Ngày phải có định dạng YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Validate category_id ─────────────────────────
        try:
            category_id = int(request.query_params["category_id"]) if "category_id" in request.query_params else None
        except ValueError:
            return Response(
                {"error": "category_id không hợp lệ"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Query ────────────────────────────────────────
        raw_statuses = request.query_params.get("statuses", "CONFIRMED,SHIPPING,COMPLETED").split(",")
        allowed_statuses = {"PENDING", "CONFIRMED", "SHIPPING", "COMPLETED", "CANCELLED"}
        statuses = [s.strip() for s in raw_statuses if s.strip() in allowed_statuses]
        if not statuses:
            statuses = ["CONFIRMED", "SHIPPING", "COMPLETED"]

        include_inactive = request.query_params.get("include_inactive", "false") == "true"
        is_staff = request.user and request.user.is_staff

        # ── Check Cache ──────────────────────────────────
        # Cache các truy vấn aggregation nặng để chống DoS
        raw_cache_key = f"bestselling_{limit}_{start_date}_{end_date}_{category_id}_{','.join(statuses)}_{include_inactive}_staff{is_staff}"
        cache_key = "products_" + hashlib.md5(raw_cache_key.encode('utf-8')).hexdigest()
        
        cached_data = cache.get(cache_key)
        if cached_data:
            # Sửa đổi uri do cache không có context request domain nếu host thay đổi
            return Response(cached_data)

        qs = OrderItem.objects.filter(order__status__in=statuses)
        if start_date:       qs = qs.filter(order__created_at__date__gte=start_date)
        if end_date:         qs = qs.filter(order__created_at__date__lte=end_date)
        if category_id:      qs = qs.filter(product__category_id=category_id)
        if not include_inactive: qs = qs.filter(product__is_active=True)

        rows = (
            qs.values(
                "product", "product__name", "product__category_id",
                "product__category__name", "product__image",
                "product__unit", "product__price", "product__discount_price",
            )
            .annotate(
                total_sold  = Coalesce(Sum("quantity"), 0),
                order_count = Count("order", distinct=True),
                revenue     = Coalesce(
                    Sum("subtotal"), Value(0),
                    output_field=DecimalField(max_digits=18, decimal_places=2),
                ),
            )
            .order_by("-total_sold", "-order_count", "-revenue")[:limit]
        )

        # ── Build response ───────────────────────────────
        results = []
        
        for i, row in enumerate(rows):
            item = {
                "rank": i + 1,
                "product_id": row["product"],
                "name": row["product__name"],
                "category_id": row["product__category_id"],
                "category_name": row["product__category__name"],
                "image": request.build_absolute_uri(f"{settings.MEDIA_URL}{row['product__image']}") if row.get("product__image") else "",
                "unit": row["product__unit"],
                "price": row["product__price"],
                "discount_price": row["product__discount_price"],
                "total_sold": row["total_sold"],
            }
            if is_staff:
                item["order_count"] = row["order_count"]
                item["revenue"] = row["revenue"]
            results.append(item)

        response_data = {"count": len(results), "results": results}
        cache.set(cache_key, response_data, timeout=900)
        return Response(response_data)