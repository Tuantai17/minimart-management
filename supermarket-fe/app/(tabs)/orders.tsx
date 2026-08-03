import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CartToast from "../../src/components/cart/CartToast";
import EmptyState from "../../src/components/common/EmptyState";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { orderService } from "../../src/services/order.service";
import { productService } from "../../src/services/product.service";
import { useCartStore } from "../../src/store/cart.store";
import type { OrderResponse } from "../../src/types/order.type";
import type { Product } from "../../src/types/product.type";
import {
  formatCurrency,
  formatDateTime,
  getAddToCartErrorMessage,
} from "../../src/utils";

// ==========================================
// STATUS CONFIGURATION
// ==========================================
type TabKey = "PENDING" | "CONFIRMED" | "SHIPPING" | "COMPLETED" | "CANCELLED";

const TABS: { key: TabKey; label: string }[] = [
  { key: "PENDING", label: "Chờ xác nhận" },
  { key: "CONFIRMED", label: "Đang chuẩn bị" },
  { key: "SHIPPING", label: "Đang giao" },
  { key: "COMPLETED", label: "Hoàn thành" },
  { key: "CANCELLED", label: "Đã hủy" },
];

const STATUS_MAP: Record<
  TabKey,
  { text: string; color: string; bgColor: string }
> = {
  PENDING: { text: "Chờ xác nhận", color: "#F59E0B", bgColor: "#FEF3C7" },
  CONFIRMED: { text: "Đang chuẩn bị", color: "#3B82F6", bgColor: "#DBEAFE" },
  SHIPPING: { text: "Đang giao", color: "#F97316", bgColor: "#FFF7ED" },
  COMPLETED: { text: "Hoàn thành", color: "#22C55E", bgColor: "#DCFCE7" },
  CANCELLED: { text: "Đã hủy", color: "#EF4444", bgColor: "#FEE2E2" },
};

/**
 * Chuẩn hóa Status rác từ Backend thành chuẩn TabKey chung (Uppercase).
 * Django backend có thể trả về "Pending", "pending", "DELIVERED"...
 */
const getNormalizedStatus = (status: string): TabKey => {
  const s = (status || "").toUpperCase().trim();
  // Giả sử backend dùng DELIVERED thay vì COMPLETED
  if (s === "DELIVERED") return "COMPLETED";
  if (TABS.some((t) => t.key === s)) return s as TabKey;
  return "PENDING"; // Fallback an toàn
};

export default function OrdersScreen() {
  const router = useRouter();
  const { addToCart, clearCart, fetchCart } = useCartStore();
  const [tab, setTab] = useState<TabKey>("PENDING");

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [reorderingOrderId, setReorderingOrderId] = useState<number | null>(
    null,
  );
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTopToast = useCallback((message: string) => {
    if (!message.trim()) {
      return;
    }

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastMessage(message);
    setToastVisible(true);

    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 3200);
  }, []);


  // Gọi api mỗi khi màn hình được Focus
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const fetchOrders = async () => {
        try {
          setLoading(true);
          const data = await orderService.getMyOrders();
          if (isActive) setOrders(data);
        } catch (error) {
          console.error("Failed to load orders:", error);
        } finally {
          if (isActive) setLoading(false);
        }
      };
      fetchOrders();
      return () => {
        isActive = false;
        if (toastTimerRef.current) {
          clearTimeout(toastTimerRef.current);
        }
      };
    }, []),
  );

  const handleReorder = async (order: OrderResponse) => {
    const orderId = Number(order.id);

    if (!orderId || reorderingOrderId === orderId) {
      return;
    }

    try {
      setReorderingOrderId(orderId);

      // 1. Lấy chi tiết đơn hàng từ API
      const orderDetail = await orderService.getMyOrderDetail(String(orderId));
      const orderItems = Array.isArray(orderDetail.items)
        ? orderDetail.items
        : [];

      if (orderItems.length === 0) {
        Alert.alert("Thông báo", "Không tìm thấy sản phẩm trong đơn hàng.");
        return;
      }

      // 2. Chuẩn hóa danh sách sản phẩm
      const normalizedItems = orderItems
        .map((item) => ({
          productId: Number(item.product),
          quantity: Number(item.quantity) || 0,
        }))
        .filter((item) => item.productId > 0 && item.quantity > 0);

      if (normalizedItems.length === 0) {
        Alert.alert(
          "Thông báo",
          "Đơn hàng không có sản phẩm hợp lệ để mua lại.",
        );
        return;
      }

      // 3. Lấy thông tin mới nhất của từng sản phẩm
      const productResults = await Promise.allSettled(
        normalizedItems.map((item) => productService.getById(item.productId)),
      );

      // 4. Phân loại sản phẩm: còn hàng vs có vấn đề
      const addableItems: {
        product: Product;
        quantity: number;
      }[] = [];
      const skippedMessages: string[] = [];

      normalizedItems.forEach((item, index) => {
        const result = productResults[index];

        if (result.status === "rejected" || !result.value?.id) {
          skippedMessages.push(
            `• Sản phẩm #${item.productId}: không tìm thấy hoặc đã bị xóa`,
          );
          return;
        }

        const product = result.value;

        if (product.is_active === false) {
          skippedMessages.push(
            `• "${product.name}": sản phẩm hiện đang ngừng kinh doanh`,
          );
          return;
        }

        const availableStock = Math.max(
          0,
          Number(product.stock_quantity) || 0,
        );

        if (availableStock <= 0) {
          skippedMessages.push(
            `• "${product.name}": sản phẩm đã hết hàng, không còn số lượng sản phẩm`,
          );
          return;
        }

        const finalQty = Math.min(item.quantity, availableStock);

        if (finalQty < item.quantity) {
          skippedMessages.push(
            `• "${product.name}": chỉ còn ${availableStock} ${product.unit || "sản phẩm"} trong kho`,
          );
        }

        if (finalQty > 0) {
          addableItems.push({
            product,
            quantity: finalQty,
          });
        }
      });

      // 5. Nếu không có sản phẩm nào thêm được → hiển thị toast trên màn hình
      if (addableItems.length === 0) {
        showTopToast(
          skippedMessages.length > 0
            ? skippedMessages.join("\n")
            : "Tất cả sản phẩm trong đơn hàng đều không còn khả dụng.",
        );
        return;
      }

      // 6. Xóa giỏ hàng cũ, thêm sản phẩm còn hàng vào giỏ mới
      await fetchCart();
      await clearCart();

      for (const { product, quantity } of addableItems) {
        await addToCart({
          id: product.id,
          name: product.name,
          price: Number(product.discount_price || product.price || 0),
          image: product.image || null,
          unit: product.unit || "",
          quantity,
        });
      }

      const reorderNotice = skippedMessages.join("\n");

      // addToCart đã tự fetchCart trong store, điều hướng sang cart
      // và truyền theo thông báo các sản phẩm không còn hàng / thiếu hàng.
      router.push(
        reorderNotice
          ? {
              pathname: "/cart",
              params: {
                reorderNotice: encodeURIComponent(reorderNotice),
              },
            }
          : ("/cart" as any),
      );
    } catch (error: unknown) {
      Alert.alert(
        "Lỗi",
        getAddToCartErrorMessage(
          error,
          "Không thể mua lại đơn hàng này. Vui lòng thử lại sau.",
        ),
      );
    } finally {
      setReorderingOrderId((currentId) =>
        currentId === orderId ? null : currentId,
      );
    }
  };

  // Backend API /orders/ đã tự filter theo request.user:
  // - Customer: chỉ trả đơn của user hiện tại
  // - Staff/Admin: trả tất cả đơn (để quản lý)
  // Response không có field user/user_id nên không thể filter ở FE.
  // → Tin tưởng backend đã xử lý đúng data isolation.

  // Lọc array order đã chuẩn hóa với Tab hiện tại
  const filteredOrders = orders.filter(
    (o) => getNormalizedStatus(o.status) === tab,
  );

  return (
    <View style={styles.container}>
      <CartToast
        message={toastMessage}
        visible={toastVisible}
        type="error"
      />

      {/* HEADER */}
      <View style={styles.headerBar}>
        <View style={{ width: 22 }} />
        <Text style={styles.headerTitle}>Lịch sử đơn hàng</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* THẺ TABS NGANG (SCROLLABLE) */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabContainer}
        >
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text
                style={[styles.tabText, tab === t.key && styles.tabTextActive]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* DANH SÁCH ĐƠN HÀNG */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh sách...</Text>
        </View>
      ) : filteredOrders.length > 0 ? (
        <FlatList
          data={filteredOrders}
          contentContainerStyle={styles.list}
          keyExtractor={(o) => String(o.id)}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              isReordering={reorderingOrderId === Number(item.id)}
              onDetail={() => router.push(`/order/${item.id}?scope=mine` as any)}
              onReorder={() => handleReorder(item)}
            />
          )}
        />
      ) : (
        <EmptyState
          icon="receipt-outline"
          title="Chưa có đơn hàng"
          message={`Không có đơn hàng nào trong trạng thái "${TABS.find((t) => t.key === tab)?.label}".`}
          actionText="Mua sắm ngay"
          onAction={() => router.push("/home" as any)}
        />
      )}
    </View>
  );
}

// ==========================================
// COMPONENT ORDER CARD
// ==========================================
function OrderCard({
  order,
  isReordering,
  onDetail,
  onReorder,
}: {
  order: OrderResponse;
  isReordering: boolean;
  onDetail: () => void;
  onReorder: () => void;
}) {
  const normStatus = getNormalizedStatus(order.status);
  const info = STATUS_MAP[normStatus];

  // Nếu có nhiều sản phẩm, chỉ hiển thị sản phẩm đầu + summary ...
  const firstItem = order.items?.[0];
  const itemsCount = order.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;

  // Fetch thêm chi tiết Product nếu Backend không trả kèm ảnh (product_image)
  const [productDetail, setProductDetail] = useState<any>(null);
  useEffect(() => {
    if (firstItem && !(firstItem as any).product_image && firstItem.product) {
      productService
        .getById(firstItem.product)
        .then((res) => setProductDetail(res))
        .catch((err) => console.log("Lỗi tải ảnh Product orders.tsx", err));
    }
  }, [firstItem]);

  const displayImage = firstItem
    ? (firstItem as any).product_image || productDetail?.image
    : null;

  return (
    <View style={styles.card}>
      {/* Header dòng đầu: Mã đơn + Trạng thái */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderId}>#{order.order_code || order.id}</Text>
          <Text style={styles.orderDate}>
            Ngày tạo: {formatDateTime(order.created_at)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: info.bgColor }]}>
          <View style={[styles.badgeDot, { backgroundColor: info.color }]} />
          <Text style={[styles.badgeText, { color: info.color }]}>
            {info.text}
          </Text>
        </View>
      </View>

      {/* Product Summary */}
      {firstItem && (
        <View style={styles.productPreview}>
          <View style={styles.productImageWrap}>
            {displayImage ? (
              <Image
                source={{ uri: displayImage }}
                style={{ width: 56, height: 56, borderRadius: Radius.sm }}
                resizeMode="cover"
              />
            ) : (
              <Ionicons
                name="cube-outline"
                size={24}
                color={Colors.textLight}
              />
            )}
          </View>

          <View style={styles.productInfo}>
            <Text style={styles.productNames} numberOfLines={2}>
              {firstItem.product_name_snapshot}
            </Text>
            {(order.items?.length || 0) > 1 && (
              <Text style={styles.moreItemsText}>
                ...và {itemsCount - firstItem.quantity} sản phẩm khác
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Thành tiền */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Tổng thanh toán:</Text>
        <Text style={styles.totalValue}>
          {formatCurrency(order.total_amount)}
        </Text>
      </View>

      {/* Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.detailBtn} onPress={onDetail}>
          <Ionicons
            name="document-text-outline"
            size={16}
            color={Colors.primary}
          />
          <Text style={styles.detailBtnText}>Xem chi tiết</Text>
        </TouchableOpacity>

        {/* Nút mua lại (với đơn hoàn thành hoặc hủy đều mua lại được) */}
        <TouchableOpacity
          style={[styles.reorderBtn, isReordering && styles.reorderBtnDisabled]}
          onPress={onReorder}
          disabled={isReordering}
        >
          {isReordering ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Ionicons name="cart-outline" size={16} color={Colors.white} />
          )}
          <Text style={styles.reorderBtnText}>
            {isReordering ? "Đang xử lý..." : "Mua lại"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F2F5" },
  centerWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },

  // Header
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.base,
    backgroundColor: Colors.white,
    ...Shadow.small,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },

  // Tabs
  tabScroll: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tabContainer: {
    paddingHorizontal: Spacing.sm,
  },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    marginHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: {
    fontSize: FontSize.base,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  tabTextActive: { color: Colors.primary, fontWeight: "700" },

  // List
  list: { padding: Spacing.base },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.base,
  },
  orderId: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  orderDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  // Badge
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.full,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  badgeText: { fontSize: FontSize.xs, fontWeight: "700" },

  // Preview
  productPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.base,
    paddingBottom: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  productImageWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: "#F5F6F5",
    justifyContent: "center",
    alignItems: "center",
  },
  productInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  productNames: {
    fontSize: FontSize.base,
    fontWeight: "500",
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  moreItemsText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  // Total
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.base,
  },
  totalLabel: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
  },

  // Actions
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  detailBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    gap: 6,
  },
  detailBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.primary,
  },
  reorderBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    gap: 6,
  },
  reorderBtnDisabled: {
    opacity: 0.7,
  },
  reorderBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.white,
  },
});
