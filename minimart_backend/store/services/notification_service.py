import logging
from core.firebase import is_firebase_ready
from firebase_admin import messaging, exceptions as firebase_exceptions
from store.models import FCMDevice

logger = logging.getLogger(__name__)


def send_push_to_user(user, title: str, body: str, data: dict = None) -> int:
    """
    Gửi push notification đến tất cả thiết bị active của một user.

    Returns:
        Số lượng thiết bị gửi thành công.
    """
    if not is_firebase_ready():
        logger.debug("Firebase chưa sẵn sàng — bỏ qua push notification.")
        return 0

    devices = list(FCMDevice.objects.filter(user=user, is_active=True))
    if not devices:
        logger.debug("User %s không có thiết bị FCM active.", user.id)
        return 0

    # [AUDIT FIX HIGH-02] Dùng send_each() batch thay vì loop send() riêng lẻ
    str_data = {k: str(v) for k, v in (data or {}).items()}
    messages = [
        messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=str_data,
            token=device.token,
            android=messaging.AndroidConfig(priority='high'),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound='default')
                )
            ),
        )
        for device in devices
    ]

    tokens_to_deactivate = []
    sent_count = 0

    try:
        response = messaging.send_each(messages)

        for i, send_response in enumerate(response.responses):
            if send_response.success:
                sent_count += 1
            elif send_response.exception and isinstance(
                send_response.exception, messaging.UnregisteredError
            ):
                logger.info("FCM token hết hạn, deactivate: user_id=%s", user.id)
                tokens_to_deactivate.append(devices[i].token)
            elif send_response.exception:
                logger.warning(
                    "Lỗi gửi push đến user_id=%s device_type=%s: %s",
                    user.id, devices[i].device_type, send_response.exception,
                )
    except firebase_exceptions.FirebaseError:
        logger.exception("Lỗi batch push đến user_id=%s", user.id)

    if tokens_to_deactivate:
        FCMDevice.objects.filter(token__in=tokens_to_deactivate).update(is_active=False)

    logger.info(
        "Push gửi xong: user_id=%s title='%s' sent=%d/%d",
        user.id, title, sent_count, len(devices),
    )
    return sent_count


def send_push_to_topic(topic: str, title: str, body: str, data: dict = None) -> bool:
    """
    Gửi push notification broadcast đến một topic (ví dụ: 'promotions').
    FE cần subscribe topic trước: FirebaseMessaging.instance.subscribeToTopic('promotions')
    """
    if not is_firebase_ready():
        return False

    try:
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            topic=topic,
        )
        messaging.send(message)
        logger.info("Push topic '%s' gửi thành công: '%s'", topic, title)
        return True
    except firebase_exceptions.FirebaseError:
        logger.exception("Lỗi gửi push topic '%s'", topic)
        return False
