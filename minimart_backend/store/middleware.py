import logging
from django.contrib.auth.models import AnonymousUser, User
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError
from django.db import DatabaseError

logger = logging.getLogger(__name__)


@database_sync_to_async
def get_user_from_token(token):
    # [FIX Critical #1] Dùng AccessToken của simplejwt thay vì jwt.decode(SECRET_KEY)
    # simplejwt dùng SIGNING_KEY riêng, không phải SECRET_KEY của Django

    try:
        token_obj = AccessToken(token)           # Validate + decode + kiểm tra expired
        return User.objects.get(id=token_obj['user_id'])

    # [FIX Stability #5] Phân loại exception rõ ràng thay vì nuốt hết
    except TokenError as e:
        # Token hết hạn hoặc không hợp lệ — log cảnh báo nhẹ, không phải lỗi hệ thống
        logger.warning("WS token không hợp lệ hoặc đã hết hạn: %s", str(e))
        return AnonymousUser()
    except User.DoesNotExist:
        logger.warning("WS token hợp lệ nhưng user_id không tồn tại trong DB.")
        return AnonymousUser()
    except DatabaseError:
        # Lỗi không lường trước (VD: DB chết) — log đầy đủ stack trace
        logger.exception("Lỗi không xác định khi xác thực WS token.")
        return AnonymousUser()


class SimpleJWTAuthMiddleware(BaseMiddleware):
    """
    [FIX Critical #2] Token KHÔNG còn truyền qua URL (?token=...) nữa.
    Middleware này chỉ khởi tạo scope['user'] = AnonymousUser.
    Việc xác thực thật sự sẽ diễn ra trong Consumer.receive() qua auth message đầu tiên.
    Điều này tránh token lộ trong server logs, browser history, proxy logs.
    """
    async def __call__(self, scope, receive, send):
        scope["user"] = AnonymousUser()   # Tạm thời Anonymous, sẽ được xác thực trong Consumer
        return await super().__call__(scope, receive, send)
