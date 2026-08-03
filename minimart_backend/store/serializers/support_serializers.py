from rest_framework import serializers
from store.models import SupportMessage


class SupportMessageSerializer(serializers.ModelSerializer):
    # Dùng SerializerMethodField để xử lý trường hợp sender_user là null
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = SupportMessage
        fields = ['id', 'ticket', 'sender_name', 'is_admin_reply', 'message', 'is_read', 'created_at']

    def get_sender_name(self, obj):
        if obj.sender_user:
            return obj.sender_user.first_name or obj.sender_user.username
        return "Ẩn danh"
