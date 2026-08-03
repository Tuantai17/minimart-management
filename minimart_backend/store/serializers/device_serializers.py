from rest_framework import serializers
from store.models import FCMDevice


class FCMDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FCMDevice
        fields = ['token', 'device_type']


class FCMDeviceRegisterSerializer(serializers.Serializer):
    token       = serializers.CharField(max_length=255)
    device_type = serializers.ChoiceField(choices=['android', 'ios', 'web'], default='android')
