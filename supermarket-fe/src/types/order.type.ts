/**
 * ============================
 * ORDER TYPES — Khớp với API Backend
 * ============================
 */

/** Phương thức thanh toán hỗ trợ */
export type PaymentMethod = "COD" | "VNPAY";

/** Body cho POST /api/orders/ */
export interface CreateOrderPayload {
  receiver_name: string;
  receiver_phone: string;
  address_text: string;
  note?: string;
  voucher_code?: string;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  payment_method?: PaymentMethod;
}

/** Body cho POST /api/my-orders/{id}/pay-vnpay/ */
export interface CreateVnpayPaymentUrlPayload {
  return_url?: string;
}

/** Response từ POST /api/my-orders/{id}/pay-vnpay/ */
export interface VnpayPaymentUrlResponse {
  order_id?: number;
  order_code: string;
  payment_url: string;
  return_url?: string;
  message: string;
}

/** Body cho POST /api/my-orders/{id}/verify-vnpay/ */
export interface VerifyVnpayPaymentPayload {
  [key: string]: string;
}

/** Response từ POST /api/my-orders/{id}/verify-vnpay/ */
export interface VerifyVnpayPaymentResponse {
  payment_status: string;
  order_status?: string;
  message?: string;
}

/** Body cho api POST /api/orders/calculate-shipping/ */
export interface CalculateShippingPayload {
  delivery_lat?: number | null;
  delivery_lng?: number | null;
}

export interface CalculateShippingResponse {
  subtotal: number;
  distance_km: number;
  shipping_fee: number;
  total_amount: number;
}

export interface CancelOrderResponse {
  message: string;
}

export interface UpdateOrderStatusPayload {
  status: string;
  note?: string;
}

export interface UpdateOrderStatusResponse {
  id?: number;
  status?: string;
  updated_at?: string;
  note?: string;
  message?: string;
}

/** Một item trong đơn hàng (từ API response) */
export interface OrderItemAPI {
  id: number;
  product: number;
  product_name_snapshot: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderOwnerPayload {
  id?: number | string | null;
  user_id?: number | string | null;
  pk?: number | string | null;
  email?: string | null;
  username?: string | null;
  name?: string | null;
}

/** Response từ POST /api/orders/ hoặc GET /api/orders/{id}/ */
export interface OrderResponse {
  id: number;
  order_code: string;
  user?: number | string | OrderOwnerPayload | null;
  user_id?: number | string | null;
  customer?: number | string | OrderOwnerPayload | null;
  customer_id?: number | string | null;
  owner_id?: number | string | null;
  receiver_name: string;
  receiver_phone: string;
  address_text: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  distance_km: number | null;
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  voucher_code?: string | null;
  discount_amount?: number | null;
  note?: string | null;
  status: string;
  payment_status?: string | null;
  payment_method?: PaymentMethod | string | null;
  customer_visible?: boolean | null;
  is_visible_to_customer?: boolean | null;
  is_visible_for_customer?: boolean | null;
  created_at: string;
  updated_at: string;
  items: OrderItemAPI[];
}
