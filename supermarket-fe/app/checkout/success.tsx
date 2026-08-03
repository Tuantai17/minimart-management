import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { orderService } from "../../src/services/order.service";
import type { OrderResponse } from "../../src/types/order.type";
import { formatCurrency } from "../../src/utils";

export default function OrderSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    order_code: string;
    order_id: string;
  }>();

  const orderCode = params.order_code || "---";
  const orderId = params.order_id || "";
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(Boolean(orderId));
  const [orderError, setOrderError] = useState<string | null>(null);

  // Animations
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) {
        setIsLoadingOrder(false);
        return;
      }

      try {
        setIsLoadingOrder(true);
        setOrderError(null);
        const data = await orderService.getMyOrderDetail(orderId);
        setOrder(data);
      } catch (error: any) {
        const message =
          error?.response?.data?.detail ??
          error?.message ??
          "Không thể tải chi tiết đơn hàng.";
        setOrderError(message);
      } finally {
        setIsLoadingOrder(false);
      }
    };

    void fetchOrder();
  }, [orderId]);

  const subtotal = order?.subtotal ?? 0;
  const shippingFee = order?.shipping_fee ?? 0;
  const totalAmount = order?.total_amount ?? 0;
  const distanceKm = order?.distance_km ?? null;
  const paymentMethod = order?.payment_method ?? null;
  const paymentStatus = order?.payment_status ?? null;

  const paymentSummary =
    paymentMethod === "VNPAY"
      ? paymentStatus === "PAID"
        ? "Đã thanh toán online qua VNPAY"
        : "Đơn hàng đang chờ backend xác nhận thanh toán VNPAY"
      : "Thanh toán khi nhận hàng (COD)";

  return (
    <View style={styles.container}>
      {/* Success Icon */}
      <Animated.View
        style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={48} color={Colors.white} />
        </View>
      </Animated.View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.title}>Đặt hàng thành công!</Text>
        <Text style={styles.subtitle}>
          Cảm ơn bạn đã đặt hàng. Đơn hàng của bạn đang được xử lý.
        </Text>

        {/* Order Info Card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Mã đơn hàng</Text>
            <Text style={styles.cardValueHighlight}>{orderCode}</Text>
          </View>

          <View style={styles.cardDivider} />

          {isLoadingOrder ? (
            <View style={styles.loadingInlineWrap}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingInlineText}>
                Đang tải chi tiết đơn hàng...
              </Text>
            </View>
          ) : orderError ? (
            <View style={styles.infoBannerError}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={Colors.error}
              />
              <Text style={styles.infoBannerErrorText}>{orderError}</Text>
            </View>
          ) : (
            <>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Tiền hàng</Text>
                <Text style={styles.cardValue}>{formatCurrency(subtotal)}</Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>
                  Phí vận chuyển
                  {distanceKm != null && distanceKm > 0
                    ? ` (${distanceKm.toFixed(1)} km)`
                    : ""}
                </Text>
                <Text style={styles.cardValue}>
                  {formatCurrency(shippingFee)}
                </Text>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardRow}>
                <Text style={styles.cardLabelTotal}>Tổng thanh toán</Text>
                <Text style={styles.cardValueTotal}>
                  {formatCurrency(totalAmount)}
                </Text>
              </View>
            </>
          )}
        </View>

        <View
          style={[
            styles.paymentInfo,
            paymentMethod === "VNPAY" && styles.paymentInfoVnpay,
          ]}
        >
          <Ionicons
            name={paymentMethod === "VNPAY" ? "card-outline" : "cash-outline"}
            size={18}
            color={paymentMethod === "VNPAY" ? "#0055A4" : Colors.primary}
          />
          <Text
            style={[
              styles.paymentInfoText,
              paymentMethod === "VNPAY" && styles.paymentInfoTextVnpay,
            ]}
          >
            {paymentSummary}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() =>
              orderId
                ? router.replace(`/order/${orderId}?scope=mine` as any)
                : router.replace("/(tabs)/orders" as any)
            }
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={20} color={Colors.white} />
            <Text style={styles.primaryBtnText}>Xem đơn hàng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.replace("/(tabs)/home" as any)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="storefront-outline"
              size={20}
              color={Colors.primary}
            />
            <Text style={styles.secondaryBtnText}>Tiếp tục mua sắm</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F5",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },

  // Icon
  iconWrap: {
    marginBottom: Spacing.xl,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Shadow.medium,
  },

  content: {
    width: "100%",
    alignItems: "center",
  },

  title: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },

  // Card
  card: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadow.small,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  cardLabel: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  cardValue: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  cardValueHighlight: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 1,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.sm,
  },
  cardLabelTotal: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  cardValueTotal: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.primary,
  },

  // Payment info
  paymentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.xl,
    width: "100%",
  },
  paymentInfoVnpay: {
    backgroundColor: "#EAF3FF",
  },
  paymentInfoText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.primary,
  },
  paymentInfoTextVnpay: {
    color: "#0055A4",
  },
  loadingInlineWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  loadingInlineText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  infoBannerError: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FEF2F2",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  infoBannerErrorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.error,
    lineHeight: 20,
  },

  // Actions
  actions: {
    width: "100%",
    gap: Spacing.md,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
    ...Shadow.small,
  },
  primaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.white,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  secondaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.primary,
  },
});
