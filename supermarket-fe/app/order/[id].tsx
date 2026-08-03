import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { orderService } from "../../src/services/order.service";
import { productService } from "../../src/services/product.service";
import { reviewService } from "../../src/services/review.service";
import { useAuthStore } from "../../src/store/auth.store";
import { useOrderStore } from "../../src/store/order.store";
import type { ProductReview } from "../../src/types";
import type { OrderItemAPI, OrderResponse } from "../../src/types/order.type";
import {
    findReviewByCurrentUser,
    formatCurrency,
    formatDateTime,
    printHtmlContent,
} from "../../src/utils";

// ============================================================
// Status mapping — Trạng thái đơn hàng
// ============================================================
type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "SHIPPING"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

interface StatusInfo {
  label: string;
  color: string;
  bgColor: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const STATUS_MAP: Record<string, StatusInfo> = {
  PENDING: {
    label: "Chờ xác nhận",
    color: "#F59E0B",
    bgColor: "#FEF3C7",
    icon: "time-outline",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    color: "#3B82F6",
    bgColor: "#DBEAFE",
    icon: "checkmark-circle-outline",
  },
  SHIPPING: {
    label: "Đang giao hàng",
    color: "#F97316",
    bgColor: "#FFF7ED",
    icon: "bicycle-outline",
  },
  DELIVERED: {
    label: "Đã giao hàng",
    color: "#22C55E",
    bgColor: "#DCFCE7",
    icon: "checkmark-done-circle-outline",
  },
  COMPLETED: {
    label: "Hoàn thành",
    color: "#22C55E",
    bgColor: "#DCFCE7",
    icon: "checkmark-done-circle-outline",
  },
  CANCELLED: {
    label: "Đã hủy",
    color: "#EF4444",
    bgColor: "#FEE2E2",
    icon: "close-circle-outline",
  },
};

const getStatusInfo = (status: string): StatusInfo => {
  const upperStatus = status.toUpperCase().trim();
  // Đồng nhất chung DELIVERED và COMPLETED
  if (upperStatus === "DELIVERED") return STATUS_MAP.COMPLETED;
  return STATUS_MAP[upperStatus] ?? STATUS_MAP.PENDING;
};

// ============================================================
// Progress Steps — Tiến trình đơn hàng
// ============================================================
const ORDER_STEPS: { key: OrderStatus; label: string }[] = [
  { key: "PENDING", label: "Đặt hàng" },
  { key: "CONFIRMED", label: "Xác nhận" },
  { key: "SHIPPING", label: "Giao hàng" },
  { key: "COMPLETED", label: "Hoàn thành" },
];

const getStepIndex = (status: string): number => {
  const upperStatus = status.toUpperCase().trim();
  if (upperStatus === "CANCELLED") return -1;
  const normalized = upperStatus === "DELIVERED" ? "COMPLETED" : upperStatus;
  const idx = ORDER_STEPS.findIndex((s) => s.key === normalized);
  return idx >= 0 ? idx : 0;
};

const NEXT_STATUS_OPTIONS: Record<string, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPING", "CANCELLED"],
  SHIPPING: ["COMPLETED"],
};

// ============================================================
// Danh sách lý do hủy đơn hàng
// ============================================================
const CANCEL_REASONS = [
  "Tôi muốn thay đổi sản phẩm trong đơn hàng",
  "Tôi muốn thay đổi địa chỉ nhận hàng",
  "Tôi tìm thấy giá rẻ hơn ở nơi khác",
  "Tôi không có nhu cầu mua nữa",
  "Thời gian giao hàng quá lâu",
  "Lý do khác",
];

// ============================================================
// Main Component
// ============================================================
export default function OrderDetailScreen() {
  const router = useRouter();
  const { id, scope } = useLocalSearchParams<{ id: string; scope?: string }>();

  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const userRole = (user as any)?.role?.toLowerCase?.() ?? "customer";
  const isStaffOrAdmin = userRole === "staff" || userRole === "admin";

  // Scope: "manage" = staff đang quản lý, mặc định "mine" = cá nhân
  const shouldUseManagementScope = scope === "manage" && isStaffOrAdmin;
  const canCancelOwnOrder = !shouldUseManagementScope;

  // Cancel order
  const cancelOrder = useOrderStore((state) => state.cancelOrder);
  const isCancelling = useOrderStore((state) => state.isCancelling);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [cancelSuccessMessage, setCancelSuccessMessage] = useState<
    string | null
  >(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Management status update state
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>("PENDING");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusSuccessMessage, setStatusSuccessMessage] = useState<
    string | null
  >(null);
  const [statusErrorMessage, setStatusErrorMessage] = useState<string | null>(
    null,
  );
  const [reviewStatusByProduct, setReviewStatusByProduct] = useState<
    Record<number, boolean>
  >({});

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      // scope=manage → staff/admin dùng /api/orders/{id}/
      // scope=mine hoặc mặc định → dùng /api/my-orders/{id}/ (cá nhân)
      const data = shouldUseManagementScope
        ? await orderService.getOrderDetail(id)
        : await orderService.getMyOrderDetail(id);
      setOrder(data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? err?.message ?? "Không thể tải đơn hàng";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id, shouldUseManagementScope]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  /** Mở modal chọn lý do hủy */
  const handleOpenCancelModal = () => {
    setSelectedReason(null);
    setCancelError(null);
    setCancelSuccessMessage(null);
    setShowCancelModal(true);
  };

  /** Đóng modal */
  const handleCloseCancelModal = () => {
    setShowCancelModal(false);
    setSelectedReason(null);
    setCancelError(null);
    setCancelSuccessMessage(null);
  };

  /** Xác nhận hủy đơn hàng */
  const handleConfirmCancel = async () => {
    if (!selectedReason || !order) return;
    try {
      setCancelError(null);
      const cancelResult = await cancelOrder(String(order.id));
      setOrder({
        ...order,
        status: "CANCELLED",
        updated_at: new Date().toISOString(),
      });
      setSelectedReason(null);
      setCancelSuccessMessage(
        cancelResult.message ||
          `Đã hủy thành công đơn hàng ${order.order_code}. Tiền và hàng đã về đúng vị trí.`,
      );
    } catch (err: any) {
      const status = err?.response?.status;

      // 409 Conflict — đơn hàng đã chuyển trạng thái, không thể hủy
      if (status === 409) {
        setCancelError(
          "Trạng thái đơn hàng đã thay đổi, không thể hủy lúc này! Vui lòng tải lại trang.",
        );
        // Tải lại chi tiết đơn để cập nhật trạng thái mới nhất
        fetchOrder();
      } else {
        const msg =
          err?.response?.data?.error ??
          err?.response?.data?.detail ??
          err?.message ??
          "Không thể hủy đơn hàng. Vui lòng thử lại.";
        setCancelError(msg);
      }
      setCancelSuccessMessage(null);
    }
  };

  // Sync selectedStatus khi order thay đổi
  useEffect(() => {
    if (order?.status) {
      setSelectedStatus(order.status.toUpperCase() as OrderStatus);
    }
    setStatusSuccessMessage(null);
    setStatusErrorMessage(null);
  }, [order?.status]);

  const availableStatusOptions = useMemo(() => {
    if (!order) return [];
    const currentUpper = order.status.toUpperCase();
    return NEXT_STATUS_OPTIONS[currentUpper] ?? [];
  }, [order]);

  const reviewableItems = useMemo(
    () =>
      order
        ? Array.from(
            new Map(
              order.items
                .filter(
                  (item) =>
                    typeof item.product === "number" && item.product > 0,
                )
                .map((item) => [item.product, item] as const),
            ).values(),
          )
        : [],
    [order],
  );

  useEffect(() => {
    if (!order) {
      setReviewStatusByProduct({});
      return;
    }

    const normalizedStatus = order.status.toUpperCase().trim();
    const canReviewOrder =
      (normalizedStatus === "COMPLETED" || normalizedStatus === "DELIVERED") &&
      !shouldUseManagementScope;

    if (!canReviewOrder || reviewableItems.length === 0) {
      setReviewStatusByProduct({});
      return;
    }

    let isMounted = true;

    const fetchReviewStatus = async () => {
      try {
        const reviewEntries = await Promise.all(
          reviewableItems.map(async (item) => {
            const reviews = await reviewService.getByProduct(item.product);
            const myReview = findReviewByCurrentUser(
              reviews as ProductReview[],
              user,
              profile,
            );

            return [item.product, Boolean(myReview)] as const;
          }),
        );

        if (!isMounted) {
          return;
        }

        setReviewStatusByProduct(Object.fromEntries(reviewEntries));
      } catch (reviewError) {
        if (!isMounted) {
          return;
        }

        console.log("Lỗi tải trạng thái đánh giá đơn hàng:", reviewError);
        setReviewStatusByProduct({});
      }
    };

    void fetchReviewStatus();

    return () => {
      isMounted = false;
    };
  }, [order, profile, reviewableItems, shouldUseManagementScope, user]);

  const canSubmitStatusUpdate =
    !isUpdatingStatus &&
    selectedStatus !== order?.status?.toUpperCase() &&
    availableStatusOptions.includes(selectedStatus);

  /** Staff/Admin cập nhật trạng thái đơn hàng */
  const handleUpdateStatus = async () => {
    if (!order || !canSubmitStatusUpdate) return;
    setIsUpdatingStatus(true);
    setStatusSuccessMessage(null);
    setStatusErrorMessage(null);
    try {
      const response = await orderService.updateOrderStatus(String(order.id), {
        status: selectedStatus,
      });
      setStatusSuccessMessage(
        response.message ||
          `Đã cập nhật đơn ${order.order_code} sang trạng thái ${selectedStatus}.`,
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        "Không thể cập nhật trạng thái đơn hàng.";
      setStatusErrorMessage(msg);
    } finally {
      setIsUpdatingStatus(false);
      fetchOrder();
    }
  };

  /** Tạo HTML phiếu đơn hàng */
  const buildInvoiceHtml = () => {
    if (!order) return "";

    const subtotal = order.total_amount - (order.shipping_fee || 0);
    const shippingFee = order.shipping_fee || 0;
    const completedDate =
      order.updated_at && formatDateTime(order.updated_at) !== "---"
        ? formatDateTime(order.updated_at)
        : formatDateTime(new Date().toISOString());
    const handler = profile?.name || user?.username || "Nhân viên";

    const productRows = order.items
      .map(
        (item, index) => `
      <tr>
        <td class="col-stt">${index + 1}</td>
        <td class="col-name">${item.product_name_snapshot || `SP #${item.product}`}</td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-price">${formatCurrency(item.unit_price)}</td>
        <td class="col-total">${formatCurrency(item.subtotal)}</td>
      </tr>`,
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phiếu đơn hàng ${order.order_code}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm 12mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #1a1a1a;
      font-size: 13px;
      line-height: 1.5;
      padding: 0;
      background: #fff;
    }
    .invoice {
      max-width: 680px;
      margin: 0 auto;
      padding: 24px 20px;
      border: 2px solid #333;
    }

    /* ── Header ── */
    .inv-header {
      text-align: center;
      padding-bottom: 16px;
      border-bottom: 2px solid #333;
      margin-bottom: 16px;
    }
    .inv-header h1 {
      font-size: 22px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 4px;
    }
    .inv-header .sub {
      font-size: 12px;
      color: #555;
    }

    /* ── Meta info ── */
    .inv-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0;
      margin-bottom: 16px;
    }
    .inv-meta .col {
      flex: 1 1 50%;
      min-width: 200px;
    }
    .inv-meta .row {
      margin-bottom: 5px;
      font-size: 13px;
    }
    .inv-meta .row b {
      display: inline-block;
      min-width: 120px;
      color: #333;
    }

    /* ── Section title ── */
    .section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #ccc;
      letter-spacing: 1px;
    }

    /* ── Customer ── */
    .inv-customer {
      margin-bottom: 16px;
      padding: 10px 14px;
      background: #f8f8f8;
      border-radius: 4px;
    }
    .inv-customer .row {
      margin-bottom: 4px;
      font-size: 13px;
    }
    .inv-customer .row b {
      display: inline-block;
      min-width: 80px;
    }

    /* ── Table ── */
    .inv-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .inv-table thead th {
      background: #222;
      color: #fff;
      padding: 8px 6px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .inv-table tbody td {
      padding: 7px 6px;
      border-bottom: 1px solid #e0e0e0;
      vertical-align: top;
    }
    .inv-table tbody tr:last-child td {
      border-bottom: 2px solid #333;
    }
    .col-stt   { width: 36px; text-align: center; }
    .col-name  { }
    .col-qty   { width: 36px; text-align: center; }
    .col-price { width: 90px; text-align: right; }
    .col-total { width: 100px; text-align: right; }
    th.col-stt,
    th.col-qty   { text-align: center; }
    th.col-price,
    th.col-total { text-align: right; }

    /* ── Summary ── */
    .inv-summary {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 20px;
    }
    .inv-summary table {
      border-collapse: collapse;
      font-size: 13px;
    }
    .inv-summary td {
      padding: 4px 0;
    }
    .inv-summary .lbl {
      text-align: right;
      padding-right: 16px;
      color: #555;
      font-weight: 600;
    }
    .inv-summary .val {
      text-align: right;
      min-width: 100px;
    }
    .inv-summary .total-row .lbl {
      font-size: 15px;
      color: #000;
      font-weight: 700;
    }
    .inv-summary .total-row .val {
      font-size: 15px;
      font-weight: 700;
      color: #c0392b;
    }

    /* ── Sign ── */
    .inv-sign {
      display: flex;
      justify-content: space-between;
      margin-top: 50px;
      page-break-inside: avoid;
    }
    .inv-sign .box {
      width: 45%;
      text-align: center;
    }
    .inv-sign .box .title {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .inv-sign .box .hint {
      font-size: 11px;
      color: #888;
      font-style: italic;
    }

    /* ── Footer ── */
    .inv-footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px dashed #aaa;
      font-size: 12px;
      color: #888;
      font-style: italic;
    }

    /* ── Print ── */
    @media print {
      body { padding: 0; }
      .invoice { border: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="inv-header">
      <h1>Phiếu đơn hàng</h1>
      <div class="sub">${order.order_code}</div>
    </div>

    <div class="inv-meta">
      <div class="col">
        <div class="row"><b>Mã đơn:</b> ${order.order_code}</div>
        <div class="row"><b>Ngày tạo:</b> ${formatDateTime(order.created_at)}</div>
      </div>
      <div class="col">
        <div class="row"><b>Ngày hoàn thành:</b> ${completedDate}</div>
        <div class="row"><b>Người xử lý:</b> ${handler}</div>
      </div>
    </div>

    <div class="section-title">Thông tin khách hàng</div>
    <div class="inv-customer">
      <div class="row"><b>Họ tên:</b> ${order.receiver_name}</div>
      <div class="row"><b>SĐT:</b> ${order.receiver_phone}</div>
      <div class="row"><b>Địa chỉ:</b> ${order.address_text}</div>
      ${order.note ? `<div class="row"><b>Ghi chú:</b> ${order.note}</div>` : ""}
    </div>

    <div class="section-title">Danh sách sản phẩm</div>
    <table class="inv-table">
      <thead>
        <tr>
          <th class="col-stt">STT</th>
          <th class="col-name">Tên sản phẩm</th>
          <th class="col-qty">SL</th>
          <th class="col-price">Đơn giá</th>
          <th class="col-total">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${productRows}
      </tbody>
    </table>

    <div class="inv-summary">
      <table>
        <tr>
          <td class="lbl">Tạm tính:</td>
          <td class="val">${formatCurrency(subtotal)}</td>
        </tr>
        <tr>
          <td class="lbl">Phí vận chuyển:</td>
          <td class="val">${formatCurrency(shippingFee)}</td>
        </tr>
        <tr class="total-row">
          <td class="lbl">Tổng thanh toán:</td>
          <td class="val">${formatCurrency(order.total_amount)}</td>
        </tr>
      </table>
    </div>

    <div class="inv-sign">
      <div class="box">
        <div class="title">Ký nhận khách hàng</div>
        <div class="hint">(Ký, ghi rõ họ tên)</div>
      </div>
      <div class="box">
        <div class="title">Ký nhận nhân viên</div>
        <div class="hint">(Ký, ghi rõ họ tên)</div>
      </div>
    </div>

    <div class="inv-footer">Cảm ơn quý khách đã mua sắm!</div>
  </div>
</body>
</html>`;
  };

  /** In/Xuất phiếu đơn hàng — đồng nhất Web & Mobile */
  const handlePrintOrder = async () => {
    if (!order) return;
    const html = buildInvoiceHtml();

    if (!html) {
      return;
    }

    await printHtmlContent(html);
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Chi tiết đơn hàng" showBack />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải đơn hàng...</Text>
        </View>
      </View>
    );
  }

  // ── Error ──
  if (error || !order) {
    return (
      <View style={styles.container}>
        <AppHeader title="Chi tiết đơn hàng" showBack />
        <View style={styles.centerWrap}>
          <Ionicons
            name="alert-circle-outline"
            size={56}
            color={Colors.error}
          />
          <Text style={styles.errorText}>
            {error ?? "Đơn hàng không tồn tại"}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchOrder}>
            <Ionicons name="refresh" size={18} color={Colors.white} />
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const statusInfo = getStatusInfo(order.status);
  const currentStep = getStepIndex(order.status);
  const isCancelled = order.status.toUpperCase() === "CANCELLED";
  const isPending = order.status.toUpperCase() === "PENDING";
  const isCompleted =
    order.status.toUpperCase() === "COMPLETED" ||
    order.status.toUpperCase() === "DELIVERED";
  const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const canReviewProducts = isCompleted && !shouldUseManagementScope;

  return (
    <View style={styles.container}>
      <AppHeader title="Chi tiết đơn hàng" showBack />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ============ STATUS BANNER ============ */}
        <View
          style={[styles.statusBanner, { backgroundColor: statusInfo.bgColor }]}
        >
          <View
            style={[
              styles.statusIconWrap,
              { backgroundColor: statusInfo.color },
            ]}
          >
            <Ionicons name={statusInfo.icon} size={26} color={Colors.white} />
          </View>
          <View style={styles.statusInfoWrap}>
            <Text style={[styles.statusLabel, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
            <Text style={styles.statusDate}>
              {formatDateTime(order.created_at)}
            </Text>
          </View>
        </View>

        {/* ============ PROGRESS STEPS ============ */}
        {!isCancelled && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tiến trình đơn hàng</Text>
            <View style={styles.progressRow}>
              {ORDER_STEPS.map((step, idx) => {
                const isActive = idx <= currentStep;
                const isLast = idx === ORDER_STEPS.length - 1;
                return (
                  <View key={step.key} style={styles.progressStepWrap}>
                    <View style={styles.progressDotRow}>
                      {!isLast && (
                        <View
                          style={[
                            styles.progressLine,
                            isActive &&
                              idx < currentStep && {
                                backgroundColor: Colors.primary,
                              },
                          ]}
                        />
                      )}
                      <View
                        style={[
                          styles.progressDot,
                          isActive && {
                            backgroundColor: Colors.primary,
                            borderColor: Colors.primary,
                          },
                        ]}
                      >
                        {isActive && (
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color={Colors.white}
                          />
                        )}
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.progressLabel,
                        isActive && {
                          color: Colors.primary,
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ============ CẬP NHẬT TRẠNG THÁI (Staff/Admin) ============ */}
        {shouldUseManagementScope && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name="swap-horizontal-outline"
                size={20}
                color={Colors.primary}
              />
              <Text style={styles.sectionTitle}>Cập nhật trạng thái</Text>
            </View>

            <Text style={styles.manageOrderHint}>
              Chỉ các chuyển trạng thái hợp lệ mới được backend chấp nhận.
            </Text>

            {availableStatusOptions.length > 0 ? (
              <View style={styles.statusOptionList}>
                {availableStatusOptions.map((status) => {
                  const active = selectedStatus === status;
                  const info = getStatusInfo(status);

                  return (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusOption,
                        active && styles.statusOptionActive,
                      ]}
                      onPress={() => {
                        setSelectedStatus(status);
                        setStatusErrorMessage(null);
                      }}
                      activeOpacity={0.85}
                    >
                      <View
                        style={[
                          styles.statusOptionDot,
                          {
                            backgroundColor: active
                              ? info.color
                              : Colors.border,
                          },
                          active && styles.statusOptionDotActive,
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusOptionText,
                          active && styles.statusOptionTextActive,
                        ]}
                      >
                        {info.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.manageOrderHint}>
                Đơn hàng này đã ở trạng thái cuối hoặc không còn nhánh chuyển
                tiếp hợp lệ.
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.updateStatusBtn,
                !canSubmitStatusUpdate && styles.updateStatusBtnDisabled,
              ]}
              onPress={handleUpdateStatus}
              disabled={!canSubmitStatusUpdate}
              activeOpacity={0.85}
            >
              {isUpdatingStatus ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={Colors.white}
                  />
                  <Text style={styles.updateStatusBtnText}>
                    Cập nhật trạng thái
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {isCompleted && (
              <TouchableOpacity
                style={[
                  styles.updateStatusBtn,
                  { marginTop: 12, backgroundColor: "#0284c7" },
                ]}
                onPress={handlePrintOrder}
                activeOpacity={0.85}
              >
                <Ionicons name="print-outline" size={18} color={Colors.white} />
                <Text style={styles.updateStatusBtnText}>
                  In / Xuất phiếu đơn hàng
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {statusSuccessMessage ? (
          <View style={styles.statusSuccessBanner}>
            <View style={styles.statusSuccessIconWrap}>
              <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
            </View>
            <Text style={styles.statusSuccessTitle}>Cập nhật thành công</Text>
            <Text style={styles.statusSuccessMsg}>{statusSuccessMessage}</Text>
          </View>
        ) : null}

        {statusErrorMessage ? (
          <View style={styles.statusErrorBanner}>
            <View style={styles.statusErrorIconWrap}>
              <Ionicons name="close-circle" size={40} color="#EF4444" />
            </View>
            <Text style={styles.statusErrorTitle}>
              Không thể cập nhật trạng thái
            </Text>
            <Text style={styles.statusErrorMsg}>{statusErrorMessage}</Text>
          </View>
        ) : null}

        {/* ============ MÃ ĐƠN HÀNG ============ */}
        <View style={styles.card}>
          <View style={styles.orderCodeRow}>
            <View style={styles.orderCodeLeft}>
              <Ionicons
                name="receipt-outline"
                size={20}
                color={Colors.primary}
              />
              <Text style={styles.orderCodeLabel}>Mã đơn hàng</Text>
            </View>
            <Text style={styles.orderCodeValue}>{order.order_code}</Text>
          </View>
        </View>

        {/* ============ ĐỊA CHỈ GIAO HÀNG ============ */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name="location-outline"
              size={20}
              color={Colors.primary}
            />
            <Text style={styles.sectionTitle}>Địa chỉ giao hàng</Text>
          </View>
          <View style={styles.addressContent}>
            <View style={styles.addressRow}>
              <Ionicons
                name="person-outline"
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.addressName}>{order.receiver_name}</Text>
            </View>
            <View style={styles.addressRow}>
              <Ionicons
                name="call-outline"
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.addressPhone}>{order.receiver_phone}</Text>
            </View>
            <View style={styles.addressRow}>
              <Ionicons
                name="navigate-outline"
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.addressText}>{order.address_text}</Text>
            </View>
            {order.distance_km != null && order.distance_km > 0 && (
              <View style={styles.distanceBadge}>
                <Ionicons
                  name="speedometer-outline"
                  size={14}
                  color={Colors.primary}
                />
                <Text style={styles.distanceText}>
                  Khoảng cách: {order.distance_km.toFixed(1)} km
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ============ DANH SÁCH SẢN PHẨM ============ */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="cart-outline" size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Sản phẩm ({totalItems} món)</Text>
          </View>

          {order.items.map((item, idx) => (
            <OrderItemRow
              key={item.id}
              item={item}
              isLast={idx === order.items.length - 1}
            />
          ))}
        </View>

        {/* ============ ĐÁNH GIÁ SẢN PHẨM ============ */}
        {canReviewProducts && reviewableItems.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="star-outline" size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Đánh giá sản phẩm</Text>
            </View>
            <Text style={styles.reviewSectionHint}>
              Đơn hàng đã hoàn thành. Chọn sản phẩm để đi tới trang đánh giá.
            </Text>

            {reviewableItems.map((item, index) => (
              <View
                key={`review-item-${item.product}`}
                style={[
                  styles.reviewProductRow,
                  index < reviewableItems.length - 1 && styles.itemRowBorder,
                ]}
              >
                <View style={styles.reviewProductInfo}>
                  <Text style={styles.reviewProductName} numberOfLines={2}>
                    {item.product_name_snapshot}
                  </Text>
                  <Text style={styles.reviewProductMeta}>
                    Số lượng đã mua: x{item.quantity}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.reviewProductButton}
                  onPress={() => {
                    const hasReviewed = Boolean(
                      reviewStatusByProduct[item.product],
                    );

                    if (hasReviewed) {
                      router.push({
                        pathname: "/product/[id]",
                        params: {
                          id: String(item.product),
                          review: "view",
                        },
                      } as any);
                      return;
                    }

                    router.push({
                      pathname: "/review/[id]",
                      params: {
                        id: String(item.product),
                        quantity: String(item.quantity),
                        orderId: String(order.id),
                      },
                    } as any);
                  }}
                  activeOpacity={0.82}
                >
                  <Ionicons
                    name={
                      reviewStatusByProduct[item.product]
                        ? "eye-outline"
                        : "create-outline"
                    }
                    size={16}
                    color={Colors.white}
                  />
                  <Text style={styles.reviewProductButtonText}>
                    {reviewStatusByProduct[item.product]
                      ? "Xem đánh giá"
                      : "Đánh giá"}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {/* ============ TỔNG TIỀN ============ */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="wallet-outline" size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Chi tiết thanh toán</Text>
          </View>

          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Tạm tính</Text>
            <Text style={styles.paymentValue}>
              {formatCurrency(order.subtotal)}
            </Text>
          </View>

          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Phí vận chuyển</Text>
            <Text style={styles.paymentValue}>
              {formatCurrency(order.shipping_fee)}
            </Text>
          </View>

          <View style={styles.paymentDivider} />

          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabelTotal}>Tổng thanh toán</Text>
            <Text style={styles.paymentValueTotal}>
              {formatCurrency(order.total_amount)}
            </Text>
          </View>

          {/* Payment method */}
          <View style={styles.paymentMethodWrap}>
            <Ionicons
              name={
                order.payment_method === "VNPAY"
                  ? "card-outline"
                  : "cash-outline"
              }
              size={16}
              color={Colors.primary}
            />
            <Text style={styles.paymentMethodText}>
              {order.payment_method === "VNPAY"
                ? "Thanh toán VNPAY"
                : "Thanh toán khi nhận hàng (COD)"}
            </Text>
          </View>
        </View>

        {/* ============ THÔNG TIN THÊM ============ */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={Colors.primary}
            />
            <Text style={styles.sectionTitle}>Thông tin đơn hàng</Text>
          </View>
          <InfoRow label="Ngày đặt" value={formatDateTime(order.created_at)} />
          {order.updated_at && formatDateTime(order.updated_at) !== "---" && (
            <InfoRow
              label="Cập nhật lần cuối"
              value={formatDateTime(order.updated_at)}
            />
          )}
          {order.note ? <InfoRow label="Ghi chú" value={order.note} /> : null}
          <InfoRow label="Mã đơn" value={order.order_code} />
        </View>

        {/* ============ NÚT HỦY ĐƠN HÀNG (chỉ khi PENDING ở luồng cá nhân) ============ */}
        {canCancelOwnOrder && isPending && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleOpenCancelModal}
              activeOpacity={0.8}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={Colors.white}
              />
              <Text style={styles.cancelBtnText}>Hủy đơn hàng</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ============ THÔNG BÁO HỦY THÀNH CÔNG ============ */}
        {cancelSuccessMessage && (
          <View style={styles.cancelSuccessBanner}>
            <View style={styles.cancelSuccessIconWrap}>
              <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
            </View>
            <Text style={styles.cancelSuccessTitle}>Đơn hàng đã được hủy</Text>
            <Text style={styles.cancelSuccessMsg}>{cancelSuccessMessage}</Text>
          </View>
        )}

        {/* ============ THÔNG BÁO LỖI HỦY ============ */}
        {cancelError && (
          <View style={styles.cancelErrorBanner}>
            <View style={styles.cancelErrorIconWrap}>
              <Ionicons name="close-circle" size={40} color="#EF4444" />
            </View>
            <Text style={styles.cancelErrorTitle}>Không thể hủy đơn hàng</Text>
            <Text style={styles.cancelErrorMsg}>{cancelError}</Text>
          </View>
        )}

        {/* Bottom spacer */}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ============ CANCEL REASON MODAL ============ */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="slide"
        onRequestClose={handleCloseCancelModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {cancelSuccessMessage ? (
              <View style={styles.modalSuccessState}>
                <View style={styles.modalSuccessIconWrap}>
                  <Ionicons name="checkmark-circle" size={36} color="#22C55E" />
                </View>
                <Text style={styles.modalSuccessTitle}>
                  Hủy đơn hàng thành công
                </Text>
                <Text style={styles.modalSuccessSubtitle}>
                  {cancelSuccessMessage}
                </Text>

                <TouchableOpacity
                  style={styles.modalBtnSuccess}
                  onPress={handleCloseCancelModal}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="checkmark-done-outline"
                    size={18}
                    color={Colors.white}
                  />
                  <Text style={styles.modalBtnSuccessText}>Đã hiểu</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderIconWrap}>
                    <Ionicons
                      name="warning-outline"
                      size={28}
                      color="#F59E0B"
                    />
                  </View>
                  <Text style={styles.modalTitle}>Hủy đơn hàng</Text>
                  <Text style={styles.modalSubtitle}>
                    Vui lòng cho chúng tôi biết lý do bạn muốn hủy đơn hàng
                  </Text>
                </View>

                {/* Danh sách lý do */}
                <ScrollView
                  style={styles.reasonList}
                  showsVerticalScrollIndicator={false}
                >
                  {CANCEL_REASONS.map((reason) => {
                    const isSelected = selectedReason === reason;
                    return (
                      <TouchableOpacity
                        key={reason}
                        style={[
                          styles.reasonItem,
                          isSelected && styles.reasonItemSelected,
                        ]}
                        onPress={() => setSelectedReason(reason)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.reasonRadio,
                            isSelected && styles.reasonRadioSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.reasonRadioDot} />}
                        </View>
                        <Text
                          style={[
                            styles.reasonText,
                            isSelected && styles.reasonTextSelected,
                          ]}
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Modal Actions */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalBtnBack}
                    onPress={handleCloseCancelModal}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="arrow-back-outline"
                      size={18}
                      color={Colors.primary}
                    />
                    <Text style={styles.modalBtnBackText}>Quay lại</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modalBtnConfirm,
                      !selectedReason && styles.modalBtnDisabled,
                      isCancelling && styles.modalBtnDisabled,
                    ]}
                    onPress={handleConfirmCancel}
                    activeOpacity={0.8}
                    disabled={!selectedReason || isCancelling}
                  >
                    {isCancelling ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          color={Colors.white}
                        />
                        <Text style={styles.modalBtnConfirmText}>
                          Xác nhận hủy
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ============ FOOTER ============ */}
      {!shouldUseManagementScope && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerBtnSecondary}
            onPress={() => router.replace("/(tabs)/orders" as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={18} color={Colors.primary} />
            <Text style={styles.footerBtnSecondaryText}>Đơn hàng của tôi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.footerBtnPrimary}
            onPress={() => router.replace("/(tabs)/home" as any)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="storefront-outline"
              size={18}
              color={Colors.white}
            />
            <Text style={styles.footerBtnPrimaryText}>Tiếp tục mua sắm</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ============================================================
// Sub-components
// ============================================================

/** Một dòng sản phẩm trong đơn hàng */
function OrderItemRow({
  item,
  isLast,
}: {
  item: OrderItemAPI & { product_image?: string };
  isLast: boolean;
}) {
  const [productDetail, setProductDetail] = useState<any>(null);

  useEffect(() => {
    // Tự tải thêm ảnh và chi tiết nếu Backend API chưa gộp sẵn
    if (!item.product_image && item.product) {
      productService
        .getById(item.product)
        .then((res) => setProductDetail(res))
        .catch((err) => console.log("Lỗi tải ảnh Product id.tsx", err));
    }
  }, [item]);

  const displayImage = item.product_image || productDetail?.image;

  return (
    <View style={[styles.itemRow, !isLast && styles.itemRowBorder]}>
      {/* Product Image */}
      <View style={styles.itemImageWrap}>
        {displayImage ? (
          <Image
            source={{ uri: displayImage }}
            style={{ width: 48, height: 48, borderRadius: Radius.md }}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="cube-outline" size={22} color={Colors.textLight} />
        )}
      </View>

      {/* Product info */}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.product_name_snapshot}
        </Text>
        <View style={styles.itemMetaRow}>
          <Text style={styles.itemPrice}>
            {formatCurrency(item.unit_price)}
          </Text>
          <View style={styles.itemQtyBadge}>
            <Text style={styles.itemQtyText}>x{item.quantity}</Text>
          </View>
        </View>
      </View>

      {/* Subtotal */}
      <Text style={styles.itemSubtotal}>{formatCurrency(item.subtotal)}</Text>
    </View>
  );
}

/** Dòng info key-value */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F2F5",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },

  // Center states
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  errorText: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  retryBtnText: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.white,
  },

  // Status banner
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.base,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  statusIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  statusInfoWrap: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  statusLabel: {
    fontSize: FontSize.lg,
    fontWeight: "700",
  },
  statusDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },

  // Management status update
  manageOrderHint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  statusOptionList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  statusOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  statusOptionDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  statusOptionDotActive: {
    ...Shadow.small,
  },
  statusOptionText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  statusOptionTextActive: {
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  updateStatusBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
  },
  updateStatusBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  updateStatusBtnText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },
  statusSuccessBanner: {
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  statusSuccessIconWrap: {
    marginBottom: Spacing.sm,
  },
  statusSuccessTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: "#16A34A",
    marginBottom: 4,
  },
  statusSuccessMsg: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  statusErrorBanner: {
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  statusErrorIconWrap: {
    marginBottom: Spacing.sm,
  },
  statusErrorTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: "#DC2626",
    marginBottom: 4,
  },
  statusErrorMsg: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  // Order code
  orderCodeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderCodeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orderCodeLabel: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  orderCodeValue: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 1,
  },

  // Progress
  progressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: Spacing.sm,
  },
  progressStepWrap: {
    flex: 1,
    alignItems: "center",
  },
  progressDotRow: {
    height: 24,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  progressLine: {
    position: "absolute",
    left: "50%",
    right: "-50%",
    height: 3,
    backgroundColor: Colors.border,
    zIndex: 1,
  },
  progressLabel: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    marginTop: 8,
    textAlign: "center",
  },

  // Address
  addressContent: {
    gap: 8,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addressName: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
    flex: 1,
  },
  addressPhone: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    flex: 1,
  },
  addressText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primarySurface,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginTop: 4,
  },
  distanceText: {
    fontSize: FontSize.sm,
    fontWeight: "500",
    color: Colors.primary,
  },

  // Item row
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  itemImageWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: "#F5F6F5",
    justifyContent: "center",
    alignItems: "center",
  },
  itemInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  itemName: {
    fontSize: FontSize.base,
    fontWeight: "500",
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  itemPrice: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  itemQtyBadge: {
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  itemQtyText: {
    fontSize: FontSize.xs,
    fontWeight: "600",
    color: Colors.primary,
  },
  itemSubtotal: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrice,
    marginLeft: Spacing.sm,
  },

  // Review
  reviewSectionHint: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  reviewProductRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: Spacing.md,
  },
  reviewProductInfo: {
    flex: 1,
  },
  reviewProductName: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  reviewProductMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  reviewProductButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  reviewProductButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.white,
  },

  // Payment
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  paymentLabel: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  paymentValue: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  paymentDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.sm,
  },
  paymentLabelTotal: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  paymentValueTotal: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.primary,
  },
  paymentMethodWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.md,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  paymentMethodText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.primary,
  },

  // Info row
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.textPrimary,
  },

  // Footer
  footer: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    ...Shadow.medium,
  },
  footerBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  footerBtnSecondaryText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.primary,
  },
  footerBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
  },
  footerBtnPrimaryText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.white,
  },

  // Cancel button
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: "#EF4444",
  },
  cancelBtnText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },

  // Cancel success banner
  cancelSuccessBanner: {
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  cancelSuccessIconWrap: {
    marginBottom: Spacing.sm,
  },
  cancelSuccessTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: "#16A34A",
    marginBottom: 4,
  },
  cancelSuccessMsg: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  // Cancel error banner
  cancelErrorBanner: {
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  cancelErrorIconWrap: {
    marginBottom: Spacing.sm,
  },
  cancelErrorTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: "#DC2626",
    marginBottom: 4,
  },
  cancelErrorMsg: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.base,
    maxHeight: "80%",
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  modalHeaderIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  // Reason list
  reasonList: {
    maxHeight: 300,
    marginBottom: Spacing.lg,
  },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
  },
  reasonItemSelected: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  reasonRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  reasonRadioSelected: {
    borderColor: "#EF4444",
  },
  reasonRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#EF4444",
  },
  reasonText: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  reasonTextSelected: {
    fontWeight: "600",
    color: "#DC2626",
  },

  // Modal Actions
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalBtnBack: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  modalBtnBackText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.primary,
  },
  modalBtnConfirm: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: "#EF4444",
  },
  modalBtnConfirmText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },
  modalBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  modalSuccessState: {
    alignItems: "center",
    paddingTop: Spacing.md,
  },
  modalSuccessIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalSuccessTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: "#16A34A",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSuccessSubtitle: {
    fontSize: FontSize.base,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  modalBtnSuccess: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: "#16A34A",
  },
  modalBtnSuccessText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },
});
