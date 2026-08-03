from rest_framework import serializers
from ..models import Cart, CartItem, Order, OrderItem
from .product_serializers import ProductSerializer


class CartItemSerializer(serializers.ModelSerializer):
    product_details = ProductSerializer(source='product', read_only=True)
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ['id', 'product', 'product_details', 'quantity', 'unit_price', 'subtotal']
        read_only_fields = ['unit_price']

    def get_subtotal(self, obj):
        return obj.quantity * obj.unit_price


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total_price = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ['id', 'user', 'items', 'total_price']
        read_only_fields = ['user']  # ✅ Added

    # ✅ Moved outside Meta — was accidentally nested inside it
    def get_total_price(self, obj):
        # Dùng all() để tận dụng prefetch cache từ view, triệt tiêu N+1 query
        return sum(item.quantity * item.unit_price for item in obj.items.all())


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name_snapshot', 'unit_price', 'quantity', 'subtotal']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    voucher_code = serializers.CharField(
        max_length=50, required=False, allow_blank=True, write_only=True,
        help_text="Mã giảm giá (áp dụng khi tạo đơn)."
    )

    class Meta:
        model = Order
        fields = [
            'id', 'order_code', 'status', 'created_at',
            'receiver_name', 'receiver_phone', 'address_text',
            'subtotal', 'shipping_fee', 'discount_amount', 'total_amount',
            'note',
            'voucher_code',
            'payment_method',
            'payment_status',
            'transaction_id',
            'items',
        ]
        read_only_fields = [
            'order_code', 'status',
            'subtotal', 'discount_amount', 'total_amount', 'created_at',
            'payment_status', 'transaction_id',
        ]