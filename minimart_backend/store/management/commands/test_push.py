from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User
from store.services.notification_service import send_push_to_user

class Command(BaseCommand):
    help = 'Test gửi Push Notification đến điện thoại của một User cụ thể'

    def add_arguments(self, parser):
        parser.add_argument('username_or_id', type=str, help='Username hoặc ID của user nhận thông báo')
        parser.add_argument('title', type=str, help='Tiêu đề thông báo')
        parser.add_argument('body', type=str, help='Nội dung thông báo')

    def handle(self, *args, **options):
        identifier = options['username_or_id']
        title = options['title']
        body = options['body']

        # Tìm user theo ID (nếu là số) hoặc theo Username
        if identifier.isdigit():
            user = User.objects.filter(id=int(identifier)).first()
        else:
            user = User.objects.filter(username=identifier).first()

        if not user:
            raise CommandError(f"Không tìm thấy User nào có ID/Username là '{identifier}'")

        # In danh sách thiết bị đang có
        devices = user.fcmdevice_set.filter(is_active=True)
        if not devices.exists():
            raise CommandError(f"User '{user.username}' (ID: {user.id}) chưa có thiết bị (FCM Token) nào được đăng ký.")

        self.stdout.write(f"Đang gửi push đến {devices.count()} thiết bị của user '{user.username}'...")

        # Gửi push
        sent_count = send_push_to_user(
            user=user,
            title=title,
            body=body,
            data={"test_push": "true"}
        )

        if sent_count > 0:
            self.stdout.write(self.style.SUCCESS(f"✅ Đã gửi thành công {sent_count} thông báo!"))
        else:
            self.stdout.write(self.style.ERROR("❌ Gửi thất bại. Token có thể đã hết hạn hoặc thiết bị đã gỡ app."))
