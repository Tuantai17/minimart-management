# 🛒 MiniMart Management System

Hệ thống quản lý và mua sắm siêu thị mini đa nền tảng, gồm ứng dụng khách hàng/nhân viên bằng **React Native + Expo** và REST API bằng **Django REST Framework**. Dự án bao phủ quy trình khám phá sản phẩm, giỏ hàng, voucher, đặt hàng, thanh toán, quản lý kho, doanh thu, hỗ trợ realtime và thông báo đẩy.

## Mục lục

- [Tính năng](#tính-năng)
- [Kiến trúc](#kiến-trúc)
- [Công nghệ](#công-nghệ)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Khởi động nhanh](#khởi-động-nhanh)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Kiểm thử](#kiểm-thử)
- [Bảo mật](#bảo-mật)
- [Lỗi thường gặp](#lỗi-thường-gặp)

## Tính năng

### Khách hàng

- Đăng ký, đăng nhập JWT/Firebase/Google và khôi phục mật khẩu bằng OTP.
- Duyệt danh mục, tìm kiếm, lọc và xem chi tiết sản phẩm.
- Quản lý giỏ hàng, số lượng, tồn kho và voucher.
- Quản lý nhiều địa chỉ; định vị và tính phí giao hàng qua Goong Maps.
- Đặt hàng, theo dõi trạng thái và thanh toán VNPAY.
- Đánh giá sản phẩm kèm hình ảnh/video.
- Nhận thông báo Firebase Cloud Messaging.
- Chat hỗ trợ realtime và quản lý phiếu hỗ trợ.

### Nhân viên và quản trị viên

- Dashboard và Django Admin.
- Quản lý sản phẩm, danh mục, banner, kho và cảnh báo tồn kho.
- Quản lý đơn hàng và cập nhật vòng đời đơn.
- Báo cáo doanh thu và sản phẩm bán chạy.
- Quản lý voucher, đánh giá, người dùng và địa chỉ.
- Tiếp nhận ticket/chat hỗ trợ realtime.
- Import/crawler dữ liệu sản phẩm.

## Kiến trúc

```text
┌──────────────────────────────────────────────┐
│ Expo / React Native (Android, iOS, Web)      │
│ Expo Router · Zustand · Axios · Firebase     │
└───────────────────┬──────────────────────────┘
                    │ REST / JWT / WebSocket
┌───────────────────▼──────────────────────────┐
│ Django 6 · DRF · Channels · Daphne           │
│ Auth · Catalog · Orders · Voucher · Reports  │
└──────────────┬─────────────────┬─────────────┘
               │                 │
      ┌────────▼────────┐  ┌─────▼────────────┐
      │ PostgreSQL      │  │ Redis            │
      │ Persistent data│  │ Cache / Channels │
      └─────────────────┘  └──────────────────┘

External: Firebase/FCM · Goong Maps · Gmail SMTP · VNPAY Sandbox
```

Frontend gọi API tại `/api`, dùng access/refresh token. Django Channels cung cấp chat tại `/ws/support/`. PostgreSQL lưu nghiệp vụ; Redis phục vụ cache và channel layer.

## Công nghệ

| Lớp | Công nghệ chính |
|---|---|
| Mobile/Web | Expo 54, React Native 0.81, React 19, TypeScript |
| Điều hướng | Expo Router 6, typed routes |
| State/API | Zustand 5, Axios, AsyncStorage |
| Backend | Python, Django 6, Django REST Framework 3.16 |
| Auth | Simple JWT, Firebase Auth, Google/Facebook Login |
| Realtime | Django Channels, Daphne, Redis |
| Database | PostgreSQL, psycopg2 |
| Tích hợp | Firebase FCM, Goong Maps, VNPAY, Gmail SMTP |
| DevOps/Test | Docker Compose, pytest, Locust |

## Cấu trúc thư mục

```text
MINIMART/
├── README.md
├── minimart_backend/        # Django REST API + WebSocket
│   ├── core/                # Settings, URL, ASGI
│   ├── store/
│   │   ├── models/          # Domain models
│   │   ├── serializers/     # Validate/serialize API
│   │   ├── views/           # REST endpoints
│   │   ├── services/        # Nghiệp vụ
│   │   ├── admin/           # Django Admin
│   │   └── tests/           # Backend tests
│   ├── requirements.txt
│   ├── docker-compose.yml
│   └── README.md
└── supermarket-fe/          # Ứng dụng Expo đa nền tảng
    ├── app/                  # File-based routes
    ├── src/
    │   ├── components/      # UI tái sử dụng
    │   ├── services/        # API/integrations
    │   ├── store/           # Zustand stores
    │   ├── hooks/           # Custom hooks
    │   ├── types/           # TypeScript types
    │   └── utils/           # Helpers
    ├── package.json
    └── README.md
```

## Yêu cầu hệ thống

- Python 3.12+ (Django 6 yêu cầu Python hiện đại).
- Node.js 20+ và npm 10+.
- PostgreSQL 15+ và Redis 7+.
- Docker Desktop (tùy chọn).
- Android Studio/thiết bị Android, Xcode trên macOS hoặc trình duyệt.

## Khởi động nhanh

### 1. Backend

```powershell
git clone https://github.com/Tuantai17/minimart-management.git
cd minimart-management\minimart_backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Điền `.env`, sau đó:

```powershell
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

- API: `http://127.0.0.1:8000/api/`
- Admin: `http://127.0.0.1:8000/admin/`

Để dùng WebSocket, chạy ASGI bằng Daphne:

```powershell
daphne -b 0.0.0.0 -p 8000 core.asgi:application
```

### 2. Frontend

```powershell
cd supermarket-fe
npm install
Copy-Item .env.example .env
npm start
```

Hoặc `npm run web`, `npm run android`, `npm run ios`. iOS native chỉ chạy trên macOS. Firebase native có thể cần development build thay vì Expo Go.

### 3. Chọn API URL

| Môi trường | `EXPO_PUBLIC_API_URL` |
|---|---|
| Web cùng máy | `http://127.0.0.1:8000/api` |
| Android Emulator | `http://10.0.2.2:8000/api` |
| Điện thoại thật | `http://<IP-LAN-MAY-TINH>:8000/api` |

Với điện thoại thật: chạy backend trên `0.0.0.0`, thêm IP vào `ALLOWED_HOSTS`, mở cổng 8000 và dùng cùng mạng LAN.

## Docker backend

```powershell
cd minimart_backend
Copy-Item .env.example .env
docker compose up --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
```

Kiểm tra `DB_HOST`, PostgreSQL/Redis port trong `.env` và Compose vì dự án có cấu hình cho cả service Windows lẫn container.

## Cấu hình môi trường

| Thành phần | Biến tiêu biểu |
|---|---|
| Django | `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` |
| PostgreSQL | `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` |
| Redis | `REDIS_URL` |
| Email OTP | `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` |
| Maps/Shipping | `GOONG_API_KEY`, tọa độ kho, phí giao hàng |
| Payment | `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, các URL VNPAY |
| Firebase backend | `FIREBASE_CREDENTIALS_PATH`, `FIREBASE_STORAGE_BUCKET` |
| Frontend | `EXPO_PUBLIC_API_URL`, Goong key, Google web client ID |

Xem [backend](minimart_backend/README.md) và [frontend](supermarket-fe/README.md) để biết chi tiết.

## API tiêu biểu

```text
POST /api/token/                 Đăng nhập JWT
POST /api/token/refresh/         Làm mới access token
GET  /api/products/              Sản phẩm
/api/carts/, /api/cart-items/    Giỏ hàng
/api/orders/, /api/my-orders/    Đơn hàng
POST /api/vouchers/apply/        Áp voucher
/api/reports/revenue/*           Báo cáo
/api/webhooks/vnpay-ipn/         VNPAY IPN
ws://<host>/ws/support/          Chat realtime
```

## Kiểm thử

```powershell
cd minimart_backend
python manage.py check
python manage.py test store.tests
pytest
locust -f locustfile.py --host http://127.0.0.1:8000
```

Frontend chưa có script test/lint; kiểm tra TypeScript bằng:

```powershell
cd supermarket-fe
npx tsc --noEmit
```

## Bảo mật

- Không commit `.env`, database dump, private key hoặc Firebase Admin credential.
- `.env.example` chỉ chứa placeholder.
- Nếu secret từng được push công khai, phải **thu hồi/đổi secret và làm sạch Git history**; xóa ở commit mới là chưa đủ.
- Tắt `DEBUG`, giới hạn hosts/CORS và bật HTTPS trong production.
- Giới hạn API key/package/domain tại Firebase/Google Cloud Console.

## Lỗi thường gặp

### Không gọi được API

Kiểm tra URL theo thiết bị, backend `0.0.0.0:8000`, `ALLOWED_HOSTS`, CORS, firewall và mạng LAN.

### PostgreSQL connection refused

Local thường dùng `127.0.0.1:5432`; container dùng `db:5432`. Phân biệt port host và container.

### Redis/WebSocket lỗi

Khởi động Redis, kiểm tra `REDIS_URL`, dùng Daphne/ASGI và endpoint `/ws/support/`.

### Git báo dubious ownership

```powershell
git config --global --add safe.directory E:/MINIMART
```

Không nên dùng wildcard `*`.

## Đóng góp và giấy phép

Tạo branch từ `main`, không commit secrets, chạy kiểm tra backend/TypeScript và mở Pull Request. Repository hiện chưa có `LICENSE`; mặc định tác giả giữ toàn bộ quyền.

---

**MiniMart Management System © 2026**
