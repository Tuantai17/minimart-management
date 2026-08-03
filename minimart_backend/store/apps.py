from django.apps import AppConfig
import os
import logging


class StoreConfig(AppConfig):
    name = 'store'
    verbose_name = 'Quản lý cửa hàng'

    def ready(self):
        logger = logging.getLogger(__name__)

        run_main = os.environ.get('RUN_MAIN')
        # runserver tạo 2 process:
        #   - Process cha (RUN_MAIN không tồn tại): chỉ giám sát file, KHÔNG phục vụ request
        #   - Process con (RUN_MAIN='true'): process thật sự chạy Django
        # Daphne/Gunicorn: RUN_MAIN không tồn tại (None), chỉ có 1 process → cần chạy
        if run_main == 'true' or run_main is None:
            from . import scheduler
            from django.db.utils import OperationalError, ProgrammingError
            try:
                scheduler.start()
                logger.info("Scheduler started successfully.")
            except (OperationalError, ProgrammingError):
                logger.debug("Scheduler initialization skipped (expected during migrations)")

            # Khởi tạo Firebase Admin SDK (chỉ 1 lần, graceful nếu thiếu credentials)
            try:
                from core.firebase import initialize_firebase
                initialize_firebase()
            except ValueError:
                logger.debug("Firebase initialization skipped.")

        # --- Dịch tên các model và app của thư viện bên thứ 3 sang tiếng Việt ---
        from django.apps import apps
        try:
            aps_app = apps.get_app_config('django_apscheduler')
            aps_app.verbose_name = 'Lịch Trình Ngầm (APScheduler)'

            from django_apscheduler.models import DjangoJob, DjangoJobExecution
            DjangoJob._meta.verbose_name = 'Tác vụ ngầm'
            DjangoJob._meta.verbose_name_plural = 'Tác vụ ngầm'
            DjangoJobExecution._meta.verbose_name = 'Lịch sử chạy tác vụ'
            DjangoJobExecution._meta.verbose_name_plural = 'Lịch sử chạy tác vụ'
        except (LookupError, ImportError):
            pass

        try:
            token_app = apps.get_app_config('token_blacklist')
            token_app.verbose_name = 'Quản Lý Token (Blacklist)'

            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
            OutstandingToken._meta.verbose_name = 'Token đang hoạt động'
            OutstandingToken._meta.verbose_name_plural = 'Token đang hoạt động'
            BlacklistedToken._meta.verbose_name = 'Token bị vô hiệu hóa'
            BlacklistedToken._meta.verbose_name_plural = 'Token bị vô hiệu hóa'
        except (LookupError, ImportError):
            pass
