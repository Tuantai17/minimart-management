from django.utils import timezone
from rest_framework import serializers
from store.models import Voucher, UserVoucherUsage, UserVoucher


class VoucherApplySerializer(serializers.Serializer):
    """
    Input serializer cho POST /api/vouchers/apply/.
    Chỉ nhận code — subtotal được BE tự tính từ Cart.
    """
    code = serializers.CharField(max_length=50)

    def validate_code(self, value):
        return value.strip().upper()


class VoucherListSerializer(serializers.ModelSerializer):
    """
    Output serializer cho GET /api/vouchers/ — danh sách voucher công khai.
    Map các field model hiện có → FE_CONTRACT §5.1.
    """
    min_order_value = serializers.DecimalField(source='min_order_amount', max_digits=12, decimal_places=2)
    start_at = serializers.DateTimeField(source='start_date')
    end_at = serializers.DateTimeField(source='end_date')
    user_claim_limit = serializers.IntegerField(source='max_usage_per_user')

    title = serializers.SerializerMethodField()
    apply_requirement_text = serializers.SerializerMethodField()
    remaining_quantity = serializers.SerializerMethodField()
    claim_status = serializers.SerializerMethodField()
    is_claimed = serializers.SerializerMethodField()
    is_claimable = serializers.SerializerMethodField()
    claim_conditions = serializers.SerializerMethodField()
    display = serializers.SerializerMethodField()

    # Các field chưa có trong model — trả null (sẽ thêm khi có migration)
    claim_start_at = serializers.SerializerMethodField()
    claim_end_at = serializers.SerializerMethodField()
    claim_requirement_text = serializers.SerializerMethodField()

    class Meta:
        model = Voucher
        fields = [
            'id', 'code', 'title',
            'discount_type', 'discount_value',
            'min_order_value', 'max_discount_amount',
            'start_at', 'end_at',
            'claim_start_at', 'claim_end_at',
            'user_claim_limit', 'remaining_quantity',
            'claim_status', 'is_claimed', 'is_claimable',
            'claim_conditions', 'claim_requirement_text',
            'apply_requirement_text', 'display',
        ]

    def get_title(self, obj):
        if obj.discount_type == 'PERCENT':
            return f"Giảm {obj.discount_value:.0f}%"
        return f"Giảm {obj.discount_value:,.0f}đ"

    def get_apply_requirement_text(self, obj):
        if obj.min_order_amount and obj.min_order_amount > 0:
            return f"Áp dụng cho đơn từ {obj.min_order_amount:,.0f}đ"
        return "Áp dụng cho mọi đơn hàng"

    def get_remaining_quantity(self, obj):
        if obj.max_usage is None:
            return None  # Không giới hạn lượt
        return max(0, obj.max_usage - obj.usage_count)

    def get_claim_status(self, obj):
        now = timezone.now()
        if not obj.is_active or obj.end_date < now:
            return "expired"
        if obj.max_usage is not None and obj.usage_count >= obj.max_usage:
            return "out_of_stock"
        user = self.context.get('request').user
        if user and user.is_authenticated:
            already_claimed = UserVoucher.objects.filter(user=user, voucher=obj).exists()
            if already_claimed:
                return "claimed"
        return "claimable"

    def get_is_claimed(self, obj):
        user = self.context.get('request').user
        if not user or not user.is_authenticated:
            return False
        return UserVoucher.objects.filter(user=user, voucher=obj).exists()

    def get_is_claimable(self, obj):
        return self.get_claim_status(obj) == "claimable"

    def get_claim_conditions(self, obj):
        return {
            "requires_login": True,
            "required_membership_tier": None,
            "min_completed_orders": 0,
            "min_lifetime_spend": "0.00",
            "requires_phone_verified": False,
        }

    def get_display(self, obj):
        return {
            "badge": "Mã của Shop",
            "highlight": None,
            "accent_color": "#EE4D2D",
        }

    def get_claim_start_at(self, obj):
        return None

    def get_claim_end_at(self, obj):
        return None

    def get_claim_requirement_text(self, obj):
        return "Đăng nhập để nhận voucher"


class MyVoucherSerializer(serializers.ModelSerializer):
    """
    Output serializer cho GET /api/my-vouchers/ — FE_CONTRACT §5.3.
    Serialize từ UserVoucher và làm phẳng thông tin voucher.
    """
    voucher_id = serializers.IntegerField(source='voucher.id')
    code = serializers.CharField(source='voucher.code')
    title = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    discount_type = serializers.CharField(source='voucher.discount_type')
    discount_value = serializers.DecimalField(source='voucher.discount_value', max_digits=12, decimal_places=2)
    min_order_value = serializers.DecimalField(source='voucher.min_order_amount', max_digits=12, decimal_places=2)
    expires_at = serializers.DateTimeField(source='voucher.end_date')
    apply_requirement_text = serializers.SerializerMethodField()
    display = serializers.SerializerMethodField()

    class Meta:
        model = UserVoucher
        fields = [
            'id', 'voucher_id', 'code', 'title', 'description',
            'status', 'claimed_at', 'expires_at',
            'discount_type', 'discount_value', 'min_order_value',
            'apply_requirement_text', 'display',
        ]

    def get_title(self, obj):
        v = obj.voucher
        if v.discount_type == 'PERCENT':
            return f"Giảm {v.discount_value:.0f}%"
        return f"Giảm {v.discount_value:,.0f}đ"

    def get_description(self, obj):
        v = obj.voucher
        if v.min_order_amount and v.min_order_amount > 0:
            return f"Áp dụng cho đơn từ {v.min_order_amount:,.0f}đ"
        return "Áp dụng cho mọi đơn hàng"

    def get_apply_requirement_text(self, obj):
        return self.get_description(obj)

    def get_status(self, obj):
        return obj.status

    def get_display(self, obj):
        if obj.status == 'used':
            return {
                "badge": "Đã dùng",
                "highlight": None,
                "accent_color": "#AAAAAA",
            }
        elif obj.status == 'active':
            return {
                "badge": "Chưa dùng",
                "highlight": f"HSD: {obj.voucher.end_date.strftime('%d/%m/%Y')}",
                "accent_color": "#EE4D2D",
            }
        return {
            "badge": "Hết hạn",
            "highlight": None,
            "accent_color": "#AAAAAA",
        }
