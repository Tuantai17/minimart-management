import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { orderService } from "../../src/services/order.service";
import { useCartStore } from "../../src/store";
import type {
  OrderResponse,
  VerifyVnpayPaymentPayload,
} from "../../src/types/order.type";

const PAYMENT_STATUS_PAID = "PAID";
const PAYMENT_STATUS_FAILED = "FAILED";
const PAYMENT_STATUS_CANCELLED = "CANCELLED";
const PAYMENT_STATUS_UNPAID = "UNPAID";
const VNPAY_SUCCESS_CODE = "00";
const VNPAY_CANCELLED_CODE = "24";
const VNPAY_PENDING_ORDER_STORAGE_KEY = "vnpay_pending_order_id";
const VNPAY_CHECKOUT_ROLLBACK_FLAG_KEY = "vnpay_checkout_rollback";
const VNPAY_STATUS_MESSAGES: Record<string, string> = {
  [VNPAY_CANCELLED_CODE]:
    "Bạn đã hủy thanh toán. Giỏ hàng của bạn vẫn còn nguyên.",
  "11": "Phiên thanh toán đã hết hạn.",
  "12": "Thẻ hoặc tài khoản đang bị khóa.",
  "75": "Ngân hàng đang bảo trì hoặc tạm gián đoạn.",
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getPendingOrderId = (): string | null => {
  if (typeof globalThis.localStorage === "undefined") {
    return null;
  }

  return globalThis.localStorage.getItem(VNPAY_PENDING_ORDER_STORAGE_KEY);
};

const clearPendingOrderId = () => {
  if (typeof globalThis.localStorage === "undefined") {
    return;
  }

  globalThis.localStorage.removeItem(VNPAY_PENDING_ORDER_STORAGE_KEY);
};

const setCheckoutRollbackFlag = () => {
  if (typeof globalThis.localStorage === "undefined") {
    return;
  }

  globalThis.localStorage.setItem(VNPAY_CHECKOUT_ROLLBACK_FLAG_KEY, "1");
};

const normalizePaymentStatus = (status?: string | null) => {
  return (status ?? PAYMENT_STATUS_UNPAID).toUpperCase();
};

const getVnpayResponseMessage = (responseCode: string | null) => {
  if (!responseCode) {
    return "Thanh toán VNPAY chưa hoàn tất. Vui lòng kiểm tra lại trạng thái đơn hàng.";
  }

  return (
    VNPAY_STATUS_MESSAGES[responseCode] ||
    `Thanh toán thất bại. Mã lỗi VNPAY: ${responseCode}.`
  );
};

const buildVerifyVnpayPayload = (
  rawParams: Record<string, string | string[] | undefined>,
): VerifyVnpayPaymentPayload => {
  return Object.entries(rawParams).reduce<VerifyVnpayPaymentPayload>(
    (accumulator, [key, value]) => {
      if (typeof value === "string" && value.length > 0) {
        accumulator[key] = value;
      } else if (Array.isArray(value) && typeof value[0] === "string") {
        accumulator[key] = value[0];
      }

      return accumulator;
    },
    {},
  );
};

type CallbackStage = "verifying" | "success" | "cancelled" | "error";

export default function VnpayPaymentResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    vnp_ResponseCode?: string;
    vnp_TransactionStatus?: string;
  }>();

  const verifyPayload = useMemo(
    () =>
      buildVerifyVnpayPayload(
        params as Record<string, string | string[] | undefined>,
      ),
    [params],
  );

  const responseCode = useMemo(() => {
    return verifyPayload.vnp_ResponseCode ?? null;
  }, [verifyPayload]);

  const [stage, setStage] = useState<CallbackStage>("verifying");
  const [message, setMessage] = useState(
    "Đang xác minh trạng thái thanh toán với hệ thống...",
  );
  const [resolvedOrder, setResolvedOrder] = useState<OrderResponse | null>(
    null,
  );
  const hasStartedRef = useRef(false);

  const { fetchCart } = useCartStore();

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    const run = async () => {
      const pendingOrderId = getPendingOrderId();

      if (!pendingOrderId) {
        setStage("error");
        setMessage(
          "Không tìm thấy đơn hàng đang chờ xác minh VNPAY. Vui lòng kiểm tra lại trong danh sách đơn hàng.",
        );
        return;
      }

      try {
        console.groupCollapsed(
          "[VNPAY][result] Start verify from payment/result",
        );
        console.log("pendingOrderId:", pendingOrderId);
        console.log("responseCode:", responseCode);
        console.log("verifyPayload:", verifyPayload);

        const verifyResponse = await orderService.verifyVnpayPayment(
          pendingOrderId,
          verifyPayload,
        );
        const resolvedOrder =
          await orderService.getMyOrderDetail(pendingOrderId);
        const paymentStatus = normalizePaymentStatus(
          verifyResponse.payment_status || resolvedOrder.payment_status,
        );

        console.log("verifyResponse:", verifyResponse);
        console.log("resolvedOrder:", resolvedOrder);
        console.log("normalizedPaymentStatus:", paymentStatus);
        console.groupEnd();

        if (paymentStatus === PAYMENT_STATUS_PAID) {
          clearPendingOrderId();
          await fetchCart();
          setResolvedOrder(resolvedOrder);
          setStage("success");
          setMessage(
            verifyResponse.message ||
              "Thanh toán VNPAY đã thành công. Hệ thống đang chuyển bạn tới trang đơn hàng thành công...",
          );

          setTimeout(() => {
            router.replace({
              pathname: "/checkout/success",
              params: {
                order_code: resolvedOrder.order_code,
                order_id: String(resolvedOrder.id),
              },
            } as any);
          }, 1200);
          return;
        }

        setCheckoutRollbackFlag();
        clearPendingOrderId();
        await fetchCart();
        setResolvedOrder(resolvedOrder);
        setStage(responseCode === VNPAY_CANCELLED_CODE ? "cancelled" : "error");
        setMessage(
          verifyResponse.message ||
            `${getVnpayResponseMessage(responseCode)} Bạn có thể tiếp tục thanh toán lại hoặc quay ra giỏ hàng.`,
        );
      } catch (error) {
        setStage("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Không thể xác minh trạng thái thanh toán với backend.",
        );
      }
    };

    void run();
  }, [fetchCart, responseCode, router, verifyPayload]);

  const pendingOrderId = getPendingOrderId();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {stage === "verifying" ? (
          <ActivityIndicator size="large" color={Colors.primary} />
        ) : (
          <View
            style={[
              styles.iconWrap,
              stage === "success"
                ? styles.iconSuccess
                : stage === "cancelled"
                  ? styles.iconCancelled
                  : styles.iconError,
            ]}
          >
            <Ionicons
              name={
                stage === "success"
                  ? "checkmark"
                  : stage === "cancelled"
                    ? "close"
                    : "alert"
              }
              size={28}
              color={Colors.white}
            />
          </View>
        )}

        <Text style={styles.title}>
          {stage === "verifying"
            ? "Đang xác minh thanh toán"
            : stage === "success"
              ? "Thanh toán thành công"
              : stage === "cancelled"
                ? "Bạn đã huỷ thanh toán"
                : "Không thể xác minh thanh toán"}
        </Text>

        <Text style={styles.message}>{message}</Text>

        {stage !== "verifying" ? (
          <View style={styles.actions}>
            {stage === "success" ? (
              <>
                {resolvedOrder ? (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() =>
                      router.replace(
                        `/order/${resolvedOrder.id}?scope=mine` as any,
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryButtonText}>Xem đơn hàng</Text>
                  </TouchableOpacity>
                ) : pendingOrderId ? (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() =>
                      router.replace(
                        `/order/${pendingOrderId}?scope=mine` as any,
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryButtonText}>Xem đơn hàng</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    if (resolvedOrder) {
                      router.replace({
                        pathname: "/checkout/success",
                        params: {
                          order_code: resolvedOrder.order_code,
                          order_id: String(resolvedOrder.id),
                        },
                      } as any);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>
                    Xem ngay trang thành công
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => router.replace("/checkout" as any)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>
                    Tiếp tục thanh toán
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.replace("/cart" as any)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>Ra giỏ hàng</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F5",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    alignItems: "center",
    ...Shadow.medium,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  iconSuccess: {
    backgroundColor: Colors.primary,
  },
  iconCancelled: {
    backgroundColor: Colors.warning,
  },
  iconError: {
    backgroundColor: Colors.error,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  message: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  actions: {
    width: "100%",
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
  secondaryButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.primary,
  },
});
