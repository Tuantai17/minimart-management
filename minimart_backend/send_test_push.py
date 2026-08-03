import os
import django
from firebase_admin import messaging

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'minimart_backend.settings')
django.setup()

from core.firebase import is_firebase_ready

def send_test_notification():
    if not is_firebase_ready():
        print("Firebase is not configured properly.")
        return

    print("Sending test push notification to 'promotions' topic...")
    
    message = messaging.Message(
        notification=messaging.Notification(
            title="Khuyến mãi đặc biệt! 🎉",
            body="Giảm giá 50% cho tất cả các mặt hàng sữa trong ngày hôm nay. Bấm vào để xem ngay!",
        ),
        data={
            "type": "promotion",
            "promotion_id": "PROMO_123"
        },
        topic="promotions",
    )

    try:
        response = messaging.send(message)
        print(f"✅ Successfully sent message: {response}")
    except Exception as e:
        print(f"❌ Error sending message: {e}")

if __name__ == "__main__":
    send_test_notification()
