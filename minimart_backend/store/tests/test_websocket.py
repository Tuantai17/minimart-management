import pytest
import json
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import AccessToken
from core.asgi import application
from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer

@pytest.mark.asyncio
@pytest.mark.django_db
class TestSupportConsumer:
    async def test_websocket_connect_and_auth_success(self):
        """Kiểm tra kết nối và xác thực thành công với Token hợp lệ"""
        # 1. Arrange: Tạo user và token
        user = await sync_to_async(User.objects.create_user)(username="test_ws_user", password="password")
        token = str(AccessToken.for_user(user))

        # 2. Act: Kết nối vào WebSocket
        communicator = WebsocketCommunicator(application, "/ws/support/")
        connected, _ = await communicator.connect()
        assert connected

        # 3. Gửi tin nhắn auth
        await communicator.send_json_to({
            "type": "auth",
            "token": token
        })

        # 4. Assert: Nhận phản hồi auth_success
        response = await communicator.receive_json_from()
        assert response["type"] == "auth_success"

        await communicator.disconnect()

    async def test_websocket_auth_failure_invalid_token(self):
        """Kiểm tra việc đóng kết nối khi Token không hợp lệ"""
        communicator = WebsocketCommunicator(application, "/ws/support/")
        connected, _ = await communicator.connect()
        assert connected

        # Gửi token linh tinh
        await communicator.send_json_to({
            "type": "auth",
            "token": "invalid_junk_token"
        })

        # Consumer nên đóng kết nối ngay lập tức
        # Với communicator, việc nhận response sẽ raise Error hoặc kết nối bị đóng
        with pytest.raises(Exception): # Hoặc kiểm tra trạng thái đóng
             await communicator.receive_json_from()
        
        await communicator.disconnect()

    async def test_websocket_group_notification(self):
        """Kiểm tra tính năng nhận thông báo từ Channel Layer (Redis)"""
        user = await sync_to_async(User.objects.create_user)(username="notif_user", password="password")
        token = str(AccessToken.for_user(user))
        
        communicator = WebsocketCommunicator(application, "/ws/support/")
        await communicator.connect()
        await communicator.send_json_to({"type": "auth", "token": token})
        await communicator.receive_json_from() # Nhận auth_success

        # Giả lập một tiến trình khác gửi tin nhắn vào group qua channel_layer
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"support_{user.id}",
            {
                "type": "notify_new_msg",
                "message": "reload"
            }
        )

        # Assert: Client WebSocket phải nhận được thông báo reload
        response = await communicator.receive_json_from()
        assert response["type"] == "new_message"
        assert response["message"] == "reload"

        await communicator.disconnect()
