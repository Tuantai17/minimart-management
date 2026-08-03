import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { getApiErrorMessage } from "../../src/services/api/api-error";
import { orderService } from "../../src/services/order.service";
import { useAuthStore } from "../../src/store/auth.store";
import { useProfileStore } from "../../src/store/profile.store";
import type { OrderResponse } from "../../src/types/order.type";
import {
    formatCurrency,
    formatDateTime,
    printHtmlContent,
    showMessage,
} from "../../src/utils";

type ProfileRole = "customer" | "staff" | "admin";
type OrderTabKey =
  | "ALL"
  | "PENDING"
  | "CONFIRMED"
  | "SHIPPING"
  | "COMPLETED"
  | "CANCELLED";

type ManageableStatus = Exclude<OrderTabKey, "ALL">;

const ORDER_TABS: { key: OrderTabKey; label: string }[] = [
  { key: "ALL", label: "Tất cả" },
  { key: "PENDING", label: "Chờ xác nhận" },
  { key: "CONFIRMED", label: "Đã xác nhận" },
  { key: "SHIPPING", label: "Đang giao" },
  { key: "COMPLETED", label: "Hoàn thành" },
  { key: "CANCELLED", label: "Đã hủy" },
];

const STATUS_META: Record<
  ManageableStatus,
  {
    label: string;
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  PENDING: {
    label: "Chờ xác nhận",
    color: "#D97706",
    bg: "#FEF3C7",
    icon: "time-outline",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    color: "#2563EB",
    bg: "#DBEAFE",
    icon: "checkmark-circle-outline",
  },
  SHIPPING: {
    label: "Đang giao",
    color: "#EA580C",
    bg: "#FFEDD5",
    icon: "car-outline",
  },
  COMPLETED: {
    label: "Hoàn thành",
    color: "#16A34A",
    bg: "#DCFCE7",
    icon: "bag-check-outline",
  },
  CANCELLED: {
    label: "Đã hủy",
    color: "#DC2626",
    bg: "#FEE2E2",
    icon: "close-circle-outline",
  },
};

const normalizeStatus = (status: string): ManageableStatus => {
  const value = (status || "").toUpperCase().trim();

  if (value === "DELIVERED") {
    return "COMPLETED";
  }

  if (
    value === "PENDING" ||
    value === "CONFIRMED" ||
    value === "SHIPPING" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  ) {
    return value;
  }

  return "PENDING";
};

const parseStatus = (statusParam?: string | string[]): OrderTabKey => {
  const raw = Array.isArray(statusParam) ? statusParam[0] : statusParam;
  const value = (raw || "ALL").toUpperCase().trim();

  if (
    value === "ALL" ||
    value === "PENDING" ||
    value === "CONFIRMED" ||
    value === "SHIPPING" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  ) {
    return value;
  }

  return "ALL";
};

export default function OrderStatusListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; keyword?: string }>();

  const user = useAuthStore((state) => state.user);
  const authRole = useAuthStore((state) => state.role);
  const isStaff = useAuthStore((state) => state.isStaff);
  const isSuperuser = useAuthStore((state) => state.isSuperuser);

  const role: ProfileRole =
    isSuperuser || user?.is_superuser
      ? "admin"
      : isStaff || user?.is_staff
        ? "staff"
        : authRole || "customer";
  const canManageOrders = role === "staff" || role === "admin";

  const initialTab = parseStatus(params.status);
  const initialKeyword = Array.isArray(params.keyword)
    ? params.keyword[0] || ""
    : params.keyword || "";

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<OrderTabKey>(initialTab);
  const [keyword, setKeyword] = useState(initialKeyword);

  // ── Batch print selection (chỉ hiện khi tab === COMPLETED) ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);

  const profile = useProfileStore((state) => state.profile);

  const isCompletedTab = tab === "COMPLETED";

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ── Tạo HTML hóa đơn cho nhiều đơn (mỗi đơn 1 page-break) ──
  const buildBatchInvoiceHtml = (ordersToPrint: OrderResponse[]): string => {
    const handler = profile?.name || user?.username || "Nhân viên";

    const invoicePages = ordersToPrint
      .map((order) => {
        const subtotal = order.total_amount - (order.shipping_fee || 0);
        const shippingFee = order.shipping_fee || 0;
        const completedDate =
          order.updated_at && formatDateTime(order.updated_at) !== "---"
            ? formatDateTime(order.updated_at)
            : formatDateTime(new Date().toISOString());

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

        return `
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
    </div>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>In phiếu đơn hàng (${ordersToPrint.length} đơn)</title>
  <style>
    @page { size: A4; margin: 15mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #1a1a1a; font-size: 13px; line-height: 1.5;
      padding: 0; background: #fff;
    }
    .invoice {
      max-width: 680px; margin: 0 auto; padding: 24px 20px;
      border: 2px solid #333; page-break-after: always;
    }
    .invoice:last-child { page-break-after: auto; }

    .inv-header {
      text-align: center; padding-bottom: 16px;
      border-bottom: 2px solid #333; margin-bottom: 16px;
    }
    .inv-header h1 {
      font-size: 22px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 3px; margin-bottom: 4px;
    }
    .inv-header .sub { font-size: 12px; color: #555; }

    .inv-meta {
      display: flex; flex-wrap: wrap; margin-bottom: 16px;
    }
    .inv-meta .col { flex: 1 1 50%; min-width: 200px; }
    .inv-meta .row { margin-bottom: 5px; font-size: 13px; }
    .inv-meta .row b { display: inline-block; min-width: 120px; color: #333; }

    .section-title {
      font-size: 14px; font-weight: 700; text-transform: uppercase;
      margin-bottom: 8px; padding-bottom: 4px;
      border-bottom: 1px solid #ccc; letter-spacing: 1px;
    }

    .inv-customer {
      margin-bottom: 16px; padding: 10px 14px;
      background: #f8f8f8; border-radius: 4px;
    }
    .inv-customer .row { margin-bottom: 4px; font-size: 13px; }
    .inv-customer .row b { display: inline-block; min-width: 80px; }

    .inv-table {
      width: 100%; border-collapse: collapse;
      margin-bottom: 16px; font-size: 13px;
    }
    .inv-table thead th {
      background: #222; color: #fff; padding: 8px 6px;
      text-align: left; font-weight: 600; font-size: 12px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .inv-table tbody td {
      padding: 7px 6px; border-bottom: 1px solid #e0e0e0;
      vertical-align: top;
    }
    .inv-table tbody tr:last-child td { border-bottom: 2px solid #333; }
    .col-stt   { width: 36px; text-align: center; }
    .col-qty   { width: 36px; text-align: center; }
    .col-price { width: 90px; text-align: right; }
    .col-total { width: 100px; text-align: right; }
    th.col-stt, th.col-qty { text-align: center; }
    th.col-price, th.col-total { text-align: right; }

    .inv-summary { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .inv-summary table { border-collapse: collapse; font-size: 13px; }
    .inv-summary td { padding: 4px 0; }
    .inv-summary .lbl {
      text-align: right; padding-right: 16px;
      color: #555; font-weight: 600;
    }
    .inv-summary .val { text-align: right; min-width: 100px; }
    .inv-summary .total-row .lbl { font-size: 15px; color: #000; font-weight: 700; }
    .inv-summary .total-row .val { font-size: 15px; font-weight: 700; color: #c0392b; }

    .inv-sign {
      display: flex; justify-content: space-between;
      margin-top: 50px; page-break-inside: avoid;
    }
    .inv-sign .box { width: 45%; text-align: center; }
    .inv-sign .box .title { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
    .inv-sign .box .hint { font-size: 11px; color: #888; font-style: italic; }

    .inv-footer {
      text-align: center; margin-top: 30px; padding-top: 12px;
      border-top: 1px dashed #aaa; font-size: 12px;
      color: #888; font-style: italic;
    }

    @media print {
      body { padding: 0; }
      .invoice { border: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  ${invoicePages}
</body>
</html>`;
  };

  /** Xử lý in hàng loạt */
  const handleBatchPrint = async () => {
    const ordersToPrint = filteredOrders.filter((o) => selectedIds.has(o.id));
    if (ordersToPrint.length === 0) {
      showMessage({
        title: "Chưa chọn đơn hàng",
        message: "Vui lòng chọn ít nhất 1 đơn hàng để in.",
      });
      return;
    }

    setIsPrinting(true);
    try {
      const html = buildBatchInvoiceHtml(ordersToPrint);
      await printHtmlContent(html);
    } finally {
      setIsPrinting(false);
    }
  };

  const fetchOrders = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      const data = await orderService.getOrders();
      setOrders(data);
    } catch (err: unknown) {
      const message = getApiErrorMessage(
        err,
        "Không thể tải danh sách đơn hàng.",
      );
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!canManageOrders) {
        return undefined;
      }

      fetchOrders();
      return undefined;
    }, [canManageOrders, fetchOrders]),
  );

  useFocusEffect(
    useCallback(() => {
      setTab(parseStatus(params.status));
      setKeyword(
        Array.isArray(params.keyword)
          ? params.keyword[0] || ""
          : params.keyword || "",
      );
      return undefined;
    }, [params.keyword, params.status]),
  );

  const filteredOrders = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return orders.filter((order) => {
      const normalizedStatus = normalizeStatus(order.status);
      const matchTab = tab === "ALL" ? true : normalizedStatus === tab;

      if (!matchTab) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return [
        order.order_code,
        order.receiver_name,
        order.receiver_phone,
        order.address_text,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedKeyword),
        );
    });
  }, [keyword, orders, tab]);

  const screenTitle =
    tab === "ALL" ? "Tất cả đơn hàng" : `Đơn hàng: ${STATUS_META[tab].label}`;

  if (!canManageOrders) {
    return (
      <View style={styles.container}>
        <AppHeader title="Danh sách đơn hàng" showBack />
        <View style={styles.centerState}>
          <Ionicons
            name="shield-checkmark-outline"
            size={42}
            color={Colors.primary}
          />
          <Text style={styles.blockTitle}>Bạn không có quyền truy cập</Text>
          <Text style={styles.blockText}>
            Trang này chỉ dành cho nhân viên hoặc quản trị viên.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title={screenTitle} showBack />

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchOrders(true)}
            tintColor={Colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.toolbarCard}>
              <View style={styles.searchBox}>
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <TextInput
                  value={keyword}
                  onChangeText={setKeyword}
                  placeholder="Tìm đơn hàng..."
                  placeholderTextColor={Colors.textLight}
                  style={styles.searchInput}
                />
                {keyword ? (
                  <TouchableOpacity
                    onPress={() => setKeyword("")}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={Colors.textLight}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.tabsWrap}>
                {ORDER_TABS.map((item) => {
                  const active = item.key === tab;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.tabChip, active && styles.tabChipActive]}
                      onPress={() => {
                        setTab(item.key);
                        setSelectedIds(new Set());
                      }}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.tabChipText,
                          active && styles.tabChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {error ? (
              <View style={styles.errorCard}>
                <Ionicons
                  name="alert-circle-outline"
                  size={22}
                  color={Colors.error}
                />
                <View style={styles.errorTextWrap}>
                  <Text style={styles.errorTitle}>Không tải được dữ liệu</Text>
                  <Text style={styles.errorDescription}>{error}</Text>
                </View>
              </View>
            ) : null}

            {!loading ? (
              <>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultTitle}>{screenTitle}</Text>
                  <Text style={styles.resultCount}>
                    {filteredOrders.length} đơn
                  </Text>
                </View>

                {isCompletedTab && filteredOrders.length > 0 && (
                  <View style={styles.batchBar}>
                    <View style={styles.batchBarLeft}>
                      <TouchableOpacity
                        style={styles.batchBtn}
                        onPress={() => {
                          if (selectedIds.size === filteredOrders.length) {
                            setSelectedIds(new Set());
                          } else {
                            setSelectedIds(
                              new Set(filteredOrders.map((o) => o.id)),
                            );
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={
                            selectedIds.size === filteredOrders.length
                              ? "checkbox"
                              : "square-outline"
                          }
                          size={20}
                          color={Colors.primary}
                        />
                        <Text style={styles.batchBtnText}>
                          {selectedIds.size === filteredOrders.length
                            ? "Bỏ chọn tất cả"
                            : "Chọn tất cả"}
                        </Text>
                      </TouchableOpacity>

                      {selectedIds.size > 0 && (
                        <Text style={styles.batchSelectedCount}>
                          Đã chọn {selectedIds.size}/{filteredOrders.length}
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.batchPrintBtn,
                        selectedIds.size === 0 && styles.batchPrintBtnDisabled,
                      ]}
                      onPress={handleBatchPrint}
                      disabled={selectedIds.size === 0 || isPrinting}
                      activeOpacity={0.85}
                    >
                      {isPrinting ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <>
                          <Ionicons
                            name="print-outline"
                            size={17}
                            color={Colors.white}
                          />
                          <Text style={styles.batchPrintBtnText}>
                            In phiếu ({selectedIds.size})
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>
                Đang tải danh sách đơn hàng...
              </Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons
                name="file-tray-outline"
                size={34}
                color={Colors.textLight}
              />
              <Text style={styles.emptyTitle}>Không có đơn hàng phù hợp</Text>
              <Text style={styles.emptyText}>
                Hãy thử đổi trạng thái hoặc từ khóa tìm kiếm.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const ns = normalizeStatus(item.status);
          const meta = STATUS_META[ns];
          const isSelected = selectedIds.has(item.id);

          return (
            <TouchableOpacity
              style={[
                styles.orderCard,
                isCompletedTab && isSelected && styles.orderCardSelected,
              ]}
              onPress={() => {
                if (isCompletedTab) {
                  toggleSelect(item.id);
                } else {
                  router.push(`/order/${item.id}?scope=manage` as any);
                }
              }}
              onLongPress={() => {
                if (isCompletedTab) {
                  router.push(`/order/${item.id}?scope=manage` as any);
                }
              }}
              activeOpacity={0.88}
            >
              <View style={styles.orderTopRow}>
                {isCompletedTab && (
                  <View style={styles.checkboxWrap}>
                    <Ionicons
                      name={isSelected ? "checkbox" : "square-outline"}
                      size={24}
                      color={isSelected ? Colors.primary : "#CBD5E1"}
                    />
                  </View>
                )}

                <View style={styles.orderHeadLeft}>
                  <Text style={styles.orderCode}>#{item.order_code}</Text>
                  <Text style={styles.orderDate}>
                    {formatDateTime(item.created_at)}
                  </Text>
                </View>

                <View
                  style={[styles.statusBadge, { backgroundColor: meta.bg }]}
                >
                  <Text style={[styles.statusBadgeText, { color: meta.color }]}>
                    {meta.label}
                  </Text>
                </View>
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.customerName}>
                  {item.receiver_name || "Chưa có người nhận"}
                </Text>
                <Text style={styles.customerMeta}>
                  {item.receiver_phone || "Chưa có số điện thoại"}
                </Text>
                <Text style={styles.addressText} numberOfLines={2}>
                  {item.address_text || "Chưa có địa chỉ giao hàng"}
                </Text>
              </View>

              <View style={styles.bottomRow}>
                <View>
                  <Text style={styles.metaLabel}>Tổng thanh toán</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(item.total_amount)}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.detailHint}
                  onPress={() =>
                    router.push(`/order/${item.id}?scope=manage` as any)
                  }
                  activeOpacity={0.8}
                >
                  <Text style={styles.detailHintText}>Xem chi tiết</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.primary}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEF3F9",
  },
  listContent: {
    padding: Spacing.base,
    paddingBottom: 42,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 8,
  },
  blockTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  blockText: {
    fontSize: FontSize.base,
    lineHeight: 24,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  toolbarCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    marginBottom: Spacing.base,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    paddingVertical: 13,
  },
  tabsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: "#F1F5F9",
  },
  tabChipActive: {
    backgroundColor: "#E0ECFF",
  },
  tabChipText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  tabChipTextActive: {
    color: Colors.primary,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 18,
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  errorTextWrap: {
    flex: 1,
  },
  errorTitle: {
    fontSize: FontSize.base,
    fontWeight: "800",
    color: "#B91C1C",
    marginBottom: 2,
  },
  errorDescription: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  resultTitle: {
    fontSize: FontSize.lg,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  resultCount: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.primary,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 42,
  },
  loadingText: {
    marginTop: 12,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 24,
    ...Shadow.small,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginTop: 12,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: FontSize.base,
    lineHeight: 24,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  orderCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  orderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: Spacing.base,
  },
  orderHeadLeft: {
    flex: 1,
  },
  orderCode: {
    fontSize: FontSize.md,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  orderDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  statusBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
  },
  infoCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    padding: 14,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  customerName: {
    fontSize: FontSize.base,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  customerMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  addressText: {
    fontSize: FontSize.sm,
    lineHeight: 21,
    color: Colors.textSecondary,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  metaLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  totalValue: {
    fontSize: FontSize.lg,
    fontWeight: "900",
    color: Colors.primary,
  },
  detailHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailHintText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.primary,
  },

  /* ── Batch print styles ── */
  batchBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 12,
    marginBottom: Spacing.sm,
    ...Shadow.small,
  },
  batchBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  batchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  batchBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.primary,
  },
  batchSelectedCount: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  batchPrintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0284c7",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.full,
  },
  batchPrintBtnDisabled: {
    backgroundColor: "#CBD5E1",
  },
  batchPrintBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.white,
  },
  orderCardSelected: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: "#EFF6FF",
  },
  checkboxWrap: {
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
