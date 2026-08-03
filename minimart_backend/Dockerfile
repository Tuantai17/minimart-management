# Sử dụng Python image chính thức làm base
FROM python:3.12-slim

# Thiết lập biến môi trường
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Cài đặt các dependencies hệ thống cần thiết
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy file requirements và cài đặt python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ source code vào container
COPY . /app/

# Port mà Django sẽ chạy
EXPOSE 8000

# Lệnh khởi chạy server — dùng Daphne (ASGI, production-ready)
# runserver chỉ dùng cho local dev: python manage.py runserver
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "core.asgi:application"]
