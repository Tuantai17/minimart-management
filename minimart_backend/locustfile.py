from locust import HttpUser, task, between

# Thay bằng token thật của bạn (lấy từ POST /api/token/)
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzc0NjgyODMyLCJpYXQiOjE3NzQ1OTY0MzIsImp0aSI6IjBiOGRkZDgzYTZhYTQ3ODg4ODk1MTg0NzZhN2MzZjk0IiwidXNlcl9pZCI6IjUifQ.Gb_qtX8GLfi-Zck-iWlGa2yIWX2FmLsjL7cEBSFftg4"

class MiniMartUser(HttpUser):
    # Mỗi user ảo chờ 1-3 giây giữa mỗi hành động (giống người dùng thật)
    wait_time = between(1, 3)

    # Header xác thực gửi kèm mọi request
    headers = {"Authorization": f"Bearer {TOKEN}"}

    # ① Test GET danh sách sản phẩm (API có Cache)
    @task(3)  # weight=3: chạy nhiều hơn 3 lần so với @task(1)
    def get_products(self):
        self.client.get("/api/products/", headers=self.headers)

    # ② Test GET danh mục
    @task(1)
    def get_categories(self):
        self.client.get("/api/categories/", headers=self.headers)

    # ③ Test GET danh sách đơn hàng của mình
    @task(1)
    def get_orders(self):
        self.client.get("/api/orders/", headers=self.headers)
