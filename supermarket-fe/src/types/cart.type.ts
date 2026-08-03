/**
 * ============================
 * CART TYPES — Khớp với API Backend
 * ============================
 */

/** Thông tin sản phẩm nhúng trong cart item (từ API response) */
export interface CartProductDetails {
  id: number;
  name: string;
  image: string | null;
  price: string; 
}

/** Một item trong giỏ hàng (từ API response GET /carts/me/) */
export interface CartItemAPI {
  id: number;             // ID của cart-item (dùng cho PATCH/DELETE)
  product: number;        // ID sản phẩm
  product_details: CartProductDetails;
  quantity: number;
  unit_price: string;     
  subtotal: number;       // quantity * unit_price
}

/** Response từ GET /carts/me/ */
export interface CartResponse {
  id: number;
  user: number;
  items: CartItemAPI[];
  total_price: number;
}

/** Body cho POST /cart-items/ */
export interface AddToCartPayload {
  product: number; // ID sản phẩm
  quantity: number;
}

/** Body cho PATCH /cart-items/<id>/ */
export interface UpdateCartItemPayload {
  quantity: number;
}

/**
 * CartItem dùng cho UI local (vẫn giữ để tương thích code cũ
 * ở ProductCard, home, product detail)
 */
export interface CartItem {
  id: number;
  name: string;
  price: number;
  image?: string | null;
  unit?: string;
  quantity: number;
}
