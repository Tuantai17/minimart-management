import type {
    CalculateShippingPayload,
    CalculateShippingResponse,
    CancelOrderResponse,
    CreateOrderPayload,
    CreateVnpayPaymentUrlPayload,
    OrderResponse,
    UpdateOrderStatusPayload,
    UpdateOrderStatusResponse,
    VerifyVnpayPaymentPayload,
    VerifyVnpayPaymentResponse,
    VnpayPaymentUrlResponse,
} from "../types/order.type";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

const getAbsoluteApiUrl = (path: string) => {
  const baseUrl = String(client.defaults.baseURL || "").replace(/\/$/, "");
  return `${baseUrl}${path}`;
};

const fetchAllOrdersFromEndpoint = async (
  endpoint: string,
): Promise<OrderResponse[]> => {
  const allOrders: OrderResponse[] = [];

  const firstRes = await client.get<any>(endpoint);
  const firstData = firstRes.data;

  if (firstData && Array.isArray(firstData.results)) {
    allOrders.push(...firstData.results);

    let nextUrl: string | null = firstData.next;
    while (nextUrl) {
      try {
        const url = new URL(nextUrl);
        const apiIndex = url.pathname.indexOf("/api");
        const relativePath =
          apiIndex >= 0
            ? url.pathname.slice(apiIndex + 4) + url.search
            : url.pathname + url.search;
        const nextRes = await client.get<any>(relativePath);
        if (nextRes.data && Array.isArray(nextRes.data.results)) {
          allOrders.push(...nextRes.data.results);
        }
        nextUrl = nextRes.data?.next || null;
      } catch {
        break;
      }
    }
  } else if (Array.isArray(firstData)) {
    allOrders.push(...firstData);
  }

  allOrders.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime() || 0;
    const dateB = new Date(b.created_at).getTime() || 0;
    return dateB - dateA;
  });

  return allOrders;
};

export const orderService = {
  /**
   * Tạo đơn hàng mới
   * POST /api/orders/
   */
  createOrder: async (payload: CreateOrderPayload): Promise<OrderResponse> => {
    const body: Record<string, unknown> = {
      receiver_name: payload.receiver_name,
      receiver_phone: payload.receiver_phone,
      address_text: payload.address_text,
    };

    if (typeof payload.note === "string" && payload.note.trim()) {
      body.note = payload.note.trim();
    }

    if (
      typeof payload.voucher_code === "string" &&
      payload.voucher_code.trim()
    ) {
      body.voucher_code = payload.voucher_code.trim();
    }

    if (
      payload.delivery_lat != null &&
      payload.delivery_lng != null &&
      isFinite(payload.delivery_lat) &&
      isFinite(payload.delivery_lng)
    ) {
      body.delivery_lat = payload.delivery_lat;
      body.delivery_lng = payload.delivery_lng;
    }

    if (typeof payload.payment_method === "string" && payload.payment_method) {
      body.payment_method = payload.payment_method;
    }

    const response = await client.post<OrderResponse>(
      Endpoints.ORDER_CREATE,
      body,
    );
    return response.data;
  },

  /**
   * Xem trước phí giao hàng (shipping_fee) khi chọn địa chỉ/GPS
   * POST /api/orders/calculate-shipping/
   */
  calculateShipping: async (
    payload: CalculateShippingPayload,
  ): Promise<CalculateShippingResponse> => {
    const body: Record<string, unknown> = {};

    if (
      payload.delivery_lat != null &&
      payload.delivery_lng != null &&
      isFinite(payload.delivery_lat) &&
      isFinite(payload.delivery_lng)
    ) {
      body.delivery_lat = payload.delivery_lat;
      body.delivery_lng = payload.delivery_lng;
    }

    const response = await client.post<CalculateShippingResponse>(
      Endpoints.ORDER_CALCULATE_SHIPPING,
      body,
    );
    return response.data;
  },

  /**
   * Danh sách đơn hàng dành cho staff/admin quản trị.
   * GET /api/orders/
   */
  getOrders: async (): Promise<OrderResponse[]> => {
    return fetchAllOrdersFromEndpoint(Endpoints.ORDERS);
  },

  /**
   * Lịch sử đơn hàng của user hiện tại.
   * GET /api/my-orders/
   */
  getMyOrders: async (): Promise<OrderResponse[]> => {
    return fetchAllOrdersFromEndpoint(Endpoints.MY_ORDERS);
  },

  /**
   * Chi tiết đơn hàng ở luồng quản trị.
   * GET /api/orders/{id}/
   */
  getOrderDetail: async (orderId: string): Promise<OrderResponse> => {
    const response = await client.get<OrderResponse>(
      Endpoints.ORDER_DETAIL(orderId),
    );
    return response.data;
  },

  /**
   * Chi tiết đơn hàng cá nhân của user hiện tại.
   * GET /api/my-orders/{id}/
   */
  getMyOrderDetail: async (orderId: string): Promise<OrderResponse> => {
    const response = await client.get<OrderResponse>(
      Endpoints.MY_ORDER_DETAIL(orderId),
    );
    return response.data;
  },

  /**
   * Xin payment_url để mở luồng thanh toán VNPAY.
   * POST /api/my-orders/{id}/pay-vnpay/
   */
  createVnpayPaymentUrl: async (
    orderId: string | number,
    payload?: CreateVnpayPaymentUrlPayload,
  ): Promise<VnpayPaymentUrlResponse> => {
    try {
      const response = await client.post<VnpayPaymentUrlResponse>(
        Endpoints.ORDER_PAY_VNPAY(orderId),
        payload ?? {},
      );
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status as number | undefined;
      const hasReturnUrl =
        typeof payload?.return_url === "string" &&
        payload.return_url.length > 0;
      const isLikelyUnsupportedContract =
        hasReturnUrl &&
        status != null &&
        [400, 404, 405, 415, 422].includes(status);

      if (!isLikelyUnsupportedContract) {
        throw error;
      }

      const fallbackResponse = await client.post<VnpayPaymentUrlResponse>(
        Endpoints.ORDER_PAY_VNPAY(orderId),
        {},
      );
      return fallbackResponse.data;
    }
  },

  /**
   * Xác minh callback VNPAY ngay sau redirect từ return_url.
   * POST /api/my-orders/{id}/verify-vnpay/
   */
  verifyVnpayPayment: async (
    orderId: string | number,
    payload: VerifyVnpayPaymentPayload,
  ): Promise<VerifyVnpayPaymentResponse> => {
    const endpoint = Endpoints.ORDER_VERIFY_VNPAY(orderId);
    const requestUrl = getAbsoluteApiUrl(endpoint);

    console.groupCollapsed(`[VNPAY][verify] POST ${endpoint}`);
    console.log("orderId:", orderId);
    console.log("absoluteUrl:", requestUrl);
    console.log("payload:", payload);

    try {
      const response = await client.post<VerifyVnpayPaymentResponse>(
        endpoint,
        payload,
      );

      console.log("status:", response.status);
      console.log("response:", response.data);
      console.groupEnd();
      return response.data;
    } catch (error: any) {
      console.error("status:", error?.response?.status ?? "NO_STATUS");
      console.error("response:", error?.response?.data ?? null);
      console.error("message:", error?.message ?? "Unknown verify-vnpay error");
      console.groupEnd();
      throw error;
    }
  },

  /**
   * Hủy đơn hàng (chỉ khi trạng thái là PENDING)
   * POST /api/orders/{id}/cancel/
   */
  cancelOrder: async (orderId: string): Promise<CancelOrderResponse> => {
    const response = await client.post<CancelOrderResponse>(
      Endpoints.ORDER_CANCEL(orderId),
      {},
    );
    return response.data;
  },

  /**
   * Cập nhật trạng thái đơn hàng cho staff/admin
   * PATCH /api/staff/orders/{id}/delivery-status/
   */
  updateOrderStatus: async (
    orderId: string,
    payload: UpdateOrderStatusPayload,
  ): Promise<UpdateOrderStatusResponse> => {
    const response = await client.patch<UpdateOrderStatusResponse>(
      Endpoints.ORDER_UPDATE_STATUS(orderId),
      payload,
    );
    return response.data;
  },
};
