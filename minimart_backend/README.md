# ⚙️ MiniMart Backend

REST API và WebSocket server cho MiniMart, xây dựng bằng **Django 6**, **Django REST Framework**, **Channels/Daphne**, PostgreSQL và Redis.

> Xem [README toàn hệ thống](../README.md) và [README frontend](../supermarket-fe/README.md).

## Chức năng

- JWT access/refresh/blacklist, đăng ký, Firebase Login, OTP quên mật khẩu.
- Danh mục, sản phẩm, banner, tồn kho và crawler/import.
- Giỏ hàng, đơn hàng, trạng thái giao hàng và đánh giá media.
- Voucher: danh sách, nhận, áp dụng và kiểm soát lượt dùng.
- VNPAY sandbox, IPN và kết quả thanh toán.
- Hồ sơ, nhiều địa chỉ, reverse geocoding và phí vận chuyển.
- Ticket/chat hỗ trợ realtime qua WebSocket.
- FCM device registration và push notification.
- Báo cáo doanh thu, sản phẩm bán chạy và Django Admin.

## Kiến trúc thư mục

```text
minimart_backend/
├── core/                  # settings.py, urls.py, asgi.py
├── store/
│   ├── models/            # Entity theo domain
│   ├── serializers/       # Validate và biểu diễn JSON
│   ├── views/             # ViewSets/APIViews
│   ├── services/          # Nghiệp vụ độc lập với HTTP
│   ├── admin/             # Giao diện quản trị
│   ├── migrations/        # Schema migrations
│   ├── tests/             # Unit/integration tests
│   ├── consumers.py       # WebSocket consumer
│   ├── routing.py         # /ws/support/
│   ├── scheduler.py       # Scheduled jobs
│   └── urls.py            # API routes
├── media/                 # Upload local khi development
├── manage.py
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

Luồng xử lý thông thường: **URL → View/ViewSet → Serializer → Service → Model/PostgreSQL**. Redis dùng cho Django cache và Channels; Daphne phục vụ ASGI HTTP/WebSocket.

## Mô hình dữ liệu

| Nhóm | Models | Vai trò |
|---|---|---|
| Catalog | `Category`, `Product`, `Banner`, `StoreLocation`, `CrawlerProduct` | Danh mục và kho sản phẩm |
| Commerce | `Cart`, `CartItem`, `Order`, `OrderItem` | Giỏ và vòng đời đơn hàng |
| Review | `Review`, `ReviewMedia` | Đánh giá và media |
| Customer | `UserProfile`, `Address` | Hồ sơ, phân quyền, giao hàng |
| Promotion | `Voucher`, `UserVoucher`, `UserVoucherUsage` | Phát hành và sử dụng mã |
| Support | `SupportTicket`, `SupportMessage` | Chăm sóc khách hàng realtime |
| Notification | `FCMDevice` | Token thiết bị nhận push |

## Yêu cầu

- Python 3.12+.
- PostgreSQL 15+.
- Redis 7+.
- Visual C++ Build Tools có thể cần thiết nếu cài package native trên Windows; `psycopg2-binary` thường không cần compiler.

## Cài đặt local trên Windows

```powershell
cd minimart_backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

Tạo database PostgreSQL (ví dụ `minimart_db`), cập nhật `.env`, rồi:

```powershell
python manage.py migrate
python manage.py createsuperuser
python manage.py check
python manage.py runserver 0.0.0.0:8000
```

Django Admin: `http://127.0.0.1:8000/admin/`

API root: `http://127.0.0.1:8000/api/`

### Chạy realtime bằng ASGI

```powershell
daphne -b 0.0.0.0 -p 8000 core.asgi:application
```

Để chat hoạt động, Redis phải chạy và `REDIS_URL` phải truy cập được.

## Biến môi trường

Sao chép `.env.example` thành `.env`. Không commit `.env`.

| Biến | Bắt buộc | Mô tả / ví dụ local |
|---|---:|---|
| `SECRET_KEY` | Có | Chuỗi bí mật Django dài, ngẫu nhiên |
| `DEBUG` | Có | `True` chỉ cho development |
| `ALLOWED_HOSTS` | Có | `127.0.0.1,localhost,<IP-LAN>` |
| `DB_NAME` | Có | `minimart_db` |
| `DB_USER` | Có | PostgreSQL user |
| `DB_PASSWORD` | Có | Mật khẩu riêng, không dùng giá trị mẫu |
| `DB_HOST` | Có | Local: `127.0.0.1`; Compose: `db` |
| `DB_PORT` | Có | Thường `5432` |
| `REDIS_URL` | Nên có | Local/Compose Redis URL |
| `CORS_ALLOWED_ORIGINS` | Có | Origins frontend web, phân cách dấu phẩy |
| `EMAIL_HOST_USER` | OTP | Gmail gửi OTP |
| `EMAIL_HOST_PASSWORD` | OTP | Gmail App Password, không phải mật khẩu thường |
| `CRAWLER_SECRET` | Crawler | Secret bảo vệ import endpoint |
| `GOONG_API_KEY` | Maps | API key từ Goong |
| `WAREHOUSE_LAT/LNG` | Shipping | Tọa độ kho |
| `SHIPPING_RATE_PER_KM` | Shipping | Phí mỗi km |
| `SHIPPING_BASE_FEE` | Shipping | Phí cơ bản |
| `VNPAY_TMN_CODE` | Payment | Merchant code sandbox/production |
| `VNPAY_HASH_SECRET` | Payment | Secret ký request |
| `VNPAY_PAYMENT_URL` | Payment | Gateway URL |
| `VNPAY_RETURN_URL` | Payment | Trang frontend nhận kết quả |
| `FIREBASE_CREDENTIALS_PATH` | Push/Auth | Đường dẫn Firebase Admin JSON |
| `FIREBASE_STORAGE_BUCKET` | Media | Bucket Firebase |

Tạo SECRET_KEY local:

```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

## API

Base URL mặc định: `http://127.0.0.1:8000/api`

### Xác thực

| Method | Endpoint | Chức năng |
|---|---|---|
| POST | `/register/` | Đăng ký |
| POST | `/token/` | Nhận access/refresh JWT |
| POST | `/token/refresh/` | Làm mới access token |
| POST | `/logout/` | Blacklist refresh token |
| POST | `/auth/firebase/` | Đăng nhập Firebase |
| GET/PATCH | `/me/` | Tài khoản hiện tại |
| POST | `/change-password/` | Đổi mật khẩu |
| POST | `/forgot-password/` | Gửi OTP |
| POST | `/verify-otp/` | Kiểm tra OTP |
| POST | `/reset-password/` | Đặt mật khẩu mới |

Header endpoint bảo vệ:

```http
Authorization: Bearer <access_token>
```

### Nghiệp vụ

| Nhóm | Endpoint chính |
|---|---|
| Catalog | `/categories/`, `/products/`, `/products/best-selling/`, `/banners/` |
| Cart | `/carts/`, `/cart-items/` |
| Order | `/orders/`, `/my-orders/` |
| Review | `/reviews/` |
| Profile | `/user-profiles/`, `/addresses/`, `/users/profile/stock-alerts/` |
| Voucher | `/vouchers/`, `/vouchers/{id}/claim/`, `/vouchers/apply/`, `/my-vouchers/` |
| Support | `/support/`, `/admin-support/` |
| Reports | `/reports/revenue/summary/`, `/reports/revenue/range/` |
| Payment | `/webhooks/vnpay-ipn/` |
| Device | `/devices/`, `/devices/{token}/` |
| Location | `/location/reverse-geocode/` |
| Data import | `/crawler/import/` |

Các ViewSet còn sinh route detail/action theo Django REST Framework router. Quyền truy cập tùy endpoint và vai trò người dùng.

## WebSocket hỗ trợ

```text
ws://127.0.0.1:8000/ws/support/
wss://your-domain/ws/support/   # production HTTPS
```

Client cần xác thực theo cơ chế consumer hiện tại. Redis Channel Layer truyền sự kiện giữa các worker; không dùng in-memory layer khi chạy nhiều instance production.

## Docker Compose

```powershell
Copy-Item .env.example .env
docker compose up --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
```

Dịch vụ:

- `web`: Daphne tại cổng 8000.
- `db`: PostgreSQL 15; project map host `5433 → 5432`.
- `redis`: Redis 7; map host `63790 → 6379`.

> Cấu hình `web` hiện đặt `DB_HOST=host.docker.internal`, phù hợp khi web container kết nối PostgreSQL trên Windows. Nếu muốn dùng service `db` của Compose, đổi thành `DB_HOST=db` và thêm `db` vào `depends_on`.

Dừng/xóa container:

```powershell
docker compose down
docker compose down -v   # CẢNH BÁO: xóa cả PostgreSQL volume
```

## Dữ liệu và migration

```powershell
python manage.py makemigrations
python manage.py migrate
python manage.py showmigrations
```

Không commit SQL dump hoặc dữ liệu người dùng. `datadump.json` nếu dùng cho demo phải được kiểm tra/xóa dữ liệu cá nhân và password hash trước khi công khai.

Thu thập static production:

```powershell
python manage.py collectstatic --noinput
```

## Kiểm thử

```powershell
python manage.py check
python manage.py test store.tests
pytest
pytest store/tests/test_voucher.py -v
pytest store/tests/test_websocket.py -v
```

Kiểm thử tải:

```powershell
locust -f locustfile.py --host http://127.0.0.1:8000
```

## Triển khai production

- `DEBUG=False`, SECRET_KEY mạnh và secrets đặt qua secret manager.
- Giới hạn `ALLOWED_HOSTS`/CORS theo domain thật.
- Reverse proxy Nginx/Caddy hỗ trợ HTTP và WebSocket upgrade.
- HTTPS bắt buộc; settings đã bật secure cookie/HSTS khi không DEBUG.
- Dùng managed PostgreSQL/Redis, backup định kỳ.
- Không phục vụ media lớn trực tiếp bằng Django; dùng object storage/CDN.
- Chạy migration trước khi chuyển traffic và giám sát VNPAY IPN/FCM failures.

## Lỗi thường gặp

- **`SECRET_KEY`/`DB_PASSWORD` is not set:** tạo `.env` đúng trong `minimart_backend`.
- **PostgreSQL refused:** kiểm tra service, host/port/user/password và database đã tồn tại.
- **Redis refused:** kiểm tra `REDIS_URL`; host port và container port khác nhau.
- **CORS/DisallowedHost:** thêm đúng origin frontend và IP/domain backend.
- **Điện thoại không kết nối:** dùng IP LAN thay `localhost`, mở firewall, cùng Wi-Fi.
- **WebSocket 404:** chạy Daphne/ASGI và dùng đúng `/ws/support/`.
- **OTP không gửi:** dùng Gmail App Password, bật cấu hình SMTP và kiểm tra spam/log.

## Bảo mật

Không đưa vào Git: `.env`, Firebase Admin JSON, database dump, log chứa token, API private key. Nếu credential từng công khai, hãy rotate ngay và làm sạch lịch sử Git.
