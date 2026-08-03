# 📱 MiniMart Frontend

Ứng dụng mua sắm và quản trị MiniMart đa nền tảng bằng **Expo 54**, **React Native 0.81**, **React 19**, **Expo Router** và **TypeScript**. Cùng codebase có thể chạy Android, iOS và web.

> Xem [README toàn hệ thống](../README.md) và [README backend](../minimart_backend/README.md).

## Tính năng

- Đăng nhập/đăng ký, OTP, đổi/quên mật khẩu, Google/Firebase/Facebook.
- Trang chủ, banner, danh mục, tìm kiếm/lọc và chi tiết sản phẩm.
- Giỏ hàng, voucher, checkout, địa chỉ và tính phí giao hàng.
- VNPAY, lịch sử/trạng thái đơn hàng.
- Đánh giá kèm ảnh/video.
- Hồ sơ, bảo mật, thông báo, chính sách và điều khoản.
- Chat hỗ trợ realtime.
- Staff/Admin: tổng quan, kho, đơn hàng, doanh thu và support ticket.

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| Runtime | Expo 54, React Native 0.81.5, React 19.1 |
| Ngôn ngữ | TypeScript 5.9 |
| Routing | Expo Router 6, file-based typed routes |
| State | Zustand 5 |
| HTTP/Auth | Axios, JWT, AsyncStorage |
| Native integrations | Firebase Auth/Messaging, Google Sign-In, Facebook SDK |
| Device | Expo Location, Image Picker, Image Manipulator, Print |
| UI | Expo Image, Linear Gradient, Vector Icons, Reanimated |
| Web | React DOM, React Native Web, Metro static output |

## Cấu trúc

```text
supermarket-fe/
├── app/                         # Routes và screens
│   ├── (auth)/                  # Login/register/OTP/password
│   ├── (tabs)/                  # Home/category/orders/profile
│   ├── category/                # Danh mục
│   ├── product/                 # Chi tiết sản phẩm
│   ├── search/                  # Tìm kiếm/lọc
│   ├── checkout/                # Checkout/success
│   ├── order/                   # Danh sách/chi tiết đơn
│   ├── payment/                 # Kết quả VNPAY
│   ├── profile/                 # Hồ sơ, địa chỉ, support
│   ├── review/                  # Viết đánh giá
│   └── staff-admin/             # Quản trị vận hành
├── src/
│   ├── components/              # Component theo feature
│   ├── services/                # REST, Firebase, location, message
│   │   └── api/                 # Axios client/endpoints/errors
│   ├── store/                   # Zustand stores
│   ├── hooks/                   # useChat, notification, debounce...
│   ├── types/                   # Domain contracts
│   ├── constants/               # Màu sắc/config/spacing
│   ├── errors/                  # Domain errors
│   └── utils/                   # Format, storage, inventory...
├── assets/                      # Logo, ảnh và font
├── app.json                     # Expo native config/plugins
├── package.json
└── .env.example
```

## Điều hướng

| Nhóm route | Màn hình tiêu biểu |
|---|---|
| `(auth)` | splash, login, phone login, register, forgot/verify OTP, reset password |
| `(tabs)` | home, category, orders, profile |
| `product/[id]` | Chi tiết sản phẩm động |
| `category/[id]` | Sản phẩm theo danh mục |
| `search` | Gợi ý và kết quả lọc |
| `checkout` | Kiểm tra đơn và thành công |
| `order/[id]` | Chi tiết/theo dõi đơn |
| `payment/result` | Deep link/kết quả VNPAY |
| `profile` | Địa chỉ, bảo mật, chat, notification, voucher |
| `staff-admin` | Kho, đơn, báo cáo và hỗ trợ |

`app/_layout.tsx` là layout gốc. Các `_layout.tsx` con tổ chức Stack/Tabs theo nhóm. File `[id].tsx` là route động.

## Yêu cầu

- Node.js 20+ và npm 10+.
- Android Studio cho emulator/build Android.
- Xcode trên macOS cho iOS native.
- Expo Go cho tính năng thuần Expo; **development build** cho native Firebase/Google/Facebook đầy đủ.
- Backend MiniMart đang chạy.

## Cài đặt

```powershell
cd supermarket-fe
npm install
Copy-Item .env.example .env
```

Cấu hình `.env`:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api
EXPO_PUBLIC_GOONG_API_KEY=your_goong_api_key
EXPO_PUBLIC_FIREBASE_GOOGLE_WEB_CLIENT_ID=your_web_client_id.apps.googleusercontent.com
```

Khởi động Metro:

```powershell
npm start
```

Các script có sẵn:

```powershell
npm run web       # Expo Web
npm run android   # Native Android (expo run:android)
npm run ios       # Native iOS, chỉ macOS
```

Bạn cũng có thể dùng `npx expo start --android`, `--web` hoặc quét QR theo khả năng của build.

## Kết nối backend

`EXPO_PUBLIC_API_URL` phải kết thúc bằng `/api` và không nên có dấu `/` thừa nếu client tự nối endpoint.

| Thiết bị | URL mẫu |
|---|---|
| Web trên máy dev | `http://127.0.0.1:8000/api` |
| Android Emulator | `http://10.0.2.2:8000/api` |
| iOS Simulator | `http://127.0.0.1:8000/api` |
| Điện thoại thật | `http://192.168.x.x:8000/api` |

Điện thoại thật và máy tính phải cùng Wi-Fi. Backend cần chạy `python manage.py runserver 0.0.0.0:8000`, thêm IP LAN vào `ALLOWED_HOSTS` và mở Windows Firewall.

## Quản lý trạng thái và API

- `src/services/api/client.ts`: Axios instance, gắn Bearer token và xử lý refresh.
- `src/services/api/endpoints.ts`: tập trung đường dẫn endpoint.
- Các `*.service.ts`: API theo domain (cart, order, product, user, voucher...).
- `src/store/auth.store.ts`: phiên đăng nhập/token.
- `cart.store.ts`, `order.store.ts`, `profile.store.ts`, `search.store.ts`, `voucher.store.ts`: state nghiệp vụ.
- AsyncStorage duy trì dữ liệu cần thiết giữa các lần mở app.

Nguyên tắc thêm feature:

1. Khai báo contract trong `src/types`.
2. Thêm endpoint/service trong `src/services`.
3. Thêm Zustand store nếu state dùng chung.
4. Tạo component tập trung trong `src/components/<feature>`.
5. Ghép screen/route trong `app`.

## Firebase, Google và Facebook

Project dùng:

- `google-services.json` cho Android Firebase client.
- `GoogleService-Info.plist` cho iOS Firebase client.
- Firebase Auth/Messaging native modules.
- Google Sign-In web client ID từ biến môi trường.
- Facebook SDK plugin trong `app.json`.

Sau khi thay đổi `app.json`, plugin hoặc file native service, cần rebuild native app. Expo Go thường không chứa các native module tùy chỉnh này.

```powershell
npx expo prebuild
npm run android
```

Không chạy `prebuild --clean` nếu chưa commit/backup thay đổi native. Firebase Admin private key thuộc backend và tuyệt đối không đặt trong frontend.

## Goong Maps và vị trí

Ứng dụng xin quyền vị trí trên Android/iOS và dùng `EXPO_PUBLIC_GOONG_API_KEY` cho geocoding. Các service có cơ chế vô hiệu hóa khi key thiếu/placeholder.

- Giới hạn key theo API/domain/package tại Goong Console.
- Trên thiết bị, người dùng phải cấp quyền vị trí.
- Reverse geocoding cũng có backend proxy tại `/api/location/reverse-geocode/`.

## Thanh toán VNPAY

Backend tạo/xác minh giao dịch; frontend hiển thị WebView/trình duyệt và nhận kết quả tại route `payment/result`. Scheme ứng dụng là `minisupermarket`. Đồng bộ `VNPAY_RETURN_URL` backend với URL frontend thực tế.

Không quyết định trạng thái thanh toán chỉ dựa vào query trả về client; backend IPN và chữ ký VNPAY là nguồn xác thực.

## Push notification

Luồng tổng quát:

1. App yêu cầu quyền notification.
2. Firebase cấp FCM token.
3. Frontend đăng ký token qua `/api/devices/`.
4. Backend gửi notification theo sự kiện.
5. App cập nhật notification store và điều hướng khi người dùng nhấn.
6. Logout/token hết hạn thì unregister qua `/api/devices/{token}/`.

Android 13+ cần quyền notification runtime. iOS cần APNs/Firebase capabilities và provisioning phù hợp.

## Chat realtime

Frontend dùng `useChat` và messaging service để kết nối:

```text
ws://<backend-host>:8000/ws/support/
```

Production dùng `wss://`. Khi chạy điện thoại thật, không dùng `localhost`; dùng IP LAN giống API.

## Staff/Admin

Các route trong `app/staff-admin` cung cấp:

- Tổng quan quản trị.
- Danh sách/chi tiết tồn kho.
- Quản lý và cập nhật trạng thái đơn.
- Báo cáo doanh thu.
- Ticket và chat hỗ trợ.

Backend vẫn là nơi bắt buộc kiểm tra quyền; ẩn route phía frontend không phải cơ chế bảo mật.

## Chạy Web bằng Docker

```powershell
docker compose up --build
```

Theo cấu hình hiện tại, truy cập `http://localhost:8081`. Dừng bằng:

```powershell
docker compose down
```

Biến `EXPO_PUBLIC_*` có thể được đưa vào bundle lúc build; thay đổi chúng có thể yêu cầu rebuild/restart Metro.

## Kiểm tra chất lượng

`package.json` hiện chưa khai báo test/lint. Kiểm tra TypeScript:

```powershell
npx tsc --noEmit
```

Xóa cache Metro khi gặp module/cache cũ:

```powershell
npx expo start --clear
```

## Lỗi thường gặp

### `Network Error` / timeout

- Không dùng `localhost` từ Android emulator/điện thoại.
- Kiểm tra API URL, firewall, backend, Wi-Fi và `ALLOWED_HOSTS`.
- Web cần CORS origin phù hợp.

### Firebase module không tồn tại trong Expo Go

Tạo development build/native build vì Expo Go không đóng gói module tùy chỉnh.

### Google Login báo client mismatch

Đối chiếu web client ID, Android package `com.minisupermarket.app`, iOS bundle identifier, SHA-1/SHA-256 và Firebase Console.

### Location không hoạt động

Kiểm tra permission trong cài đặt thiết bị, API key Goong và kết nối mạng.

### Thay `.env` nhưng giá trị không đổi

Dừng Metro rồi chạy `npx expo start --clear`. Biến `EXPO_PUBLIC_*` được nhúng vào client và không phải secret.

## Bảo mật frontend

- Mọi `EXPO_PUBLIC_*` đều có thể đọc từ bundle; không đặt private secret.
- Chỉ lưu token cần thiết; logout phải xóa local session.
- Không log access/refresh token hoặc dữ liệu cá nhân.
- Backend phải kiểm tra quyền và xác thực mọi nghiệp vụ.
- Hạn chế API key client bằng package, certificate và domain.
