"""
Firebase Admin SDK initialization.
Gọi initialize_firebase() 1 lần khi server khởi động (qua AppConfig.ready()).
Mọi module khác import hàm/object cần thiết từ firebase_admin trực tiếp.
"""
import logging
import os

import firebase_admin
from firebase_admin import credentials
from django.conf import settings

logger = logging.getLogger(__name__)


def initialize_firebase():
    """
    Khởi tạo Firebase Admin App từ service account key.
    Idempotent — gọi nhiều lần chỉ init 1 lần.
    """
    if firebase_admin._apps:
        return

    cred_path = getattr(settings, 'FIREBASE_CREDENTIALS_PATH', None)
    if not cred_path:
        logger.warning(
            "FIREBASE_CREDENTIALS_PATH chưa được cấu hình — Firebase bị tắt."
        )
        return

    if not os.path.isabs(cred_path):
        cred_path = os.path.join(settings.BASE_DIR, cred_path)

    if not os.path.exists(cred_path):
        logger.warning(
            "Firebase credentials không tìm thấy tại %s — Firebase bị tắt.", cred_path
        )
        return

    try:
        cred = credentials.Certificate(cred_path)
        options = {}
        storage_bucket = getattr(settings, 'FIREBASE_STORAGE_BUCKET', None)
        if storage_bucket:
            options['storageBucket'] = storage_bucket

        firebase_admin.initialize_app(cred, options)
        logger.info("Firebase Admin SDK khởi tạo thành công.")
    except ValueError:
        logger.exception("Lỗi khởi tạo Firebase Admin SDK.")


def is_firebase_ready() -> bool:
    """Kiểm tra Firebase đã được khởi tạo chưa."""
    return bool(firebase_admin._apps)
