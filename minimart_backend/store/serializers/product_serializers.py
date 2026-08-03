from rest_framework import serializers
from ..models import Category, Product, Banner


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.ReadOnlyField(source='category.name')

    class Meta:
        model = Product
        fields = [
            'id', 'category', 'category_name', 'name', 'price',
            'discount_price', 'stock_quantity', 'unit', 'description',
            'image', 'is_active', 'created_at', 'updated_at'
        ]


class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    products = ProductSerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'image', 'parent', 'children', 'products']

    def get_children(self, obj):
        if obj.children.exists():
            return CategorySerializer(obj.children.all(), many=True).data
        return []


class BannerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Banner
        fields = ['id', 'title', 'image', 'link', 'is_active', 'display_order', 'created_at']
