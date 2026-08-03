# 🔥 MiniMart Backend — Deep Audit Report

> **Ngày:** 2026-04-24  
> **Auditor:** Security Auditor + Database Reviewer + Architecture Analyst  
> **Phạm vi:** Toàn bộ codebase `store/` và `core/`  
> **Quy tắc:** KHÔNG sửa code — chỉ phân tích và đề xuất

---

## 📊 Tổng Kết Nhanh

| Mức độ | Số lượng | Trạng thái |
|--------|----------|------------|
| 🔴 **CRITICAL** | 3 | ✅ Đã fix 3/3 |
| 🟠 **HIGH** | 8 | ✅ Đã fix 8/8 |
| 🟡 **MEDIUM** | 7 | ⚠️ 1/7 đã fix (MEDIUM-06) |
| 🟢 **LOW** | 5 | ⏳ Chưa fix |

---

## 🔴 CRITICAL — Phải sửa ngay

---

### ✅ CRITICAL-01: Crawler API thiếu Input Validation — Injection Risk — **ĐÃ FIX**

**File:** `store/views/crawler_views.py:29-43`

**Mô tả:**  
API `/api/crawler/import/` nhận dữ liệu từ bên ngoài nhưng **KHÔNG validate input** trước khi ghi vào DB. Các field `name`, `unit`, `image_url`, `source_url`, `category_name` được lấy thẳng từ request body mà không kiểm tra:
- Độ dài chuỗi (có thể gây DB error hoặc DoS)
- Kiểu dữ liệu `price` (có thể truyền string/negative)
- Format URL cho `image_url`, `source_url` (có thể chứa XSS payload nếu render ở admin)
- `external_id` trống hoặc None

```python
# HIỆN TẠI — Không validate gì cả
for item in products:
    obj, created = CrawlerProduct.objects.update_or_create(
        external_id=str(item.get('external_id')),  # None → "None" ???
        source='BHX',
        defaults={
            'name': item.get('name'),        # Có thể None hoặc string 10MB
            'price': item.get('price', 0),   # Có thể negative hoặc string
            ...
        }
    )
```

**Impact:** Attacker biết CRAWLER_SECRET có thể inject dữ liệu bẩn vào DB, gây lỗi hệ thống hoặc XSS trong admin panel.

**Đề xuất fix:**
```python
from rest_framework import serializers

class CrawlerProductItemSerializer(serializers.Serializer):
    external_id = serializers.CharField(max_length=100, required=True)
    name = serializers.CharField(max_length=255, required=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=0)
    unit = serializers.CharField(max_length=50, allow_blank=True, required=False)
    image_url = serializers.URLField(max_length=500, required=False, allow_blank=True)
    category_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    source_url = serializers.URLField(max_length=500, required=False, allow_blank=True)

# Trong view:
for item_data in products:
    s = CrawlerProductItemSerializer(data=item_data)
    if not s.is_valid():
        continue  # hoặc collect errors
    CrawlerProduct.objects.update_or_create(
        external_id=s.validated_data['external_id'], ...
    )
```

---

### ✅ CRITICAL-02: `.env` file bị commit vào Git — **ĐÃ HARDENING**

**File:** `.env` (3165 bytes tồn tại trong repo)

**Mô tả:**  
File `.env` **tồn tại trong working directory** và có thể đã từng bị commit. Mặc dù `.gitignore` có exclude `.env`, nhưng nếu file đã được commit trước khi thêm vào gitignore thì **toàn bộ secret đã nằm trong git history**: `SECRET_KEY`, `DB_PASSWORD`, `CRAWLER_SECRET`, `VNPAY_HASH_SECRET`, `EMAIL_HOST_PASSWORD`.

**Impact:** Bất kỳ ai có quyền đọc repo đều có thể lấy được toàn bộ credentials.

**Đề xuất fix:**
```bash
# 1. Kiểm tra xem .env đã từng bị commit chưa
git log --all --full-history -- .env

# 2. Nếu có, phải xóa khỏi git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all

# 3. ROTATE tất cả secrets ngay lập tức:
#    - SECRET_KEY, DB_PASSWORD, CRAWLER_SECRET
#    - VNPAY_HASH_SECRET, EMAIL_HOST_PASSWORD
#    - Firebase service account key
```

---

### ✅ CRITICAL-03: Order Cancel thiếu kiểm tra quyền sở hữu (IDOR) — **ĐÃ FIX**

**File:** `store/views/order_views.py:128-132` (OrderViewSet.cancel)

**Mô tả:**  
Action `cancel` trong `OrderViewSet` dùng `self.get_object()` nhưng queryset của `OrderViewSet` cho phép Admin xem tất cả đơn. Tuy nhiên, action `cancel` chỉ yêu cầu `IsAuthenticated` (thuộc `AUTH_ACTIONS`), **KHÔNG phải `IsAdminUser`**. Điều này có nghĩa:

1. User thường gọi `POST /api/orders/{id}/cancel/`
2. `get_permissions()` trả về `[IsAuthenticated()]` vì `cancel` ∈ `AUTH_ACTIONS`
3. Nhưng `get_queryset()` cho user thường trả `Order.objects.none()` → **404**

Vấn đề nằm ở logic không nhất quán: `cancel` action thuộc `AUTH_ACTIONS` nhưng `get_queryset` cho non-staff trả về `none()`. User thường phải dùng `MyOrderViewSet` để hủy đơn. Tuy nhiên, nếu tương lai ai đó sửa `get_queryset()` mà quên kiểm tra ownership → **IDOR ngay lập tức**.

**Impact:** Hiện tại bị che bởi `get_queryset().none()` nhưng thiết kế rất giòn — 1 dòng sửa sai = IDOR.

**Đề xuất fix:**
```python
# Di chuyển 'cancel' ra khỏi AUTH_ACTIONS, hoặc thêm ownership check:
ADMIN_ONLY_ACTIONS = {'list', 'retrieve', 'partial_update', 'update_status', 'cancel'}
# Hoặc thêm explicit check trong cancel():
def cancel(self, request, pk=None):
    order = self.get_object()
    if order.user != request.user and not request.user.is_staff:
        raise PermissionDenied("Không có quyền hủy đơn này.")
    ...
```

---

## 🟠 HIGH — Sửa trước khi release

---

### ✅ HIGH-01: N+1 Query trong Crawler Import (loop update_or_create) — **ĐÃ FIX**

**File:** `store/views/crawler_views.py:30-44`

**Mô tả:**  
Mỗi item trong payload tạo **2 queries** (SELECT + INSERT/UPDATE). Với payload 200 items = **400 queries**.

```python
for item in products:  # Tối đa 200 items
    obj, created = CrawlerProduct.objects.update_or_create(...)  # 2 queries/item
```

**Đề xuất fix:**
```python
# Dùng bulk_create + update_or_create_batch, hoặc tối thiểu dùng transaction:
from django.db import transaction

with transaction.atomic():
    for item in products:
        CrawlerProduct.objects.update_or_create(...)
# Hoặc tối ưu hơn: dùng bulk_upsert với ON CONFLICT
```

---

### ✅ HIGH-02: N+1 Query tiềm ẩn trong notification — Loop gửi FCM — **ĐÃ FIX**

**File:** `store/services/notification_service.py:41-54`

**Mô tả:**  
Mỗi thiết bị FCM gọi `messaging.send()` riêng biệt (1 HTTP call/device). Nếu user có 5 devices = 5 API calls tuần tự.

**Đề xuất fix:**
```python
# Firebase hỗ trợ send_each() cho batch (thay thế send_multicast đã deprecated)
from firebase_admin import messaging

messages = [
    messaging.Message(notification=..., token=device.token)
    for device in devices
]
response = messaging.send_each(messages)
# 1 API call thay vì N calls
```

---

### ✅ HIGH-03: `_blacklist_user_tokens` — N+1 trong loop get_or_create — **ĐÃ FIX**

**File:** `store/views/auth_views.py:57-66`

**Mô tả:**  
Khi đổi mật khẩu, mỗi outstanding token gọi `get_or_create` riêng:

```python
tokens = OutstandingToken.objects.filter(user=user)
for token in tokens:
    BlacklistedToken.objects.get_or_create(token=token)  # 1-2 query/token
```

User hoạt động lâu có thể có hàng chục tokens → hàng chục queries.

**Đề xuất fix:**
```python
tokens = OutstandingToken.objects.filter(user=user)
existing = set(BlacklistedToken.objects.filter(
    token__in=tokens
).values_list('token_id', flat=True))
new_blacklisted = [
    BlacklistedToken(token=t) for t in tokens if t.id not in existing
]
BlacklistedToken.objects.bulk_create(new_blacklisted, ignore_conflicts=True)
```

---

### ✅ HIGH-04: `check_low_stock_and_notify_admin` — N+1 trong email HTML — **ĐÃ FIX**

**File:** `store/tasks.py:68-116`

**Mô tả:**  
```python
low_stock_products = Product.objects.filter(stock_quantity__lte=10, is_active=True)
# ... iterate all products to build HTML
recipients = User.objects.filter(
    is_staff=True,
    profile__receive_stock_alerts=True  # JOIN qua profile
).values_list('email', flat=True)
```

Không có `select_related` hoặc `.only()` — load toàn bộ fields của Product. Ngoài ra, `low_stock_products` được iterate 2 lần (build rows + `.count()`).

**Đề xuất fix:**
```python
low_stock_products = list(
    Product.objects.filter(stock_quantity__lte=10, is_active=True)
    .only('id', 'name', 'stock_quantity')
    .order_by('stock_quantity')
)
if not low_stock_products:
    return "..."
# Dùng len(low_stock_products) thay vì .count()
```

---

### ✅ HIGH-05: CartItem.delete_at filter thiếu nhất quán — **GHI NHẮN** (ActiveManager đã xử lý)

**File:** `store/views/order_views.py:27`, `store/services/order_services.py:41-44`

**Mô tả:**  
`CartItemViewSet.get_queryset()` filter `delete_at__isnull=True`, nhưng `create_order()` lấy cart items **KHÔNG filter delete_at**:

```python
# CartItemViewSet (có filter)
CartItem.objects.filter(cart__user=self.request.user, delete_at__isnull=True)

# create_order (KHÔNG filter)
cart_items = list(
    CartItem.objects.filter(cart=cart)  # ← Thiếu delete_at__isnull=True
    .select_related('product')
    .order_by('product_id')
)
```

Mặc dù `CartItem.objects` dùng `ActiveManager` (tự filter delete_at), nhưng nếu logic phụ thuộc vào manager mặc định thì **không rõ ràng** và dễ bị break nếu ai đó dùng `all_objects`.

**Đề xuất fix:**
```python
# Explicit filter cho rõ ràng:
cart_items = list(
    CartItem.objects.filter(cart=cart, delete_at__isnull=True)
    .select_related('product')
    .order_by('product_id')
)
```

---

### ✅ HIGH-06: `MeView.patch` thiếu validate MIME type avatar — **ĐÃ FIX**

**File:** `store/views/user_views.py:363-378`

**Mô tả:**  
Upload avatar chỉ kiểm tra extension nhưng **KHÔNG validate MIME type** và **KHÔNG validate magic bytes** (khác với `manage_media` của ReviewViewSet đã validate cả 2). Attacker có thể upload file `.jpg` nhưng nội dung là HTML/JS → Stored XSS nếu file được serve trực tiếp.

```python
# MeView.patch — CHỈ check extension
ext = os.path.splitext(file.name or '')[1].lower()
if ext not in ALLOWED_IMAGE_EXT:
    ...
profile.avatar_url = file  # Lưu thẳng, không check MIME/magic bytes
```

**Đề xuất fix:**
```python
import imghdr

content_type = (file.content_type or '').lower()
if content_type not in ALLOWED_IMAGE_TYPES:
    return Response({"error": "MIME type không hợp lệ."}, status=400)

file.seek(0)
detected = imghdr.what(file)
file.seek(0)
if detected not in {'jpeg', 'png', 'webp', 'gif'}:
    return Response({"error": "File ảnh không hợp lệ hoặc bị giả mạo."}, status=400)
```

---

### ✅ HIGH-07: `MeView.patch` thiếu validate `phone` field — **ĐÃ FIX**

**File:** `store/views/user_views.py:360-361`

**Mô tả:**  
Field `phone` được gán trực tiếp từ request data mà **không validate format**:

```python
if 'phone' in data:
    profile.phone = data['phone']  # Có thể là bất kỳ string nào
```

User có thể gửi phone = script tag, string dài 10000 ký tự, hoặc giá trị không phải số điện thoại.

**Đề xuất fix:**
```python
import re

PHONE_REGEX = re.compile(r'^(\+84|0)\d{9,10}$')

if 'phone' in data:
    phone = str(data['phone']).strip()
    if not PHONE_REGEX.match(phone):
        return Response({"error": "Số điện thoại không hợp lệ."}, status=400)
    profile.phone = phone
```

---

### ✅ HIGH-08: `support_views.py` — Admin reply thiếu validate độ dài message — **ĐÃ FIX**

**File:** `store/views/support_views.py:212-214`

**Mô tả:**  
Khách hàng gửi tin nhắn qua `SupportViewSet.send` và Admin reply qua `AdminSupportViewSet.reply` — cả hai đều **chỉ check empty** mà không giới hạn độ dài. Attacker có thể gửi message 100MB → OOM hoặc DB bloat.

```python
message_text = request.data.get('message', '')
if not message_text.strip():  # Chỉ check rỗng
    ...
msg = SupportService.send_message(ticket, request.user, True, message_text)
```

**Đề xuất fix:**
```python
MAX_MESSAGE_LENGTH = 5000

message_text = request.data.get('message', '')
if not message_text.strip():
    return Response({"error": "Tin nhắn không được để trống."}, status=400)
if len(message_text) > MAX_MESSAGE_LENGTH:
    return Response(
        {"error": f"Tin nhắn không được vượt quá {MAX_MESSAGE_LENGTH} ký tự."},
        status=400
    )
```

---

## 🟡 MEDIUM — Sửa trong sprint hiện tại

---

### MEDIUM-01: `CategoryViewSet` không có `select_related('parent')`

**File:** `store/views/product_views.py:30-39`

**Mô tả:**  
`CategoryViewSet.queryset = Category.objects.all()` — khi serializer truy cập `parent`, mỗi category gây thêm 1 query. Với 50 categories = 50 queries thừa.

**Đề xuất fix:**
```python
queryset = Category.objects.select_related('parent').all()
```

---

### MEDIUM-02: `BestSellingProductsAPIView` — Unauthenticated user truy cập is_staff

**File:** `store/views/product_views.py:164`

**Mô tả:**  
```python
is_staff = request.user and request.user.is_staff
```

Khi `permission_classes = [AllowAny]` và `authentication_classes = []`, `request.user` là `AnonymousUser`. `AnonymousUser` có `is_staff = False` nên không crash, nhưng biểu thức `request.user and ...` luôn truthy (AnonymousUser is truthy). Nên viết rõ ràng hơn.

**Đề xuất fix:**
```python
is_staff = request.user.is_authenticated and request.user.is_staff
```

---

### MEDIUM-03: `imghdr` module deprecated từ Python 3.11, bị xóa ở 3.13

**File:** `store/views/user_views.py:1`

**Mô tả:**  
`import imghdr` đã bị deprecated. Nếu upgrade Python lên 3.13+ sẽ crash.

**Đề xuất fix:**
```python
# Thay bằng python-magic hoặc filetype:
import filetype

kind = filetype.guess(file)
if kind is None or kind.mime not in ALLOWED_IMAGE_TYPES:
    return Response({"error": "File không hợp lệ."}, status=400)
```

---

### MEDIUM-04: `vnp_CreateDate` dùng `datetime.now()` thay vì timezone-aware

**File:** `store/services/vnpay_service.py:107`

**Mô tả:**  
```python
'vnp_CreateDate': datetime.now().strftime('%Y%m%d%H%M%S'),
```

Dùng `datetime.now()` (naive, local time) thay vì `timezone.now()`. Trên server UTC, timestamp sẽ lệch 7 giờ so với múi giờ VN → có thể gây lỗi xác thực VNPAY.

**Đề xuất fix:**
```python
from django.utils import timezone
# VNPAY yêu cầu GMT+7
'vnp_CreateDate': timezone.now().astimezone(
    zoneinfo.ZoneInfo('Asia/Ho_Chi_Minh')
).strftime('%Y%m%d%H%M%S'),
```

---

### MEDIUM-05: `FCMDeviceUnregisterView` — logic `deleted` luôn là tuple

**File:** `store/views/device_views.py:63-66`

**Mô tả:**  
```python
deleted, _ = FCMDevice.objects.filter(
    token=token,
    user=request.user,
).update(is_active=False), None
```

`update()` trả về int (số rows updated), nhưng code ghi `deleted, _ = ..., None` → `deleted` = int từ update, `_` = None. Đúng kết quả nhưng **cực kỳ khó đọc** và dễ hiểu nhầm. Biến `deleted` không được dùng ở đâu cả.

**Đề xuất fix:**
```python
FCMDevice.objects.filter(
    token=token,
    user=request.user,
).update(is_active=False)
```

---

### MEDIUM-06: `Order.objects.all()` thiếu `select_related` / `prefetch_related`

**File:** `store/views/order_views.py:80-83`

**Mô tả:**  
Admin queryset trả về `Order.objects.all().order_by('-created_at')` **không có** `select_related('user', 'voucher')` hay `prefetch_related('items')`. Khi serializer truy cập user/items → N+1.

**Đề xuất fix:**
```python
return Order.objects.select_related(
    'user', 'voucher'
).prefetch_related(
    'items__product'
).all().order_by('-created_at')
```

---

### MEDIUM-07: `report_services.py` — Bare `except Exception` nuốt lỗi

**File:** `store/services/report_services.py:36-38`

**Mô tả:**  
```python
except Exception as e:
    logger.error(f"Revenue aggregation failed: {e}")
    res = {k: 0 for k in [...]}
```

Catch `Exception` quá rộng — nuốt cả lỗi programming (TypeError, AttributeError). Nên chỉ catch `DatabaseError`.

**Đề xuất fix:**
```python
from django.db import DatabaseError
except DatabaseError as e:
    logger.exception("Revenue aggregation failed")
    res = {...}
```

---

## 🟢 LOW — Lên kế hoạch fix

---

### LOW-01: `ReviewViewSet.http_method_names` include `delete` nhưng `perform_destroy` là soft-delete

**File:** `store/views/user_views.py:54`

**Mô tả:**  
Comment nói "Tắt hoàn toàn DELETE" nhưng `http_method_names` vẫn include `'delete'`. `perform_destroy` làm soft-delete — logic đúng nhưng comment sai.

**Đề xuất fix:**  
Nếu muốn tắt DELETE thật: bỏ `'delete'` khỏi `http_method_names`. Nếu muốn giữ soft-delete: sửa comment cho chính xác.

---

### LOW-02: Cache key dùng MD5 — weak hash

**File:** `store/views/product_views.py:70`

**Mô tả:**  
MD5 dùng cho cache key không phải vấn đề security (vì không dùng cho authentication), nhưng **collision risk** tồn tại. Nên dùng SHA256 cho consistency.

---

### LOW-03: `Voucher.code` có duplicate index

**File:** `store/models/voucher.py:19-20, 63-64`

**Mô tả:**  
`code = CharField(unique=True, db_index=True)` — `unique=True` đã tạo index rồi, `db_index=True` thừa. Thêm vào đó, `Meta.indexes` lại khai báo `Index(fields=['code'])` — tổng cộng **3 indexes cho 1 column**.

**Đề xuất fix:**
```python
code = models.CharField(max_length=50, unique=True)  # Bỏ db_index
# Bỏ Index(fields=['code']) trong Meta.indexes
```

---

### LOW-04: `create_order` không validate `receiver_name`, `receiver_phone`, `address_text`

**File:** `store/services/order_services.py:90-95`

**Mô tả:**  
Các trường bắt buộc của đơn hàng được lấy thẳng từ `data.get()` mà không validate. Nếu FE không gửi → `receiver_name=None` nhưng CharField không cho phép None → Django sẽ raise `IntegrityError`.

**Đề xuất fix:**  
Dùng `OrderCreateSerializer` để validate input trước khi gọi `create_order()`.

---

### LOW-05: `Price` dùng `decimal_places=0` nhưng `discount_price` dùng `decimal_places=2`

**File:** `store/models/product.py:38-39`

**Mô tả:**  
```python
price          = DecimalField(max_digits=12, decimal_places=0)
discount_price = DecimalField(max_digits=12, decimal_places=2)
```

Không nhất quán — nếu `price=50000` và `discount_price=49999.99`, phép tính `subtotal` có thể gây rounding issues.

**Đề xuất fix:**  
Thống nhất cả 2 field dùng `decimal_places=2` hoặc `decimal_places=0`.

---

## ✅ Positive Observations — Những điểm làm tốt

| # | Điểm tốt | File |
|---|----------|------|
| 1 | **OTP dùng CSPRNG** (`secrets.randbelow`) + **constant-time compare** (`hmac.compare_digest`) | `auth_views.py` |
| 2 | **Anti User-Enumeration** — trả message chung cho forgot-password | `auth_views.py:101` |
| 3 | **One-time reset_token** thay vì boolean flag — chống CSRF/replay | `auth_views.py:165` |
| 4 | **Rate limiting** đầy đủ cho auth, voucher, order, support, payment | `settings.py:176-186` |
| 5 | **Transaction + select_for_update** cho order/voucher — chống race condition | `order_services.py`, `voucher_service.py` |
| 6 | **Deadlock prevention** bằng `order_by('product_id')` | `order_services.py:21,44` |
| 7 | **VNPAY HMAC verify** dùng `compare_digest` — chống timing attack | `vnpay_service.py:149` |
| 8 | **Open-redirect protection** cho VNPAY return_url | `vnpay_service.py:40-68` |
| 9 | **WebSocket token qua message** thay vì URL — tránh lộ trong logs | `middleware.py`, `consumers.py` |
| 10 | **Security headers** (XSS filter, HSTS, X-Frame DENY) cấu hình đúng | `settings.py:28-42` |
| 11 | **CORS không dùng wildcard** — restrict specific origins | `settings.py:150` |
| 12 | **Soft-delete pattern** nhất quán với `ActiveManager` | `models/base.py` |
| 13 | **SECRET_KEY, DB_PASSWORD validate** bắt buộc khi khởi động | `settings.py:18-20, 97-99` |
| 14 | **Magic bytes validation** cho review media upload | `user_views.py:247-255` |
| 15 | **Token blacklist** sau đổi mật khẩu — revoke phiên cũ ngay | `auth_views.py:88` |

---

## 📋 Recommendations — Hành động tiếp theo

### Ưu tiên ngay (Sprint này)
1. Rotate toàn bộ secrets nếu `.env` đã từng bị commit
2. Thêm input validation cho Crawler Import API
3. Thêm MIME + magic bytes validation cho avatar upload
4. Thêm max length cho support messages
5. Fix `cancel` permission logic trong `OrderViewSet`

### Ưu tiên cao (Sprint sau)
6. Bulk optimize N+1 queries (notification, token blacklist, crawler)
7. Thêm `select_related`/`prefetch_related` cho Order admin queryset
8. Validate phone format trong MeView
9. Thống nhất decimal_places cho price fields

### Dài hạn
10. Migrate từ `imghdr` sang `filetype` library
11. Timezone-aware cho VNPAY CreateDate
12. Dọn duplicate indexes trên Voucher.code
13. Tạo `OrderCreateSerializer` để validate order input

---

> **⚠️ LƯU Ý:** Báo cáo này KHÔNG sửa code. Tất cả đề xuất cần được review bởi team trước khi implement.
