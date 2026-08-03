"""
Django settings for core project.
"""

from pathlib import Path
from datetime import timedelta
import os
from urllib.parse import urlparse
from corsheaders.defaults import default_headers


# ─── BASE ────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent

# Tự động nạp file .env khi chạy trực tiếp trên máy local
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, '.env'))
except ImportError:
    pass

# Đọc từ environment variable — KHÔNG hardcode key thật vào đây
# Đọc từ environment variable — Bắt buộc phải có để chạy (Security)
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    raise ValueError("CRITICAL: SECRET_KEY environment variable is not set!")

# Bật tính năng phục vụ file tĩnh/media trong môi trường Dev (Hỗ trợ True/1/Yes)
DEBUG = os.environ.get('DEBUG', 'False').lower() in ('true', '1', 'yes')

# [SEC] ALLOWED_HOSTS: Lấy từ environment variable, default chỉ cho localhost
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '127.0.0.1,localhost').split(',')

# ─── SECURITY ────────────────────────────────────────────────────────────────
# OWASP recommended security headers
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# [SEC-15 FIX] SSL/HSTS settings — chỉ bật khi không phải DEBUG (production)
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')  # Khi đứng sau Nginx/LB
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000          # 1 năm
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True


# ─── APPS ────────────────────────────────────────────────────────────────────

INSTALLED_APPS = [
    'daphne',  # Phải đứng đầu trước django.contrib.staticfiles
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'store',
    'django_apscheduler',
    'import_export',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Dùng ASGI (Daphne) — không cần WSGI nữa
ASGI_APPLICATION = 'core.asgi.application'


# ─── DATABASE ────────────────────────────────────────────────────────────────

_DB_PASSWORD = os.environ.get('DB_PASSWORD')
if not _DB_PASSWORD:
    raise ValueError("CRITICAL: DB_PASSWORD environment variable is not set!")

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'minimart_db'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': _DB_PASSWORD,
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'CONN_MAX_AGE': 60,
        'CONN_HEALTH_CHECKS': True,
    }
}


# ─── AUTH & PASSWORD ─────────────────────────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ─── INTERNATIONALIZATION ────────────────────────────────────────────────────

LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'Asia/Ho_Chi_Minh'
USE_I18N      = True
USE_TZ        = True


# ─── STATIC & MEDIA ──────────────────────────────────────────────────────────

STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL  = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Công tắc chuyển sang Cloud (AWS, Cloudinary...) khi cần
USE_CLOUD_STORAGE = os.environ.get('USE_CLOUD_STORAGE', 'False') == 'True'

if not USE_CLOUD_STORAGE:
    DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'


# ─── CORS ────────────────────────────────────────────────────────────────────

# [FIX] Không để True cho production. Chỉ cho phép domains tin cậy.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS', 
    'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081,http://127.0.0.1:8081,https://minimart.local'
).split(',')

CORS_ALLOW_HEADERS = list(default_headers) + [
    "Authorization",
    "Content-Type",
]


# ─── REST FRAMEWORK ──────────────────────────────────────────────────────────

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
    # Throttling protection for auth endpoints
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'auth_login':     '10/minute',   # [SEC-4 FIX] Chống brute-force login
        'auth_register':  '5/hour',
        'auth_forgot':    '3/minute',
        'auth_verify':    '5/minute',
        'auth_reset':     '5/minute',
        'voucher_claim':  '10/minute',   # [Phase2 FIX] Chống spam nhận mã
        'support_send':   '20/minute',   # [Phase3 FIX] Chống spam tin nhắn hỗ trợ
        'order_create':   '10/minute',   # Chống flood tạo đơn hàng
        'pay_vnpay':      '5/minute',    # Chống spam xin link thanh toán
    },
    'DEFAULT_THROTTLE_CACHE': 'default',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(minutes=60),  # [SEC-5 FIX] Giảm từ 24h xuống 60 phút
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
}


# ─── CACHE & CHANNELS ────────────────────────────────────────────────────────
REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/1')

# [DEBUGGING-FIX] Đảm bảo cấu hình Cache luôn ổn định
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "IGNORE_EXCEPTIONS": True, # Quan trọng để không sập server nếu Redis disconnect
            "CONNECTION_POOL_KWARGS": {"max_connections": 20},
        },
        "TIMEOUT": 60,
    }
} if REDIS_URL else {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "unique-snowflake",
    }
}

# [DEBUGGING-FIX] Sửa lỗi cấu hình WebSocket khiến Jobs bị Error
if REDIS_URL:
    parsed = urlparse(REDIS_URL)
    channel_redis_url = f"{parsed.scheme}://{parsed.netloc}/0"
    
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [channel_redis_url],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }


# ─── EMAIL ───────────────────────────────────────────────────────────────────

EMAIL_BACKEND       = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST          = 'smtp.gmail.com'
EMAIL_PORT          = 587
EMAIL_USE_TLS       = True
EMAIL_HOST_USER     = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')


# ─── GOONG MAPS ──────────────────────────────────────────────────────────────

GOONG_API_KEY        = os.environ.get('GOONG_API_KEY', '')
WAREHOUSE_LAT        = float(os.environ.get('WAREHOUSE_LAT', '10.804561277400547'))
WAREHOUSE_LNG        = float(os.environ.get('WAREHOUSE_LNG', '106.6375986035028'))
SHIPPING_RATE_PER_KM = int(os.environ.get('SHIPPING_RATE_PER_KM', '5000'))
SHIPPING_BASE_FEE    = int(os.environ.get('SHIPPING_BASE_FEE', '15000'))


# ─── VNPAY PAYMENT ────────────────────────────────────────────────────────────

VNPAY_TMN_CODE    = os.environ.get('VNPAY_TMN_CODE', '')
VNPAY_HASH_SECRET = os.environ.get('VNPAY_HASH_SECRET', '')
VNPAY_PAYMENT_URL = os.environ.get('VNPAY_PAYMENT_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html')
VNPAY_RETURN_URL  = os.environ.get('VNPAY_RETURN_URL', 'http://localhost:8081/payment/result')
VNPAY_EXPIRE_MINUTES = int(os.environ.get('VNPAY_EXPIRE_MINUTES', '15'))

# Whitelist origin cho return_url động (chống open-redirect)
VNPAY_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        'VNPAY_ALLOWED_ORIGINS',
        'http://localhost:8081,http://localhost:3000'
    ).split(',')
    if origin.strip()
]
VNPAY_ALLOWED_CALLBACK_PATH = '/payment/result'


# ─── FIREBASE ─────────────────────────────────────────────────────

# Path tới service account key (tương đối từ BASE_DIR hoặc tuyệt đối)
FIREBASE_CREDENTIALS_PATH = os.environ.get('FIREBASE_CREDENTIALS_PATH', 'credentials/firebase-key.json')
# Bucket name: <project-id>.firebasestorage.app
FIREBASE_STORAGE_BUCKET = os.environ.get('FIREBASE_STORAGE_BUCKET', '')
# ─── APSCHEDULER ─────────────────────────────────────────────────────────────

APSCHEDULER_DATETIME_FORMAT = "N j, Y, f:s a"


# ─── MISC ────────────────────────────────────────────────────────────────────

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Crawler Security
CRAWLER_SECRET = os.environ.get('CRAWLER_SECRET')
if not CRAWLER_SECRET:
    raise ValueError("CRITICAL: CRAWLER_SECRET environment variable is not set!")
CRAWLER_ALLOWED_DOMAINS = ['www.bachhoaxanh.com', 'bachhoaxanh.com']

# Cấu hình log để biết khi Redis chết nhưng server không bị sập
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'level': 'WARNING',
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'django_redis': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}
