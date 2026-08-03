from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView
from store.views import register, CustomTokenObtainPairView, FirebaseLoginView
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('store.urls')), 
    path('api/token/', CustomTokenObtainPairView.as_view()),
    path('api/token/refresh/', TokenRefreshView.as_view()),
    path('api/logout/', TokenBlacklistView.as_view(), name='token_blacklist'),
    path('api/register/', register),
    path('api/auth/firebase/', FirebaseLoginView.as_view(), name='firebase_login'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += staticfiles_urlpatterns()