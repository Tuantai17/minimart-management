from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from rest_framework import serializers
from ..models import Review, ReviewMedia, UserProfile, Address, OrderItem



class ReviewMediaSerializer(serializers.ModelSerializer):
    """URL tuyệt đối kèm domain — tránh URL tương đối gây lỗi trên mobile client."""
    file_url = serializers.SerializerMethodField()

    class Meta:
        model  = ReviewMedia
        fields = ['id', 'file_url', 'media_type', 'created_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if request and obj.file:
            return request.build_absolute_uri(obj.file.url)
        return None


# ─── ĐÁNH GIÁ SẢN PHẨM ─────────────────────────────────────────────────────
REVIEW_EDIT_DAYS = 7  # Phải khớp với hằng số trong views.py

class ReviewSerializer(serializers.ModelSerializer):
    reviewer_name   = serializers.SerializerMethodField()
    reviewer_avatar = serializers.SerializerMethodField()

    media = ReviewMediaSerializer(many=True, read_only=True)

    is_editable   = serializers.SerializerMethodField()
    edit_deadline = serializers.SerializerMethodField()

    class Meta:
        model  = Review
        fields = [
            'id', 'product', 'user', 'reviewer_name', 'reviewer_avatar',
            'rating', 'comment', 'created_at',
            'shop_reply', 'shop_replied_at',
            'media',
            'is_editable', 'edit_deadline',
        ]
        read_only_fields = ['user', 'shop_reply', 'shop_replied_at', 'shop_replied_by']

    def get_reviewer_name(self, obj):
        return obj.user.first_name or obj.user.username

    def get_reviewer_avatar(self, obj):
        try:
            avatar = obj.user.profile.avatar_url
            if avatar:
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(avatar.url)
                return avatar.url
        except ObjectDoesNotExist:
            pass
        return None

    def get_is_editable(self, obj):
        deadline = obj.created_at + timezone.timedelta(days=REVIEW_EDIT_DAYS)
        return timezone.now() <= deadline

    def get_edit_deadline(self, obj):
        deadline = obj.created_at + timezone.timedelta(days=REVIEW_EDIT_DAYS)
        return deadline.isoformat()

    def validate(self, data):
        # Skip khi PATCH không gửi field 'product' (performance: tránh query không cần thiết)
        if 'product' not in data:
            return data
            
        user = self.context['request'].user
        product_id = data['product'].id if hasattr(data['product'], 'id') else data['product']
        
        # Chặn review nếu chưa mua hàng thành công (Chống rác Database & Cloud Storage)
        has_purchased = OrderItem.objects.filter(
            order__user=user,
            order__status='COMPLETED',
            product_id=product_id
        ).exists()
        
        if not has_purchased:
            raise serializers.ValidationError("Bạn cần mua sản phẩm này và nhận hàng thành công trước khi đánh giá!")

        qs = Review.objects.filter(
            user=user,
            product=data['product'],
            delete_at__isnull=True,  # user xóa mềm rồi vẫn được review lại
        )
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Bạn đã đánh giá sản phẩm này rồi!")
        return data


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserProfile
        fields = ['phone', 'avatar_url', 'receive_stock_alerts']


# ─── ĐỊA CHỈ GIAO HÀNG ──────────────────────────────────────────────────────
class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Address
        fields = [
            'id', 'full_name', 'phone',
            'province', 'district', 'street',
            'note', 'is_default', 'lat', 'lng', 'created_at',
        ]
        read_only_fields = ['created_at']


# ─── THÔNG TIN CÁ NHÂN GỘP (User + UserProfile) ─────────────────────────────
class MeSerializer(serializers.Serializer):
    id       = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    name     = serializers.CharField(source='first_name')
    email    = serializers.EmailField(read_only=True)

    phone                = serializers.SerializerMethodField()
    avatar_url           = serializers.SerializerMethodField()
    receive_stock_alerts = serializers.SerializerMethodField()

    role          = serializers.SerializerMethodField()
    permissions   = serializers.SerializerMethodField()
    role_features = serializers.SerializerMethodField()

    def get_phone(self, obj):
        try:
            return obj.profile.phone
        except ObjectDoesNotExist:
            return ''

    def get_avatar_url(self, obj):
        # [FIX] Bắt ObjectDoesNotExist thay vì bare Exception
        try:
            avatar = obj.profile.avatar_url
            if avatar:
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(avatar.url)
                return avatar.url
            return None
        except ObjectDoesNotExist:
            return None

    def get_receive_stock_alerts(self, obj):
        # [FIX] Bắt ObjectDoesNotExist thay vì bare Exception
        try:
            return obj.profile.receive_stock_alerts
        except ObjectDoesNotExist:
            return False

    def get_role(self, obj):
        if obj.is_superuser:
            return 'admin'
        if obj.is_staff:
            return 'staff'
        return 'customer'

    def get_permissions(self, obj):
        perms = [
            'profile.view',
            'profile.edit',
            'address.manage',
            'order.history.view',
        ]
        if obj.is_staff or obj.is_superuser:
            perms += [
                'staff.order.queue.view',
                'staff.delivery_status.update',
            ]
        return perms

    def get_role_features(self, obj):
        return {
            'show_customer_features': True,
            'show_staff_features': obj.is_staff or obj.is_superuser,
            'show_admin_features': obj.is_superuser,
        }