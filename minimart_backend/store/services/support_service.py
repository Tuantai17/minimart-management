import logging
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from store.models import SupportMessage

logger = logging.getLogger(__name__)


class SupportService:
    @staticmethod
    def send_message(ticket, sender_user, is_admin_reply, message_text):
        msg = SupportMessage.objects.create(
            ticket=ticket,
            sender_user=sender_user,
            is_admin_reply=is_admin_reply,
            message=message_text
        )

        # Cập nhật updated_at để /admin-support/ sort đúng và lấy last_message_time chuẩn xác
        ticket.save(update_fields=['updated_at'])

        # is_resolved KHÔNG tự đổi ở đây nữa — chỉ thay đổi qua /resolve/ và /reopen/

        try:
            channel_layer = get_channel_layer()
            room_name = f"support_{ticket.user.id}"
            async_to_sync(channel_layer.group_send)(
                room_name, {"type": "notify_new_msg"}
            )
        except (RuntimeError, ConnectionError):
            # Ghi log lỗi thay vì nuốt lỗi im lặng
            logger.exception(
                "WebSocket group_send thất bại cho room=%s (ticket_id=%s)",
                f"support_{ticket.user.id}", ticket.id
            )

        return msg
