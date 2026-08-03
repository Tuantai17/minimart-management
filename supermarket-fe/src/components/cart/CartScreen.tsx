import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../constants";
import { useAuthStore, useCartStore } from "../../store";
import { formatCurrency, getAddToCartErrorMessage, getImageUrl } from "../../utils";
import { showLoginRequireAlert } from "../../utils/alert";
import CartToast from "./CartToast";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

// ============================================================
// Hook quản lý Toast
// ============================================================
const useToast = () => {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">(
    "success",
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "info" = "success") => {
      // Reset timer cũ nếu đang chạy
      if (timerRef.current) clearTimeout(timerRef.current);
      setToastMessage(msg);
      setToastType(type);
      setToastVisible(true);
      timerRef.current = setTimeout(() => {
        setToastVisible(false);
      }, 2000);
    },
    [],
  );

  // Cleanup timer khi unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toastVisible, toastMessage, toastType, showToast };
};

// ============================================================
// CartScreen chính
// ============================================================
export default function CartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reorderNotice?: string }>();
  const {
    items,
    loading,
    error,
    selectedIds,
    fetchCart,
    increaseQty,
    decreaseQty,
    removeFromCart,
    removeSelectedFromCart,
    clearCart,
    getTotalPrice,
    toggleSelectCartItem,
    selectAllCartItems,
    unselectAllCartItems,
  } = useCartStore();

  const { toastVisible, toastMessage, toastType, showToast } = useToast();
  const handledReorderNoticeRef = useRef("");

  // State cho modal xác nhận
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalAction, setModalAction] = useState<() => void>(() => {});
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchCart();
    }, [fetchCart]),
  );

  useEffect(() => {
    const reorderNotice = typeof params.reorderNotice === "string"
      ? decodeURIComponent(params.reorderNotice)
      : "";

    if (!reorderNotice || handledReorderNoticeRef.current === reorderNotice) {
      return;
    }

    handledReorderNoticeRef.current = reorderNotice;
    showToast(reorderNotice, "error");
  }, [params.reorderNotice, showToast]);

  // Khi items thay đổi, loại bỏ selectedIds không còn tồn tại
  useEffect(() => {
    const itemIds = items.map((i) => i.id);
    const validIds = selectedIds.filter((id) => itemIds.includes(id));
    if (validIds.length !== selectedIds.length) {
      // Chỉ update nếu có sự khác biệt
      unselectAllCartItems();
    }
  }, [items, selectedIds, unselectAllCartItems]);

  // === Helpers ===
  const isAllSelected = items.length > 0 && selectedIds.length === items.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      unselectAllCartItems();
    } else {
      selectAllCartItems();
    }
  };

  // === Xóa 1 sản phẩm ===
  const handleRemoveItem = async (itemId: number, itemName: string) => {
    try {
      await removeFromCart(itemId);
      showToast(`Đã xóa ${itemName} khỏi giỏ hàng`);
    } catch {
      showToast("Không thể xóa sản phẩm", "error");
    }
  };

  // === Xóa sản phẩm đã chọn ===
  const handleRemoveSelected = () => {
    if (selectedIds.length === 0) return;
    setModalTitle("Xóa sản phẩm đã chọn");
    setModalMessage(
      `Bạn có chắc muốn xóa ${selectedIds.length} sản phẩm đã chọn?`,
    );
    setModalAction(() => async () => {
      try {
        const count = selectedIds.length;
        await removeSelectedFromCart([...selectedIds]);
        showToast(`Đã xóa ${count} sản phẩm khỏi giỏ hàng`);
      } catch {
        showToast("Không thể xóa sản phẩm đã chọn", "error");
      }
      setModalVisible(false);
    });
    setModalVisible(true);
  };

  // === Xóa tất cả ===
  const handleClearCart = () => {
    if (items.length === 0) return;
    setModalTitle("Xóa toàn bộ giỏ hàng");
    setModalMessage("Bạn có chắc muốn xóa toàn bộ sản phẩm trong giỏ hàng?");
    setModalAction(() => async () => {
      try {
        await clearCart();
        showToast("Đã xóa toàn bộ giỏ hàng");
      } catch {
        showToast("Không thể xóa giỏ hàng", "error");
      }
      setModalVisible(false);
    });
    setModalVisible(true);
  };

  // === Thanh toán ===
  const handleCheckout = () => {
    if (!useAuthStore.getState().isLoggedIn) {
      showLoginRequireAlert();
      return;
    }
    router.push("/checkout" as any);
  };

  const handleBackPress = () => {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/orders" as any);
  };

  const handleIncreaseQty = async (itemId: number, currentQty: number) => {
    if (updatingItemId === itemId) {
      return;
    }

    try {
      setUpdatingItemId(itemId);
      await increaseQty(itemId, currentQty);
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        showLoginRequireAlert();
        return;
      }

      const displayMessage = getAddToCartErrorMessage(
        error,
        "Không thể tăng số lượng sản phẩm. Vui lòng thử lại.",
      );

      showToast(displayMessage, "error");
      Alert.alert("Thông báo", displayMessage);
    } finally {
      setUpdatingItemId((currentId) => (currentId === itemId ? null : currentId));
    }
  };

  const handleDecreaseQty = async (itemId: number, currentQty: number) => {
    if (updatingItemId === itemId) {
      return;
    }

    try {
      setUpdatingItemId(itemId);
      await decreaseQty(itemId, currentQty);
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        showLoginRequireAlert();
        return;
      }

      showToast("Không thể cập nhật số lượng", "error");
    } finally {
      setUpdatingItemId((currentId) => (currentId === itemId ? null : currentId));
    }
  };

  // === Tính tổng ===
  const subtotal = getTotalPrice();
  const MIN_SHIPPING_FEE = 15000;
  const shippingFee = subtotal > 0 ? MIN_SHIPPING_FEE : 0;
  const totalEstimate = subtotal + shippingFee;

  // === Loading state ===
  if (loading && items.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <CartToast
          message={toastMessage}
          visible={toastVisible}
          type={toastType}
        />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBackPress}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Giỏ hàng</Text>
          <View style={{ width: 68 }} />
        </View>

        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons
              name="alert-circle-outline"
              size={64}
              color={Colors.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>Không tải được giỏ hàng</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity
            style={styles.btnShopping}
            onPress={() => fetchCart()}
          >
            <Ionicons name="refresh-outline" size={20} color={Colors.white} />
            <Text style={styles.btnShoppingText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // === Giỏ hàng trống ===
  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <CartToast
          message={toastMessage}
          visible={toastVisible}
          type={toastType}
        />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBackPress}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Giỏ hàng</Text>
          <View style={{ width: 68 }} />
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cart-outline" size={64} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Giỏ hàng trống</Text>
          <Text style={styles.emptyText}>
            Giỏ hàng của bạn đang trống.{"\n"}Hãy thêm sản phẩm để bắt đầu mua
            sắm!
          </Text>
          <TouchableOpacity
            style={styles.btnShopping}
            onPress={() => router.push("/home" as any)}
          >
            <Ionicons
              name="storefront-outline"
              size={20}
              color={Colors.white}
            />
            <Text style={styles.btnShoppingText}>Tiếp tục mua sắm</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* TOAST */}
      <CartToast
        message={toastMessage}
        visible={toastVisible}
        type={toastType}
      />

      {/* MODAL XÁC NHẬN */}
      <ConfirmDeleteModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        onConfirm={modalAction}
        onCancel={() => setModalVisible(false)}
      />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBackPress}>
          <Ionicons name="chevron-back" size={28} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Giỏ hàng</Text>
        <TouchableOpacity
          onPress={handleClearCart}
          style={styles.clearBtnTextWrap}
        >
          <Text style={styles.clearBtnText}>Xóa tất cả</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ACTION BAR: Chọn tất cả + Xóa đã chọn */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={handleToggleSelectAll}
            activeOpacity={0.7}
          >
            <View
              style={[styles.checkbox, isAllSelected && styles.checkboxChecked]}
            >
              {isAllSelected && (
                <Ionicons name="checkmark" size={14} color={Colors.white} />
              )}
            </View>
            <Text style={styles.selectAllText}>
              {isAllSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </Text>
          </TouchableOpacity>

          {selectedIds.length > 0 && (
            <TouchableOpacity
              style={styles.deleteSelectedBtn}
              onPress={handleRemoveSelected}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
              <Text style={styles.deleteSelectedText}>
                Xóa đã chọn ({selectedIds.length})
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionLabel}>
          SẢN PHẨM ĐÃ CHỌN ({items.length})
        </Text>

        {/* DANH SÁCH SẢN PHẨM */}
        <View style={styles.listContainer}>
          {items.map((item) => {
            const details = item.product_details;
            const isSelected = selectedIds.includes(item.id);
            const itemName = details?.name || "Sản phẩm";

            return (
              <View
                key={item.id}
                style={[styles.cartItem, isSelected && styles.cartItemSelected]}
              >
                {/* Checkbox */}
                <TouchableOpacity
                  style={styles.checkboxWrap}
                  onPress={() => toggleSelectCartItem(item.id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxChecked,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={Colors.white}
                      />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Ảnh */}
                <Image
                  source={{ uri: getImageUrl(details?.image) }}
                  style={styles.itemImage}
                  resizeMode="cover"
                />

                {/* Thông tin */}
                <View style={styles.itemInfo}>
                  <View style={styles.itemTextTop}>
                    <View style={styles.itemNameRow}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {itemName}
                      </Text>
                      {/* Nút xóa riêng */}
                      <TouchableOpacity
                        style={styles.deleteItemBtn}
                        onPress={() => handleRemoveItem(item.id, itemName)}
                        activeOpacity={0.6}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#C0392B"
                        />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.itemPrice}>
                      {formatCurrency(Number(item.unit_price))}
                    </Text>
                  </View>

                  {/* Điều khiển số lượng + subtotal */}
                  <View style={styles.qtyContainer}>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => void handleDecreaseQty(item.id, item.quantity)}
                        disabled={updatingItemId === item.id}
                      >
                        <Ionicons
                          name="remove"
                          size={16}
                          color={Colors.primary}
                        />
                      </TouchableOpacity>
                      <Text style={styles.qtyValue}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => void handleIncreaseQty(item.id, item.quantity)}
                        disabled={updatingItemId === item.id}
                      >
                        {updatingItemId === item.id ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <Ionicons name="add" size={16} color={Colors.primary} />
                        )}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.subtotalText}>
                      {formatCurrency(item.subtotal)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* TỔNG KẾT & THANH TOÁN - NẰM CỐ ĐỊNH DƯỚI ĐÁY */}
      <View style={styles.bottomFixed}>
        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tạm tính ({items.length} món)</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Phí vận chuyển</Text>
            <View style={styles.shippingValueWrap}>
              <Text style={styles.summaryValue}>
                {formatCurrency(shippingFee)}
              </Text>
            </View>
          </View>
          <Text style={styles.shippingNote}>
            * Phí tối thiểu 15.000đ, có thể thay đổi theo khoảng cách giao hàng
          </Text>

          <View style={styles.separator} />

          <View style={styles.summaryRowTotal}>
            <Text style={styles.summaryLabelTotal}>Tổng cộng (dự kiến)</Text>
            <Text style={styles.summaryValueTotal}>
              {formatCurrency(totalEstimate)}
            </Text>
          </View>
        </View>

        {/* NÚT THANH TOÁN */}
        <View style={styles.bottomAction}>
          <TouchableOpacity
            style={[
              styles.checkoutBtn,
              items.length === 0 && styles.checkoutBtnDisabled,
            ]}
            onPress={handleCheckout}
            disabled={items.length === 0}
          >
            <Text style={styles.checkoutBtnText}>Thanh toán ngay</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAF9",
  },

  // HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: Spacing.base,
    backgroundColor: "#F9FAF9",
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  backBtn: {
    width: 40,
    justifyContent: "center",
  },
  clearBtnTextWrap: {
    width: 80,
    alignItems: "flex-end",
  },
  clearBtnText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    fontWeight: "600",
  },

  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: 20,
  },

  // ACTION BAR
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginBottom: 4,
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectAllText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  deleteSelectedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  deleteSelectedText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.error,
  },

  // CHECKBOX
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#C5D0CE",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.white,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxWrap: {
    paddingRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  sectionLabel: {
    fontSize: 13,
    color: "#8FA3A1",
    fontWeight: "700",
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // PRODUCT LIST
  listContainer: {
    marginBottom: Spacing.lg,
  },
  cartItem: {
    flexDirection: "row",
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    ...Shadow.small,
  },
  cartItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#F0FDF4",
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    backgroundColor: "#E8F5E9",
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
    justifyContent: "space-between",
  },
  itemTextTop: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  itemName: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 4,
    marginRight: 8,
  },
  deleteItemBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#FFF5F5",
    justifyContent: "center",
    alignItems: "center",
  },
  itemPrice: {
    fontSize: FontSize.sm,
    fontWeight: "500",
    color: Colors.primary,
  },
  qtyContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F4F6F4",
    borderRadius: Radius.md,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyValue: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: "#1A1A2E",
    minWidth: 28,
    textAlign: "center",
  },
  subtotalText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.primary,
  },

  // VOUCHER
  voucherContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F0FDF4",
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  voucherLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  voucherText: {
    fontSize: FontSize.base,
    color: "#2C3E3B",
    fontWeight: "500",
  },

  // FIXED BOTTOM
  bottomFixed: {
    paddingHorizontal: Spacing.base,
    paddingTop: 8,
    backgroundColor: "#F9FAF9",
  },

  // SUMMARY
  summaryContainer: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: FontSize.sm,
    color: "#7E8E8B",
  },
  summaryValue: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: "#1A1A2E",
  },
  shippingValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  shippingNote: {
    fontSize: 11,
    color: "#9E9E9E",
    fontStyle: "italic",
    marginTop: 2,
    marginBottom: 4,
  },
  summaryValueNote: {
    fontSize: FontSize.sm,
    fontStyle: "italic",
    color: "#9E9E9E",
  },
  summaryValueDiscount: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: "#F44336",
  },
  separator: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 12,
  },
  summaryRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  summaryLabelTotal: {
    fontSize: FontSize.base,
    color: "#1A1A2E",
    fontWeight: "700",
  },
  summaryValueTotal: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.primary,
  },

  // CHECKOUT
  bottomAction: {
    paddingBottom: 20,
  },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    ...Shadow.medium,
    gap: 8,
  },
  checkoutBtnDisabled: {
    backgroundColor: "#A5D6A7",
    opacity: 0.7,
  },
  checkoutBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: "700",
  },

  // EMPTY STATE
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  btnShopping: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: Radius.full,
    ...Shadow.medium,
  },
  btnShoppingText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontWeight: "600",
  },
});
