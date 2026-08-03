import os
import django
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter
from store.middleware import SimpleJWTAuthMiddleware
from store import routing # Chúng ta tạo file này ở bước 4

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": SimpleJWTAuthMiddleware(
        URLRouter(
            routing.websocket_urlpatterns
        )
    ),
})
