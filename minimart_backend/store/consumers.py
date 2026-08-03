import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from store.middleware import get_user_from_token

logger = logging.getLogger(__name__)


class SupportConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        # [FIX Critical #2] Không xác thực qua URL nữa.
        # Chấp nhận kết nối trước, chờ message auth đầu tiên từ FE.
        self.user = None
        self.room_name = None

        # [FIX Stability #6] Guard channel_layer None trước khi dùng
        if self.channel_layer is None:
            logger.error("CHANNEL_LAYERS chưa được cấu hình trong settings.py")
            await self.close()
            return

        await self.accept()  # Mở kết nối, chờ FE gửi auth message

    async def disconnect(self, close_code):
        # Chỉ rời phòng nếu đã vào phòng thành công
        if self.room_name:
            await self.channel_layer.group_discard(self.room_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            logger.warning("WS nhận được dữ liệu không phải JSON hợp lệ.")
            return

        msg_type = data.get('type')

        # ── Xử lý AUTH message đầu tiên ──────────────────────────────────────
        if msg_type == 'auth':
            # [FIX Critical #2] Token gửi qua message thay vì URL — an toàn hơn nhiều
            token = data.get('token')
            if not token:
                await self.close()
                return

            user = await get_user_from_token(token)
            if not user or user.is_anonymous:
                logger.warning("WS auth thất bại — đóng kết nối.")
                await self.close()
                return

            # Xác thực thành công → setup phòng
            self.user = user
            self.room_name = f"support_{self.user.id}"
            await self.channel_layer.group_add(self.room_name, self.channel_name)
            logger.info("WS connected: user_id=%s room=%s", self.user.id, self.room_name)

            # Báo FE xác thực thành công
            await self.send(text_data=json.dumps({"type": "auth_success"}))
            return

        # [FIX Logic #3] Guard: Chặn mọi action nếu chưa xác thực
        if not self.user or self.user.is_anonymous:
            logger.warning("WS nhận message từ user chưa xác thực — bỏ qua.")
            return

        # [FIX Logic #4] Bỏ ping_new_msg — SupportService đã group_send rồi,
        # để client gửi lên nữa sẽ gây double notify.
        # Consumer chỉ còn nhận auth, không xử lý ping từ client.

    # ── Nhận tín hiệu từ Redis, đẩy xuống FE ─────────────────────────────────
    async def notify_new_msg(self, event):
        # [FIX Minor #8] Dùng "reload" thay cho câu văn dài — FE chỉ cần check type
        await self.send(text_data=json.dumps({
            "type": "new_message",
            "message": "reload"
        }))
