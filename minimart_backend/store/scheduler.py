from apscheduler.schedulers.background import BackgroundScheduler
from django_apscheduler.jobstores import DjangoJobStore, register_events
from django.conf import settings
import logging

from .tasks import check_low_stock_and_notify_admin, auto_cancel_expired_vnpay_orders

logger = logging.getLogger(__name__)

def start():
    scheduler = BackgroundScheduler(timezone=settings.TIME_ZONE)
    scheduler.add_jobstore(DjangoJobStore(), "default")

    # Xóa job cũ trước khi thêm mới để tránh bị trùng lặp khi restart server
    scheduler.remove_all_jobs()

    scheduler.add_job(
        check_low_stock_and_notify_admin,
        trigger="cron",
        hour=9,
        minute=30,
        id="check_low_stock_job",
        max_instances=1,
        replace_existing=True,
        misfire_grace_time=3600,  # Cho phép chạy muộn tối đa 1 tiếng nếu server restart đúng 9h30
    )
    logger.info("Đã thêm job check_low_stock_job chạy vào 9h30.")

    # Job mới: Tự động hủy đơn VNPAY PENDING quá 15 phút (chạy mỗi 5 phút)
    scheduler.add_job(
        auto_cancel_expired_vnpay_orders,
        trigger="interval",
        minutes=5,
        id="auto_cancel_expired_vnpay_job",
        max_instances=1,
        replace_existing=True,
    )
    logger.info("Đã thêm job auto_cancel_expired_vnpay_job chạy mỗi 5 phút.")

    register_events(scheduler)
    scheduler.start()
    logger.info("APScheduler đã được khởi động thành công.")
