import { create } from "zustand";
import { orderService } from "../services/order.service";
import type {
    CancelOrderResponse,
    CreateOrderPayload,
    OrderResponse,
    VoucherApiError,
    VoucherErrorCode,
} from "../types";

// ============================================================
// Error parser
// ============================================================
export interface OrderStockConflict {
  availableStock: number | null;
  rawMessage: string;
}

export interface ParsedOrderError {
  title: string;
  message: string;
  type:
    | "cart_empty"
    | "out_of_stock"
    | "auth"
    | "network"
    | "voucher"
    | "unknown";
  stockConflict?: OrderStockConflict;
  voucherErrorCode?: VoucherErrorCode;
}

const extractAvailableStock = (message: string): number | null => {
  const normalizedMessage = String(message || "");
  const patterns = [
    /chỉ\s*còn\s*(\d+)\s*sản\s*phẩm/i,
    /chi\s*con\s*(\d+)\s*san\s*pham/i,
    /còn\s*(\d+)\s*sản\s*phẩm/i,
    /ton\s*kho\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const matched = normalizedMessage.match(pattern);
    if (matched?.[1]) {
      const value = Number(matched[1]);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
};

const getVoucherErrorMessage = (data: VoucherApiError): string => {
  const errorCode = data?.error_code;

  switch (errorCode) {
    case "VOUCHER_NOT_FOUND":
      return "Mã khuyến mãi không hợp lệ hoặc đã ngừng hoạt động.";
    case "VOUCHER_NOT_STARTED":
      return "Mã khuyến mãi chưa đến thời gian sử dụng.";
    case "VOUCHER_EXPIRED":
      return "Mã khuyến mãi đã hết hạn.";
    case "INSUFFICIENT_ORDER_AMOUNT":
      return "Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã.";
    case "VOUCHER_MAX_USAGE_REACHED":
      return "Mã khuyến mãi đã hết lượt sử dụng.";
    case "VOUCHER_USER_LIMIT_REACHED":
      return "Bạn đã sử dụng mã khuyến mãi này trước đó.";
    case "INVALID_SUBTOTAL":
      return "Giỏ hàng không hợp lệ. Vui lòng kiểm tra lại sản phẩm trong giỏ.";
    default:
      return String(
        data?.message ||
          data?.error ||
          data?.detail ||
          "Không thể áp dụng mã khuyến mãi.",
      );
  }
};

export const parseOrderError = (error: unknown): ParsedOrderError => {
  const axiosError = error as any;
  const status = axiosError?.response?.status;
  const data = axiosError?.response?.data as VoucherApiError & {
    error?: string;
  };

  // 401 — Chưa đăng nhập / token hết hạn
  if (status === 401) {
    return {
      title: "Phiên đăng nhập hết hạn",
      message: "Vui lòng đăng nhập lại để tiếp tục đặt hàng.",
      type: "auth",
    };
  }

  if (status === 429) {
    return {
      title: "Thao tác quá nhanh",
      message: "Bạn thử quá nhanh, vui lòng chờ 1 phút rồi thử lại.",
      type: "voucher",
    };
  }

  // 403 — Không có quyền đặt hàng / bị backend chặn theo role
  if (status === 403) {
    const permissionMessage =
      String(data?.detail || data?.error || "") ||
      "Tài khoản hiện tại không có quyền đặt hàng.";

    return {
      title: "Không có quyền đặt hàng",
      message: permissionMessage,
      type: "unknown",
    };
  }

  if (status === 400 && data?.error_code) {
    return {
      title: "Mã khuyến mãi chưa hợp lệ",
      message: getVoucherErrorMessage(data),
      type: "voucher",
      voucherErrorCode: data.error_code,
    };
  }

  // 400 — Backend trả lỗi cụ thể
  if (status === 400 && data?.error) {
    const errorMsg = String(data.error);

    if (errorMsg.includes("Giỏ hàng trống")) {
      return {
        title: "Giỏ hàng trống",
        message: "Giỏ hàng của bạn không có sản phẩm nào để đặt hàng.",
        type: "cart_empty",
      };
    }

    if (errorMsg.includes("Không đủ hàng")) {
      return {
        title: "Không đủ hàng",
        message: errorMsg,
        type: "out_of_stock",
        stockConflict: {
          availableStock: extractAvailableStock(errorMsg),
          rawMessage: errorMsg,
        },
      };
    }

    return {
      title: "Lỗi đặt hàng",
      message: errorMsg,
      type: "unknown",
    };
  }

  // Network error
  if (axiosError?.code === "ERR_NETWORK" || !axiosError?.response) {
    return {
      title: "Lỗi kết nối",
      message:
        "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.",
      type: "network",
    };
  }

  return {
    title: "Lỗi không xác định",
    message: "Đã xảy ra lỗi khi đặt hàng. Vui lòng thử lại.",
    type: "unknown",
  };
};

// ============================================================
// Order Store
// ============================================================
interface OrderState {
  // Create order
  isSubmitting: boolean;
  submitError: string | null;
  lastOrder: OrderResponse | null;

  // Order list
  orders: OrderResponse[];
  isLoadingOrders: boolean;
  ordersError: string | null;

  // Cancel order
  isCancelling: boolean;

  // Actions
  createOrder: (payload: CreateOrderPayload) => Promise<OrderResponse>;
  fetchOrders: () => Promise<void>;
  cancelOrder: (orderId: string) => Promise<CancelOrderResponse>;
  clearLastOrder: () => void;
  clearSubmitError: () => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  isSubmitting: false,
  submitError: null,
  lastOrder: null,

  orders: [],
  isLoadingOrders: false,
  ordersError: null,

  isCancelling: false,

  createOrder: async (payload: CreateOrderPayload) => {
    set({ isSubmitting: true, submitError: null });

    try {
      const order = await orderService.createOrder(payload);

      set({
        isSubmitting: false,
        submitError: null,
        lastOrder: order,
      });

      return order;
    } catch (error) {
      const parsed = parseOrderError(error);

      set({
        isSubmitting: false,
        submitError: parsed.message,
      });

      throw error;
    }
  },

  fetchOrders: async () => {
    set({ isLoadingOrders: true, ordersError: null });

    try {
      const orders = await orderService.getOrders();
      set({ orders, isLoadingOrders: false, ordersError: null });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không thể tải danh sách đơn hàng.";
      set({ isLoadingOrders: false, ordersError: message });
    }
  },

  cancelOrder: async (orderId: string) => {
    set({ isCancelling: true });

    try {
      const cancelResult = await orderService.cancelOrder(orderId);

      const currentOrders = get().orders;
      const updatedOrders = currentOrders.map((o) =>
        String(o.id) === orderId
          ? { ...o, status: "CANCELLED", updated_at: new Date().toISOString() }
          : o,
      );

      set({ isCancelling: false, orders: updatedOrders });
      return cancelResult;
    } catch (error) {
      set({ isCancelling: false });
      throw error;
    }
  },

  clearLastOrder: () => set({ lastOrder: null }),
  clearSubmitError: () => set({ submitError: null }),
}));
