# 🛒 Mini Supermarket App - Frontend

> Ứng dụng Siêu Thị Mini xây dựng bằng **React Native + Expo Router + TypeScript + Docker**

---

## 📋 Mục lục

1. [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
2. [Cài đặt & Chạy](#-cài-đặt--chạy)
3. [Chạy với Docker](#-chạy-với-docker)

---

## 💻 Yêu cầu hệ thống

| Tool    | Version | Mô tả                   |
| ------- | ------- | ----------------------- |
| Node.js | ≥ 20.x  | Runtime JavaScript      |
| npm     | ≥ 10.x  | Package manager         |
| Docker  | ≥ 24.x  | Container (tùy chọn)    |
| Expo Go | Latest  | Chạy trên thiết bị thật |

---

## 🚀 Cài đặt & Chạy

### Bước 1: Cài dependencies

```bash
npm install
```

### Bước 2: Cấu hình môi trường

```bash
cp .env.example .env
# Sửa EXPO_PUBLIC_API_URL theo backend
```

### Bước 3: Chạy ứng dụng

```bash
# Web (development)
npx expo start --web

# Mobile (Expo Go - scan QR)
npx expo start

# Android Emulator
npx expo start --android

# iOS Simulator
npx expo start --ios
```

---

## 🐳 Chạy với Docker

```bash
# Build + chạy
docker-compose up --build

# Truy cập: http://localhost:8081

# Dừng
docker-compose down
```

---

**© 2026 Mini Supermarket App | Built with Expo + TypeScript**
