import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview/lib/WebViewTypes";
import DeliveryAddressSelector from "../../src/components/address/DeliveryAddressSelector";
import VoucherModal from "../../src/components/cart/VoucherModal";
import AppHeader from "../../src/components/common/AppHeader";
import type { MapPickerResult } from "../../src/components/map/MapPickerModal";
import MapPickerModal from "../../src/components/map/MapPickerModal";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import {
  geocodeAddress,
  getCurrentCoordinates,
  reverseGeocodeToText,
} from "../../src/services/location.service";
import { orderService } from "../../src/services/order.service";
import { voucherService } from "../../src/services/voucher.service";
import {
  useAddressStore,
  useCartStore,
  useProfileStore,
  useVoucherStore,
} from "../../src/store";
import { parseOrderError, useOrderStore } from "../../src/store/order.store";
import type {
  Address,
  AppliedVoucherPreview,
  CartItemAPI,
} from "../../src/types";
import type {
  CreateOrderPayload,
  OrderResponse,
  PaymentMethod,
  VerifyVnpayPaymentPayload,
} from "../../src/types/order.type";
import {
  formatAddressFull,
  formatCurrency,
  getImageUrl,
} from "../../src/utils";
import { isValidPhone } from "../../src/utils/helpers";

// ============================================================
// Helpers
// ============================================================

/** Build address_text từ Address object */
const buildAddressText = (address: Address): string => {
  // Ưu tiên dùng formatAddressFull (street, district, province)
  const full = formatAddressFull(address);
  return full || "Chưa có địa chỉ";
};

/** Nguồn địa chỉ: đã lưu hoặc GPS */
type AddressSource = "saved" | "gps";

/** Thông tin GPS tạm thời */
interface GpsAddress {
  address_text: string;
  lat: number;
  lng: number;
}

interface ResolvedDeliveryInfo {
  addressText: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
}

interface InventoryConflictAdjustment {
  productName: string;
  previousQuantity: number;
  nextQuantity: number;
  removed: boolean;
}

interface InventoryConflictNotice {
  visible: boolean;
  adjustments: InventoryConflictAdjustment[];
}

interface CheckoutDraftSnapshot {
  receiverName: string;
  receiverPhone: string;
  orderNote: string;
  paymentMethod: PaymentMethod;
  addressSource: AddressSource;
  selectedAddressId: number | null;
  gpsAddress: GpsAddress | null;
  voucherCode: string;
  appliedVoucher: AppliedVoucherPreview | null;
  cartItems: CartItemAPI[];
}

interface VnpayRedirectResult {
  responseCode: string | null;
  transactionStatus: string | null;
}

const VNPAY_RESULT_PATH_MARKERS = [
  "localhost:3000/payment/result",
  "localhost:8081/payment/result",
  "/payment/result",
];
const PAYMENT_STATUS_PAID = "PAID";
const PAYMENT_STATUS_FAILED = "FAILED";
const PAYMENT_STATUS_CANCELLED = "CANCELLED";
const PAYMENT_STATUS_UNPAID = "UNPAID";
const VNPAY_SUCCESS_CODE = "00";
const VNPAY_CANCELLED_CODE = "24";
const VNPAY_PENDING_ORDER_STORAGE_KEY = "vnpay_pending_order_id";
const VNPAY_CHECKOUT_DRAFT_STORAGE_KEY = "vnpay_checkout_draft";
const VNPAY_CHECKOUT_ROLLBACK_FLAG_KEY = "vnpay_checkout_rollback";
const VNPAY_STATUS_MESSAGES: Record<string, string> = {
  [VNPAY_CANCELLED_CODE]: "Bạn đã hủy giao dịch thanh toán VNPAY.",
  "11": "Phiên thanh toán VNPAY đã hết hạn.",
  "12": "Thẻ hoặc tài khoản đang bị khóa.",
  "75": "Ngân hàng đang bảo trì hoặc tạm gián đoạn.",
};

const getWebStorage = () => {
  if (Platform.OS !== "web") {
    return null;
  }

  return globalThis.localStorage ?? null;
};

const setPendingVnpayOrderIdForWeb = (orderId: string) => {
  getWebStorage()?.setItem(VNPAY_PENDING_ORDER_STORAGE_KEY, orderId);
};

const getPendingVnpayOrderIdForWeb = (): string | null => {
  return getWebStorage()?.getItem(VNPAY_PENDING_ORDER_STORAGE_KEY) ?? null;
};

const clearPendingVnpayOrderIdForWeb = () => {
  getWebStorage()?.removeItem(VNPAY_PENDING_ORDER_STORAGE_KEY);
};

const setCheckoutDraftForWeb = (draft: CheckoutDraftSnapshot) => {
  getWebStorage()?.setItem(
    VNPAY_CHECKOUT_DRAFT_STORAGE_KEY,
    JSON.stringify(draft),
  );
};

const getCheckoutDraftForWeb = (): CheckoutDraftSnapshot | null => {
  const rawDraft = getWebStorage()?.getItem(VNPAY_CHECKOUT_DRAFT_STORAGE_KEY);

  if (!rawDraft) {
    return null;
  }

  try {
    return JSON.parse(rawDraft) as CheckoutDraftSnapshot;
  } catch {
    return null;
  }
};

const clearCheckoutDraftForWeb = () => {
  getWebStorage()?.removeItem(VNPAY_CHECKOUT_DRAFT_STORAGE_KEY);
};

const setCheckoutRollbackFlagForWeb = () => {
  getWebStorage()?.setItem(VNPAY_CHECKOUT_ROLLBACK_FLAG_KEY, "1");
};

const clearCheckoutRollbackFlagForWeb = () => {
  getWebStorage()?.removeItem(VNPAY_CHECKOUT_ROLLBACK_FLAG_KEY);
};

const getVnpayReturnUrlForCurrentPlatform = (): string | undefined => {
  if (Platform.OS !== "web") {
    return undefined;
  }

  if (!globalThis.location?.origin) {
    return undefined;
  }

  return `${globalThis.location.origin}/payment/result`;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const shouldHandleVnpayRedirect = (url: string): boolean => {
  if (!url) {
    return false;
  }

  return VNPAY_RESULT_PATH_MARKERS.some((marker) => url.includes(marker));
};

const parseVnpayRedirectUrl = (
  url: string,
): VnpayRedirectResult & { verifyPayload: VerifyVnpayPaymentPayload } => {
  try {
    const parsedUrl = new URL(url);
    const verifyPayload: VerifyVnpayPaymentPayload = {};

    parsedUrl.searchParams.forEach((value, key) => {
      if (value) {
        verifyPayload[key] = value;
      }
    });

    return {
      responseCode: parsedUrl.searchParams.get("vnp_ResponseCode"),
      transactionStatus: parsedUrl.searchParams.get("vnp_TransactionStatus"),
      verifyPayload,
    };
  } catch {
    return {
      responseCode: null,
      transactionStatus: null,
      verifyPayload: {},
    };
  }
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

// ============================================================
// CheckoutScreen
// ============================================================
export default function CheckoutScreen() {
  const router = useRouter();

  // Stores
  const {
    items: cartItems,
    loading: cartLoading,
    fetchCart,
    getTotalPrice,
    reconcileCartInventory,
    restoreCartSnapshot,
  } = useCartStore();
  const {
    addresses,
    isLoadingAddresses,
    fetchAddresses,
    getSelectedOrDefaultAddress,
  } = useAddressStore();
  const { profile, isLoadingProfile, fetchProfile } = useProfileStore();
  const { isSubmitting, createOrder, cancelOrder } = useOrderStore();
  const { checkoutVouchers, isLoadingMyVouchers, fetchCheckoutVouchers } =
    useVoucherStore();

  // Local state
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // GPS state
  const [addressSource, setAddressSource] = useState<AddressSource>("saved");
  const [gpsAddress, setGpsAddress] = useState<GpsAddress | null>(null);
  const [isLoadingGps, setIsLoadingGps] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Shipping Fee API state
  const [shippingFee, setShippingFee] = useState(15000);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);

  // Voucher state
  const [isVoucherModalVisible, setVoucherModalVisible] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] =
    useState<AppliedVoucherPreview | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherNotice, setVoucherNotice] = useState<string | null>(null);
  const [isApplyingVoucher, setIsApplyingVoucher] = useState(false);

  const [inventoryConflictNotice, setInventoryConflictNotice] =
    useState<InventoryConflictNotice>({
      visible: false,
      adjustments: [],
    });

  const [isVnpayModalVisible, setVnpayModalVisible] = useState(false);
  const [vnpayPaymentUrl, setVnpayPaymentUrl] = useState("");
  const [pendingVnpayOrderId, setPendingVnpayOrderId] = useState<string | null>(
    null,
  );
  const [isVerifyingVnpayPayment, setIsVerifyingVnpayPayment] = useState(false);

  const handledVnpayRedirectRef = useRef<string | null>(null);
  const isClosingVnpayModalRef = useRef(false);
  const isRedirectVerificationInFlightRef = useRef(false);
  const hasShownVnpayResultAlertRef = useRef(false);
  const hasNavigatedAfterVnpayRef = useRef(false);

  // ============================================================
  // Load data song song khi vào màn hình
  // ============================================================
  const loadCheckoutData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);

    try {
      await Promise.all([
        fetchCart(),
        fetchAddresses(),
        fetchProfile(),
        fetchCheckoutVouchers(),
      ]);
    } catch {
      setDataError("Không thể tải dữ liệu. Vui lòng thử lại.");
    } finally {
      setIsLoadingData(false);
    }
  }, [fetchCart, fetchAddresses, fetchProfile, fetchCheckoutVouchers]);

  const buildCheckoutDraftSnapshot = useCallback((): CheckoutDraftSnapshot => {
    return {
      receiverName,
      receiverPhone,
      orderNote,
      paymentMethod,
      addressSource,
      selectedAddressId: selectedAddress?.id ?? null,
      gpsAddress,
      voucherCode,
      appliedVoucher,
      cartItems,
    };
  }, [
    addressSource,
    appliedVoucher,
    cartItems,
    gpsAddress,
    orderNote,
    paymentMethod,
    receiverName,
    receiverPhone,
    selectedAddress,
    voucherCode,
  ]);

  const restoreCheckoutDraft = useCallback(
    async (draft: CheckoutDraftSnapshot) => {
      try {
        await restoreCartSnapshot(draft.cartItems);
      } catch (error) {
        console.warn("[Checkout] restoreCartSnapshot failed:", error);
      }

      setReceiverName(draft.receiverName);
      setReceiverPhone(draft.receiverPhone);
      setOrderNote(draft.orderNote);
      setPaymentMethod(draft.paymentMethod);
      setAddressSource(draft.addressSource);
      setGpsAddress(draft.gpsAddress);
      setVoucherCode(draft.voucherCode);
      setAppliedVoucher(draft.appliedVoucher);
      setVoucherError(null);
      setVoucherNotice(
        "Đã khôi phục lại dữ liệu thanh toán sau khi bạn huỷ giao dịch VNPAY.",
      );

      if (draft.selectedAddressId) {
        const matchedAddress = addresses.find(
          (address) => address.id === draft.selectedAddressId,
        );
        setSelectedAddress(matchedAddress ?? null);
      }
    },
    [addresses, restoreCartSnapshot],
  );

  useEffect(() => {
    loadCheckoutData();
  }, [loadCheckoutData]);

  // ============================================================
  // Auto-select địa chỉ mặc định + fill thông tin người nhận
  // ============================================================
  useEffect(() => {
    if (addresses.length > 0 && !selectedAddress) {
      const defaultAddr = getSelectedOrDefaultAddress();
      if (defaultAddr) {
        setSelectedAddress(defaultAddr);
      }
    }
  }, [addresses, selectedAddress, getSelectedOrDefaultAddress]);

  useEffect(() => {
    if (Platform.OS !== "web" || addresses.length === 0) {
      return;
    }

    const draft = getCheckoutDraftForWeb();
    const rollbackFlag =
      getWebStorage()?.getItem(VNPAY_CHECKOUT_ROLLBACK_FLAG_KEY) === "1";

    if (!draft || !rollbackFlag) {
      return;
    }

    clearCheckoutRollbackFlagForWeb();
    void restoreCheckoutDraft(draft).finally(() => {
      clearCheckoutDraftForWeb();
      clearPendingVnpayOrderIdForWeb();
    });
  }, [addresses, restoreCheckoutDraft]);

  // Fill receiver info từ address hoặc profile
  useEffect(() => {
    if (selectedAddress) {
      if (selectedAddress.full_name) {
        setReceiverName(selectedAddress.full_name);
      } else if (profile?.name) {
        setReceiverName(profile.name);
      }

      if (selectedAddress.phone) {
        setReceiverPhone(selectedAddress.phone);
      } else if (profile?.phone) {
        setReceiverPhone(profile.phone);
      }
    } else if (profile) {
      if (profile.name) setReceiverName(profile.name);
      if (profile.phone) setReceiverPhone(profile.phone);
    }
  }, [selectedAddress, profile]);

  // ============================================================
  // Chọn địa chỉ từ modal (saved)
  // ============================================================
  const handleSelectAddress = useCallback((address: Address) => {
    setSelectedAddress(address);
    setAddressSource("saved");
    setGpsAddress(null);
    // Tự fill lại receiver info từ address mới
    if (address.full_name) setReceiverName(address.full_name);
    if (address.phone) setReceiverPhone(address.phone);
    setShowAddressPicker(false);
  }, []);

  // ============================================================
  // Dùng vị trí hiện tại (GPS)
  // ============================================================
  const handleUseCurrentLocation = useCallback(async () => {
    setIsLoadingGps(true);
    try {
      const coords = await getCurrentCoordinates();
      if (!coords) {
        Alert.alert(
          "Không thể lấy vị trí",
          "Bạn chưa cấp quyền định vị hoặc thiết bị không hỗ trợ GPS. Vui lòng kiểm tra lại cài đặt.",
        );
        return;
      }

      // Reverse geocode lấy địa chỉ text
      const text = await reverseGeocodeToText(
        coords.latitude,
        coords.longitude,
      );

      setGpsAddress({
        address_text: text,
        lat: coords.latitude,
        lng: coords.longitude,
      });
      setAddressSource("gps");
    } catch (err) {
      console.error("GPS error:", err);
      Alert.alert("Lỗi", "Không thể lấy vị trí hiện tại. Vui lòng thử lại.");
    } finally {
      setIsLoadingGps(false);
    }
  }, []);

  // ============================================================
  // Chọn vị trí từ bản đồ
  // ============================================================
  const handleMapConfirm = useCallback((result: MapPickerResult) => {
    setGpsAddress({
      address_text: result.address_text,
      lat: result.latitude,
      lng: result.longitude,
    });
    setAddressSource("gps");
    setShowMapPicker(false);
  }, []);

  // ============================================================
  // Computed values
  // ============================================================
  const subtotal = useMemo(() => getTotalPrice(), [cartItems, getTotalPrice]);
  const estimatedShipping = subtotal > 0 ? shippingFee : 0;
  const discountAmount = appliedVoucher?.discount_amount ?? 0;
  const voucherAdjustedSubtotal = appliedVoucher?.final_subtotal ?? subtotal;
  const estimatedTotal = voucherAdjustedSubtotal + estimatedShipping;

  const resolveDeliveryInfo =
    useCallback(async (): Promise<ResolvedDeliveryInfo> => {
      if (addressSource === "gps" && gpsAddress) {
        return {
          addressText: gpsAddress.address_text,
          deliveryLat: gpsAddress.lat,
          deliveryLng: gpsAddress.lng,
        };
      }

      if (!selectedAddress) {
        return {
          addressText: "",
          deliveryLat: null,
          deliveryLng: null,
        };
      }

      let deliveryLat = selectedAddress.lat ?? null;
      let deliveryLng = selectedAddress.lng ?? null;
      const addressText = buildAddressText(selectedAddress);

      if (
        (deliveryLat == null || deliveryLng == null) &&
        addressText !== "Chưa có địa chỉ"
      ) {
        try {
          const geocodeResult = await geocodeAddress(addressText);
          if (geocodeResult) {
            deliveryLat = geocodeResult.lat;
            deliveryLng = geocodeResult.lng;
          }
        } catch (error) {
          console.warn("Lỗi geocode địa chỉ giao hàng:", error);
        }
      }

      return {
        addressText,
        deliveryLat,
        deliveryLng,
      };
    }, [addressSource, gpsAddress, selectedAddress]);

  // Tính phí vận chuyển tự động khi tọa độ thay đổi
  useEffect(() => {
    const calculateFee = async () => {
      if (cartItems.length === 0) {
        setShippingFee(15000);
        setDistanceKm(null);
        return;
      }

      const { deliveryLat, deliveryLng } = await resolveDeliveryInfo();

      setIsCalculatingShipping(true);
      try {
        const res = await orderService.calculateShipping({
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng,
        });
        setShippingFee(res.shipping_fee);
        setDistanceKm(res.distance_km);
      } catch (err) {
        console.warn("Lỗi tính phí ship:", err);
        setShippingFee(15000);
        setDistanceKm(null);
      } finally {
        setIsCalculatingShipping(false);
      }
    };

    void calculateFee();
  }, [cartItems.length, resolveDeliveryInfo]);

  // Địa chỉ text hiển thị — tùy thuộc nguồn
  const addressText = useMemo(() => {
    if (addressSource === "gps" && gpsAddress) {
      return gpsAddress.address_text;
    }
    return selectedAddress ? buildAddressText(selectedAddress) : "";
  }, [addressSource, gpsAddress, selectedAddress]);

  // Tên hiển thị trên card
  const displayName = useMemo(() => {
    if (addressSource === "gps") return receiverName || "Vị trí hiện tại";
    return selectedAddress?.full_name || "Địa chỉ";
  }, [addressSource, selectedAddress, receiverName]);

  useEffect(() => {
    if (!appliedVoucher) {
      return;
    }

    if (Math.abs(appliedVoucher.original_subtotal - subtotal) > 0.01) {
      setAppliedVoucher(null);
      setVoucherError(null);
      setVoucherNotice(
        "Giỏ hàng đã thay đổi. Vui lòng áp dụng lại mã khuyến mãi.",
      );
    }
  }, [appliedVoucher, subtotal]);

  const handleApplyVoucher = useCallback(
    async (nextVoucherCode?: string) => {
      const normalizedCode = (nextVoucherCode ?? voucherCode)
        .trim()
        .toUpperCase();

      if (!normalizedCode) {
        setVoucherError("Vui lòng nhập mã khuyến mãi.");
        setVoucherNotice(null);
        return;
      }

      if (nextVoucherCode) {
        setVoucherCode(normalizedCode);
      }

      setIsApplyingVoucher(true);
      setVoucherError(null);
      setVoucherNotice(null);

      try {
        const response = await voucherService.applyVoucher({
          code: normalizedCode,
        });
        setAppliedVoucher(response);
        setVoucherCode(response.voucher_code);
        setVoucherNotice(response.message);
        setVoucherModalVisible(false);
        await fetchCheckoutVouchers();
      } catch (error) {
        const parsed = parseOrderError(error);
        setAppliedVoucher(null);
        setVoucherError(parsed.message);
        setVoucherNotice(null);
      } finally {
        setIsApplyingVoucher(false);
      }
    },
    [fetchCheckoutVouchers, voucherCode],
  );

  const handleRemoveVoucher = useCallback(() => {
    setAppliedVoucher(null);
    setVoucherError(null);
    setVoucherNotice("Đã gỡ mã khuyến mãi khỏi đơn hàng.");
  }, []);

  const resetVnpayFlowState = useCallback(() => {
    setVnpayModalVisible(false);
    setVnpayPaymentUrl("");
    setPendingVnpayOrderId(null);
    setIsVerifyingVnpayPayment(false);
    handledVnpayRedirectRef.current = null;
    isClosingVnpayModalRef.current = false;
    isRedirectVerificationInFlightRef.current = false;
    hasShownVnpayResultAlertRef.current = false;
    hasNavigatedAfterVnpayRef.current = false;
  }, []);

  const closeVnpayModal = useCallback(() => {
    setVnpayModalVisible(false);
    setVnpayPaymentUrl("");
    setIsVerifyingVnpayPayment(false);
    isClosingVnpayModalRef.current = true;
    isRedirectVerificationInFlightRef.current = false;
  }, []);

  const startVnpayWebFlow = useCallback(
    async (paymentUrl: string, orderId: string) => {
      const checkoutDraft = buildCheckoutDraftSnapshot();
      setCheckoutDraftForWeb(checkoutDraft);
      setPendingVnpayOrderIdForWeb(orderId);
      setPendingVnpayOrderId(orderId);

      if (Platform.OS === "web" && globalThis.location) {
        globalThis.location.assign(paymentUrl);
        return;
      }

      await Linking.openURL(paymentUrl);
    },
    [buildCheckoutDraftSnapshot],
  );

  const navigateToOrderSuccess = useCallback(
    (order: OrderResponse, options?: { showSuccessAlert?: boolean }) => {
      if (hasNavigatedAfterVnpayRef.current) {
        return;
      }

      const goToSuccessPage = () => {
        hasNavigatedAfterVnpayRef.current = true;
        clearCheckoutDraftForWeb();
        clearPendingVnpayOrderIdForWeb();
        router.replace({
          pathname: "/checkout/success",
          params: {
            order_code: order.order_code,
            order_id: String(order.id),
          },
        } as any);
      };

      if (options?.showSuccessAlert) {
        Alert.alert(
          "Thanh toán thành công",
          "Đơn hàng của bạn đã được thanh toán thành công. Hệ thống sẽ chuyển bạn tới trang đơn hàng thành công.",
          [
            {
              text: "Tiếp tục",
              onPress: goToSuccessPage,
            },
          ],
        );
        return;
      }

      goToSuccessPage();
    },
    [router],
  );

  const verifyVnpayPayment = useCallback(
    async (
      orderId: string,
      payload: VerifyVnpayPaymentPayload,
    ): Promise<OrderResponse> => {
      const verifyResponse = await orderService.verifyVnpayPayment(
        orderId,
        payload,
      );
      const resolvedOrder = await orderService.getMyOrderDetail(orderId);

      return {
        ...resolvedOrder,
        payment_status:
          verifyResponse.payment_status || resolvedOrder.payment_status,
        status: verifyResponse.order_status || resolvedOrder.status,
      };
    },
    [],
  );

  const handleVnpayPaymentResult = useCallback(
    async (url: string) => {
      if (
        !shouldHandleVnpayRedirect(url) ||
        !pendingVnpayOrderId ||
        isClosingVnpayModalRef.current ||
        isRedirectVerificationInFlightRef.current ||
        handledVnpayRedirectRef.current === url
      ) {
        return;
      }

      handledVnpayRedirectRef.current = url;
      isRedirectVerificationInFlightRef.current = true;

      const { responseCode, verifyPayload } = parseVnpayRedirectUrl(url);

      try {
        setIsVerifyingVnpayPayment(true);
        console.groupCollapsed(
          "[VNPAY][checkout] Start verify from callback url",
        );
        console.log("callbackUrl:", url);
        console.log("pendingVnpayOrderId:", pendingVnpayOrderId);
        console.log("responseCode:", responseCode);
        console.log("verifyPayload:", verifyPayload);

        const resolvedOrder = await verifyVnpayPayment(
          pendingVnpayOrderId,
          verifyPayload,
        );
        const paymentStatus = normalizePaymentStatus(
          resolvedOrder.payment_status,
        );

        console.log("resolvedOrder:", resolvedOrder);
        console.log("normalizedPaymentStatus:", paymentStatus);
        console.groupEnd();

        if (paymentStatus === PAYMENT_STATUS_PAID) {
          closeVnpayModal();
          await fetchCart();
          navigateToOrderSuccess(resolvedOrder, { showSuccessAlert: true });
          return;
        }

        closeVnpayModal();
        await fetchCart();

        if (!hasShownVnpayResultAlertRef.current) {
          hasShownVnpayResultAlertRef.current = true;
          const message = getVnpayResponseMessage(responseCode);
          const isCancelledPayment =
            String(responseCode ?? "") === VNPAY_CANCELLED_CODE ||
            paymentStatus === PAYMENT_STATUS_CANCELLED;
          Alert.alert(
            isCancelledPayment
              ? "Bạn đã hủy thanh toán"
              : "Thanh toán chưa hoàn tất",
            `${message} Bạn có thể tiếp tục thanh toán lại hoặc quay ra giỏ hàng.`,
            [
              {
                text: "Ra giỏ hàng",
                style: "cancel",
                onPress: async () => {
                  setCheckoutRollbackFlagForWeb();
                  resetVnpayFlowState();
                  router.replace("/cart" as any);
                },
              },
              {
                text: "Tiếp tục thanh toán",
                onPress: async () => {
                  setCheckoutRollbackFlagForWeb();
                  resetVnpayFlowState();
                  router.replace("/checkout" as any);
                },
              },
            ],
          );
        }
      } catch (error) {
        closeVnpayModal();

        if (!hasShownVnpayResultAlertRef.current) {
          hasShownVnpayResultAlertRef.current = true;
          const message =
            error instanceof Error
              ? error.message
              : "Không thể xác minh trạng thái thanh toán với hệ thống.";
          Alert.alert("Chưa xác minh được thanh toán", message, [
            {
              text: "Xem đơn hàng",
              onPress: () => {
                const orderId = pendingVnpayOrderId;
                resetVnpayFlowState();
                if (orderId) {
                  router.replace(`/order/${orderId}?scope=mine` as any);
                }
              },
            },
            {
              text: "Đóng",
              style: "cancel",
              onPress: resetVnpayFlowState,
            },
          ]);
        }
      } finally {
        setIsVerifyingVnpayPayment(false);
        isRedirectVerificationInFlightRef.current = false;
      }
    },
    [
      closeVnpayModal,
      fetchCart,
      navigateToOrderSuccess,
      pendingVnpayOrderId,
      resetVnpayFlowState,
      router,
      verifyVnpayPayment,
    ],
  );

  const handleOpenVoucherModal = useCallback(() => {
    void fetchCheckoutVouchers().catch(() => undefined);
    setVoucherModalVisible(true);
  }, [fetchCheckoutVouchers]);

  // ============================================================
  // Validation
  // ============================================================
  const validate = (): string | null => {
    if (cartItems.length === 0) return "Giỏ hàng của bạn đang trống.";
    if (addressSource === "saved" && !selectedAddress)
      return "Vui lòng chọn địa chỉ giao hàng.";
    if (addressSource === "gps" && !gpsAddress)
      return "Chưa lấy được vị trí GPS. Vui lòng thử lại.";
    if (!receiverName.trim()) return "Vui lòng nhập tên người nhận.";
    if (!receiverPhone.trim()) return "Vui lòng nhập số điện thoại người nhận.";
    if (!isValidPhone(receiverPhone.trim()))
      return "Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.";
    return null;
  };

  // ============================================================
  // Xử lý đặt hàng
  // ============================================================
  const handlePlaceOrder = async () => {
    const error = validate();
    if (error) {
      Alert.alert("Thông báo", error);
      return;
    }

    if (isCalculatingShipping) {
      Alert.alert(
        "Đang tính phí vận chuyển",
        "Vui lòng chờ hệ thống cập nhật phí giao hàng rồi thử lại.",
      );
      return;
    }

    try {
      const {
        addressText: finalAddressText,
        deliveryLat,
        deliveryLng,
      } = await resolveDeliveryInfo();

      const payload: CreateOrderPayload = {
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim(),
        address_text: finalAddressText,
        note: orderNote.trim(),
        voucher_code: appliedVoucher?.voucher_code,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        payment_method: paymentMethod,
      };

      const order = await createOrder(payload);

      if (paymentMethod === "VNPAY") {
        const paymentSession = await orderService.createVnpayPaymentUrl(
          order.id,
          {
            return_url: getVnpayReturnUrlForCurrentPlatform(),
          },
        );
        const nextOrderId = String(order.id);
        handledVnpayRedirectRef.current = null;
        isClosingVnpayModalRef.current = false;
        isRedirectVerificationInFlightRef.current = false;
        hasShownVnpayResultAlertRef.current = false;
        hasNavigatedAfterVnpayRef.current = false;
        setPendingVnpayOrderId(nextOrderId);

        if (Platform.OS === "web") {
          await startVnpayWebFlow(paymentSession.payment_url, nextOrderId);
          return;
        }

        setVnpayPaymentUrl(paymentSession.payment_url);
        setVnpayModalVisible(true);
        return;
      }

      await fetchCart();
      navigateToOrderSuccess(order);
    } catch (err) {
      const parsed = parseOrderError(err);

      if (parsed.type === "out_of_stock") {
        try {
          const adjustments = await reconcileCartInventory();
          setInventoryConflictNotice({
            visible: true,
            adjustments,
          });
          return;
        } catch (syncError) {
          console.error("[Checkout] reconcileCartInventory failed:", syncError);
        }
      }

      Alert.alert(parsed.title, parsed.message);
    }
  };

  const handleCloseInventoryConflictNotice = useCallback(() => {
    setInventoryConflictNotice((prev) => ({
      ...prev,
      visible: false,
    }));
  }, []);

  const handleReviewCart = useCallback(() => {
    setInventoryConflictNotice({
      visible: false,
      adjustments: [],
    });
    router.push("/cart" as any);
  }, [router]);

  // ============================================================
  // Loading state
  // ============================================================
  if (isLoadingData || cartLoading || isLoadingAddresses || isLoadingProfile) {
    return (
      <View style={styles.container}>
        <AppHeader title="Thanh toán" showBack />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải thông tin...</Text>
        </View>
      </View>
    );
  }

  // ============================================================
  // Error state
  // ============================================================
  if (dataError) {
    return (
      <View style={styles.container}>
        <AppHeader title="Thanh toán" showBack />
        <View style={styles.centerContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={Colors.error}
          />
          <Text style={styles.errorTitle}>Lỗi tải dữ liệu</Text>
          <Text style={styles.errorText}>{dataError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadCheckoutData}>
            <Ionicons name="refresh-outline" size={18} color={Colors.white} />
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================
  // Empty cart
  // ============================================================
  if (cartItems.length === 0) {
    return (
      <View style={styles.container}>
        <AppHeader title="Thanh toán" showBack />
        <View style={styles.centerContainer}>
          <Ionicons name="cart-outline" size={64} color={Colors.textLight} />
          <Text style={styles.errorTitle}>Giỏ hàng trống</Text>
          <Text style={styles.errorText}>
            Bạn cần thêm sản phẩm vào giỏ hàng trước khi thanh toán.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
                return;
              }

              router.replace("/cart" as any);
            }}
          >
            <Ionicons
              name="arrow-back-outline"
              size={18}
              color={Colors.white}
            />
            <Text style={styles.retryBtnText}>Quay lại giỏ hàng</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================
  // Main UI
  // ============================================================
  return (
    <View style={styles.container}>
      <AppHeader title="Thanh toán" showBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ============ PROGRESS BAR ============ */}
          <View style={styles.progressBar}>
            <ProgressStep icon="cart" label="Giỏ hàng" active done />
            <View style={styles.progressLine} />
            <ProgressStep icon="card" label="Thanh toán" active />
            <View style={[styles.progressLine, styles.progressLineInactive]} />
            <ProgressStep icon="checkmark-circle" label="Xác nhận" />
          </View>

          {/* ============ ĐỊA CHỈ GIAO HÀNG ============ */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>ĐỊA CHỈ GIAO HÀNG</Text>
              <TouchableOpacity
                onPress={() => {
                  setAddressSource("saved");
                  setShowAddressPicker(true);
                }}
              >
                <Text style={styles.changeText}>Thay đổi</Text>
              </TouchableOpacity>
            </View>

            {/* Hiển thị địa chỉ đang chọn */}
            {addressSource === "gps" && gpsAddress ? (
              /* === GPS Address display === */
              <View style={styles.addressContent}>
                <View
                  style={[
                    styles.addressIconWrap,
                    { backgroundColor: "#E3F2FD" },
                  ]}
                >
                  <Ionicons name="navigate" size={20} color="#1976D2" />
                </View>
                <View style={styles.addressTextWrap}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 2,
                    }}
                  >
                    <Text style={styles.addressLabel}>{displayName}</Text>
                    <View style={styles.gpsBadge}>
                      <Ionicons name="locate" size={10} color="#1976D2" />
                      <Text style={styles.gpsBadgeText}>GPS</Text>
                    </View>
                  </View>
                  <Text style={styles.addressDetail} numberOfLines={2}>
                    {gpsAddress.address_text}
                  </Text>
                  <Text style={styles.gpsCoordText}>
                    ({gpsAddress.lat.toFixed(5)}, {gpsAddress.lng.toFixed(5)})
                  </Text>
                </View>
              </View>
            ) : selectedAddress ? (
              /* === Saved Address display === */
              <TouchableOpacity
                style={styles.addressContent}
                activeOpacity={0.7}
                onPress={() => setShowAddressPicker(true)}
              >
                <View style={styles.addressIconWrap}>
                  <Ionicons name="location" size={20} color={Colors.primary} />
                </View>
                <View style={styles.addressTextWrap}>
                  <Text style={styles.addressLabel}>
                    {selectedAddress.full_name || "Địa chỉ"}
                  </Text>
                  <Text style={styles.addressDetail} numberOfLines={2}>
                    {addressText}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Colors.textLight}
                />
              </TouchableOpacity>
            ) : (
              /* === No address — prompt === */
              <TouchableOpacity
                style={styles.addAddressBtn}
                onPress={() => setShowAddressPicker(true)}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color={Colors.primary}
                />
                <Text style={styles.addAddressText}>
                  Thêm địa chỉ giao hàng
                </Text>
              </TouchableOpacity>
            )}

            {/* === Hành động chọn vị trí === */}
            <View style={styles.gpsActionsRow}>
              {/* Nút Dùng vị trí hiện tại */}
              <TouchableOpacity
                style={[
                  styles.gpsBtn,
                  { flex: 1 },
                  isLoadingGps && { opacity: 0.6 },
                  addressSource === "gps" && styles.gpsBtnActive,
                ]}
                onPress={handleUseCurrentLocation}
                disabled={isLoadingGps}
                activeOpacity={0.7}
              >
                {isLoadingGps ? (
                  <>
                    <ActivityIndicator size="small" color="#1976D2" />
                    <Text style={styles.gpsBtnText}>Đang lấy vị trí...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name="navigate-outline"
                      size={16}
                      color="#1976D2"
                    />
                    <Text style={styles.gpsBtnText}>
                      {addressSource === "gps"
                        ? "Đã dùng GPS"
                        : "Vị trí hiện tại"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Nút Chọn trên bản đồ */}
              <TouchableOpacity
                style={[styles.gpsBtn, { flex: 1 }, styles.mapBtn]}
                onPress={() => setShowMapPicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="map-outline" size={16} color="#E65100" />
                <Text style={[styles.gpsBtnText, { color: "#E65100" }]}>
                  Chọn trên bản đồ
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ============ THÔNG TIN NGƯỜI NHẬN ============ */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>THÔNG TIN NGƯỜI NHẬN</Text>

            <View style={styles.inputGroup}>
              <View style={styles.inputRow}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={Colors.textSecondary}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Tên người nhận"
                  placeholderTextColor={Colors.textLight}
                  value={receiverName}
                  onChangeText={setReceiverName}
                />
              </View>

              <View style={styles.inputDivider} />

              <View style={styles.inputRow}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={Colors.textSecondary}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Số điện thoại"
                  placeholderTextColor={Colors.textLight}
                  value={receiverPhone}
                  onChangeText={setReceiverPhone}
                  keyboardType="phone-pad"
                  maxLength={11}
                />
              </View>
            </View>
          </View>

          {/* ============ TÓM TẮT ĐƠN HÀNG ============ */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                TÓM TẮT ĐƠN HÀNG ({cartItems.length} sản phẩm)
              </Text>
            </View>

            {cartItems.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.orderItem,
                  index === cartItems.length - 1 && styles.orderItemLast,
                ]}
              >
                {/* Ảnh sản phẩm */}
                <Image
                  source={{ uri: getImageUrl(item.product_details?.image) }}
                  style={styles.orderItemImage}
                  resizeMode="cover"
                />

                {/* Thông tin sản phẩm */}
                <View style={styles.orderItemInfo}>
                  <Text style={styles.orderItemName} numberOfLines={2}>
                    {item.product_details?.name || "Sản phẩm"}
                  </Text>
                  <Text style={styles.orderItemUnitPrice}>
                    {formatCurrency(Number(item.unit_price))}
                  </Text>
                  <View style={styles.orderItemBottom}>
                    <View style={styles.orderItemQtyBadge}>
                      <Text style={styles.orderItemQtyText}>
                        x{item.quantity}
                      </Text>
                    </View>
                    <Text style={styles.orderItemPrice}>
                      {formatCurrency(item.subtotal)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            {/* Tổng số sản phẩm */}
            <View style={styles.orderTotalRow}>
              <Text style={styles.orderTotalLabel}>
                Tổng ({cartItems.reduce((s, i) => s + i.quantity, 0)} sản phẩm)
              </Text>
              <Text style={styles.orderTotalValue}>
                {formatCurrency(subtotal)}
              </Text>
            </View>
          </View>

          {/* ============ GHI CHÚ ĐƠN HÀNG ============ */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>GHI CHÚ ĐƠN HÀNG</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Ví dụ: Giao vào giờ hành chính, để ở bảo vệ..."
              placeholderTextColor={Colors.textLight}
              value={orderNote}
              onChangeText={setOrderNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* ============ PHƯƠNG THỨC THANH TOÁN ============ */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>PHƯƠNG THỨC THANH TOÁN</Text>

            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === "COD" && styles.paymentOptionActive,
              ]}
              activeOpacity={0.7}
              onPress={() => setPaymentMethod("COD")}
            >
              <View style={styles.paymentLeft}>
                <View
                  style={[
                    styles.paymentIconWrap,
                    { backgroundColor: "#E8F5E9" },
                  ]}
                >
                  <Ionicons
                    name="cash-outline"
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={styles.paymentTextWrap}>
                  <Text style={styles.paymentLabel}>
                    Thanh toán khi nhận hàng (COD)
                  </Text>
                  <Text style={styles.paymentSub}>
                    Bạn thanh toán trực tiếp cho nhân viên giao hàng.
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  paymentMethod === "COD" && styles.radioOuterActive,
                ]}
              >
                {paymentMethod === "COD" && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === "VNPAY" && styles.paymentOptionActive,
              ]}
              activeOpacity={0.7}
              onPress={() => setPaymentMethod("VNPAY")}
            >
              <View style={styles.paymentLeft}>
                <View
                  style={[styles.paymentIconWrap, styles.paymentVnpayIconWrap]}
                >
                  <Ionicons name="card-outline" size={20} color="#0055A4" />
                </View>
                <View style={styles.paymentTextWrap}>
                  <Text style={styles.paymentLabel}>Thanh toán VNPAY</Text>
                  <Text style={styles.paymentSub}>
                    Mở cổng thanh toán an toàn trong app bằng WebView.
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  paymentMethod === "VNPAY" && styles.radioOuterActive,
                ]}
              >
                {paymentMethod === "VNPAY" && (
                  <View style={styles.radioInner} />
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* ============ CHỌN MÃ GIẢM GIÁ ============ */}
          <View style={[styles.card, styles.voucherCardSection]}>
            <TouchableOpacity
              style={styles.voucherTrigger}
              onPress={handleOpenVoucherModal}
              activeOpacity={0.8}
            >
              <View style={styles.voucherTriggerLeft}>
                <View style={styles.voucherIconWrap}>
                  <Ionicons
                    name="pricetag-outline"
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={styles.voucherTextWrap}>
                  <Text style={styles.voucherTitle}>Khuyến mãi</Text>
                  <Text style={styles.voucherSubtitle}>
                    {appliedVoucher
                      ? `Đã áp dụng mã ${appliedVoucher.voucher_code}`
                      : "Nhập mã để xem trước ưu đãi từ hệ thống"}
                  </Text>
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>

            {appliedVoucher ? (
              <View style={styles.voucherAppliedBox}>
                <View style={styles.voucherAppliedHeader}>
                  <View style={styles.voucherAppliedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.voucherAppliedCode}>
                      {appliedVoucher.voucher_code}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleRemoveVoucher}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.voucherRemoveText}>Bỏ áp dụng</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.voucherAppliedMessage}>
                  {appliedVoucher.message}
                </Text>
                <View style={styles.voucherMetaRow}>
                  <Text style={styles.voucherMetaLabel}>Giảm giá</Text>
                  <Text style={styles.voucherMetaValue}>
                    -{formatCurrency(appliedVoucher.discount_amount)}
                  </Text>
                </View>
                <View style={styles.voucherMetaRow}>
                  <Text style={styles.voucherMetaLabel}>Tạm tính sau giảm</Text>
                  <Text style={styles.voucherMetaStrong}>
                    {formatCurrency(appliedVoucher.final_subtotal)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.voucherHintBox}>
                <Text style={styles.voucherHintText}>
                  Voucher sẽ được backend kiểm tra và tính giảm giá tự động để
                  đảm bảo chính xác.
                </Text>
              </View>
            )}

            {voucherNotice ? (
              <View style={styles.voucherNoticeBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={Colors.primary}
                />
                <Text style={styles.voucherNoticeText}>{voucherNotice}</Text>
              </View>
            ) : null}

            {voucherError ? (
              <View style={styles.voucherErrorBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={Colors.error}
                />
                <Text style={styles.voucherErrorText}>{voucherError}</Text>
              </View>
            ) : null}
          </View>

          {/* ============ TỔNG TIỀN ============ */}
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tạm tính</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(appliedVoucher?.original_subtotal ?? subtotal)}
              </Text>
            </View>
            {discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Giảm giá voucher</Text>
                <Text style={styles.summaryDiscountValue}>
                  - {formatCurrency(discountAmount)}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tạm tính sau giảm</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(voucherAdjustedSubtotal)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Phí vận chuyển{" "}
                {distanceKm != null ? `(${distanceKm.toFixed(1)} km)` : ""}
              </Text>
              <View style={{ alignItems: "flex-end" }}>
                {isCalculatingShipping ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.summaryValue}>
                    {formatCurrency(estimatedShipping)}
                  </Text>
                )}
              </View>
            </View>

            <Text style={styles.shippingHint}>
              * Phí giao hàng tính theo khoảng cách thực tế từ cửa hàng
            </Text>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabelTotal}>Tổng cộng</Text>
              <Text style={styles.summaryValueTotal}>
                {formatCurrency(estimatedTotal)}
              </Text>
            </View>
          </View>

          {/* Bottom spacer */}
          <View style={{ height: 20 }} />
        </ScrollView>

        {/* ============ FOOTER — NÚT ĐẶT HÀNG ============ */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerLabel}>Tổng thanh toán</Text>
            <Text style={styles.footerPrice}>
              {formatCurrency(estimatedTotal)}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.placeOrderBtn,
              isSubmitting && styles.placeOrderBtnDisabled,
            ]}
            onPress={handlePlaceOrder}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Text style={styles.placeOrderText}>Xác nhận đặt hàng</Text>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={Colors.white}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ============ MODAL CHỌN ĐỊA CHỈ ============ */}
      <DeliveryAddressSelector
        visible={showAddressPicker}
        addresses={addresses}
        selectedAddressId={selectedAddress?.id ?? null}
        isLoading={isLoadingAddresses}
        onClose={() => setShowAddressPicker(false)}
        onSelect={handleSelectAddress}
        onManageAddresses={() => {
          setShowAddressPicker(false);
          router.push("/profile/addresses" as any);
        }}
        onAddAddress={() => {
          setShowAddressPicker(false);
          router.push("/profile/address-form" as any);
        }}
      />

      {/* ============ MODAL CHỌN TRÊN BẢN ĐỒ ============ */}
      <MapPickerModal
        visible={showMapPicker}
        initialLat={
          gpsAddress?.lat ??
          ((selectedAddress?.lat ?? undefined) as number | undefined)
        }
        initialLng={
          gpsAddress?.lng ??
          ((selectedAddress?.lng ?? undefined) as number | undefined)
        }
        onClose={() => setShowMapPicker(false)}
        onConfirm={handleMapConfirm}
      />

      {/* ============ MODAL CHỌN MÃ GIẢM GIÁ ============ */}
      <VoucherModal
        visible={isVoucherModalVisible}
        voucherCode={voucherCode}
        onChangeVoucherCode={(value) => {
          setVoucherCode(value);
          if (voucherError) {
            setVoucherError(null);
          }
          if (voucherNotice) {
            setVoucherNotice(null);
          }
        }}
        isApplying={isApplyingVoucher}
        isLoadingVouchers={isLoadingMyVouchers}
        voucherList={checkoutVouchers}
        appliedVoucher={appliedVoucher}
        errorMessage={voucherError}
        subtotal={subtotal}
        onClose={() => setVoucherModalVisible(false)}
        onApply={(code) => void handleApplyVoucher(code)}
        onRemove={handleRemoveVoucher}
        onRefresh={() => void fetchCheckoutVouchers()}
      />

      <Modal
        visible={inventoryConflictNotice.visible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseInventoryConflictNotice}
      >
        <View style={styles.inventoryModalOverlay}>
          <View style={styles.inventoryModalCard}>
            <View style={styles.inventoryModalIconWrap}>
              <Ionicons name="alert-circle" size={24} color={Colors.warning} />
            </View>

            <Text style={styles.inventoryModalTitle}>
              Giỏ hàng đã được cập nhật
            </Text>
            <Text style={styles.inventoryModalText}>
              Do có khách hàng khác vừa mua sản phẩm này, số lượng tồn kho đã
              thay đổi.
            </Text>

            <View style={styles.inventoryNoticeList}>
              {inventoryConflictNotice.adjustments.length > 0 ? (
                inventoryConflictNotice.adjustments.map((adjustment, index) => (
                  <View
                    key={`${adjustment.productName}-${index}`}
                    style={styles.inventoryNoticeItem}
                  >
                    <Text style={styles.inventoryNoticeLead}>
                      👉{" "}
                      <Text style={styles.inventoryNoticeProductName}>
                        {adjustment.productName}
                      </Text>{" "}
                      hiện chỉ còn{" "}
                      <Text style={styles.inventoryNoticeQuantityHighlight}>
                        {adjustment.nextQuantity} sản phẩm
                      </Text>
                    </Text>

                    <Text style={styles.inventoryNoticeSubText}>
                      Số lượng trong giỏ của bạn đã được điều chỉnh từ{" "}
                      <Text style={styles.inventoryNoticeQuantityStrong}>
                        {adjustment.previousQuantity}
                      </Text>{" "}
                      →{" "}
                      <Text style={styles.inventoryNoticeQuantityStrong}>
                        {adjustment.nextQuantity}
                      </Text>
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.inventoryNoticeItem}>
                  <Text style={styles.inventoryNoticeSubText}>
                    Số lượng tồn kho đã thay đổi và giỏ hàng của bạn vừa được
                    điều chỉnh lại theo tồn kho mới nhất.
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.inventoryNoticeFooterText}>
              Mong bạn thông cảm vì sự bất tiện này 🙏
            </Text>
            <Text style={styles.inventoryNoticeFooterText}>
              Vui lòng kiểm tra lại đơn hàng và tiếp tục thanh toán.
            </Text>

            <View style={styles.inventoryModalActions}>
              <TouchableOpacity
                style={styles.inventorySecondaryButton}
                onPress={handleReviewCart}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color={Colors.primary}
                />
                <Text style={styles.inventorySecondaryButtonText}>
                  Xem lại giỏ hàng
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.inventoryPrimaryButton}
                onPress={handleCloseInventoryConflictNotice}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={Colors.white}
                />
                <Text style={styles.inventoryPrimaryButtonText}>
                  Tiếp tục thanh toán
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {Platform.OS !== "web" ? (
        <Modal
          visible={isVnpayModalVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => {
            closeVnpayModal();
            resetVnpayFlowState();
          }}
        >
          <View style={styles.vnpayModalContainer}>
            <View style={styles.vnpayHeader}>
              <TouchableOpacity
                style={styles.vnpayHeaderButton}
                onPress={() => {
                  closeVnpayModal();
                  resetVnpayFlowState();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>

              <View style={styles.vnpayHeaderCenter}>
                <Text style={styles.vnpayHeaderTitle}>Thanh toán VNPAY</Text>
                <Text style={styles.vnpayHeaderSubtitle}>
                  Hoàn tất thanh toán rồi hệ thống sẽ tự xác minh trạng thái.
                </Text>
              </View>

              <View style={styles.vnpayHeaderSpacer} />
            </View>

            {vnpayPaymentUrl ? (
              <View style={styles.vnpayWebViewWrap}>
                <WebView
                  source={{ uri: vnpayPaymentUrl }}
                  startInLoadingState
                  javaScriptEnabled
                  domStorageEnabled
                  onNavigationStateChange={(navState: WebViewNavigation) => {
                    void handleVnpayPaymentResult(navState.url);
                  }}
                  renderLoading={() => (
                    <View style={styles.vnpayLoadingOverlay}>
                      <ActivityIndicator size="large" color={Colors.primary} />
                      <Text style={styles.vnpayLoadingText}>
                        Đang tải cổng thanh toán VNPAY...
                      </Text>
                    </View>
                  )}
                />

                {isVerifyingVnpayPayment ? (
                  <View style={styles.vnpayVerifyingOverlay}>
                    <View style={styles.vnpayVerifyingCard}>
                      <ActivityIndicator size="large" color={Colors.primary} />
                      <Text style={styles.vnpayVerifyingTitle}>
                        Đang xác minh giao dịch
                      </Text>
                      <Text style={styles.vnpayVerifyingText}>
                        Vui lòng chờ hệ thống đối chiếu trạng thái thanh toán từ
                        backend trước khi hoàn tất đơn hàng.
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.vnpayFallbackWrap}>
                <Ionicons
                  name="alert-circle-outline"
                  size={40}
                  color={Colors.error}
                />
                <Text style={styles.vnpayFallbackTitle}>
                  Không thể mở trang thanh toán
                </Text>
                <Text style={styles.vnpayFallbackText}>
                  Liên kết thanh toán VNPAY chưa sẵn sàng. Vui lòng quay lại và
                  thử đặt hàng lại sau.
                </Text>
              </View>
            )}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// ============================================================
// ProgressStep sub-component
// ============================================================
const ProgressStep = ({
  icon,
  label,
  active = false,
  done = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  done?: boolean;
}) => (
  <View style={styles.progressStep}>
    <View
      style={[
        styles.progressIcon,
        active && styles.progressIconActive,
        done && styles.progressIconDone,
      ]}
    >
      <Ionicons
        name={done ? "checkmark" : icon}
        size={16}
        color={active || done ? Colors.white : Colors.textLight}
      />
    </View>
    <Text
      style={[
        styles.progressLabel,
        (active || done) && styles.progressLabelActive,
      ]}
    >
      {label}
    </Text>
  </View>
);

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F5",
  },

  // Center states
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xxl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  errorTitle: {
    marginTop: Spacing.base,
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  errorText: {
    marginTop: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.lg,
  },
  retryBtnText: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.white,
  },

  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },

  // Progress bar
  progressBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.base,
    marginBottom: Spacing.sm,
  },
  progressStep: {
    alignItems: "center",
    gap: 4,
  },
  progressIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E0E0E0",
    justifyContent: "center",
    alignItems: "center",
  },
  progressIconActive: {
    backgroundColor: Colors.primary,
  },
  progressIconDone: {
    backgroundColor: Colors.primaryLight,
  },
  progressLabel: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    fontWeight: "500",
  },
  progressLabelActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.primaryLight,
    marginHorizontal: 8,
    marginBottom: 18,
  },
  progressLineInactive: {
    backgroundColor: "#E0E0E0",
  },

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
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  changeText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.primary,
    marginBottom: Spacing.md,
  },

  // Address
  addressContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  addressIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySurface,
    justifyContent: "center",
    alignItems: "center",
  },
  addressTextWrap: {
    flex: 1,
  },
  addressLabel: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  addressDetail: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  addAddressBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  addAddressText: {
    fontSize: FontSize.base,
    color: Colors.primary,
    fontWeight: "600",
  },

  // Input
  inputGroup: {
    backgroundColor: "#FAFAFA",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 14 : 4,
    gap: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  inputDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginHorizontal: Spacing.md,
  },

  // Order items
  orderItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing.md,
  },
  orderItemLast: {
    borderBottomWidth: 0,
  },
  orderItemImage: {
    width: 60,
    height: 60,
    borderRadius: Radius.sm,
    backgroundColor: "#F0F0F0",
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemName: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 2,
  },
  orderItemUnitPrice: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  orderItemBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderItemQtyBadge: {
    backgroundColor: "#F0F4F0",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  orderItemQtyText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  orderItemPrice: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.primary,
  },
  orderTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  orderTotalLabel: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  orderTotalValue: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
  },

  // Note
  noteInput: {
    backgroundColor: "#FAFAFA",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    minHeight: 80,
  },

  // Payment
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  paymentOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  paymentDisabled: {
    opacity: 0.5,
  },
  paymentLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  paymentTextWrap: {
    flex: 1,
  },
  paymentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  paymentVnpayIconWrap: {
    backgroundColor: "#E8F1FB",
  },
  paymentLabel: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  paymentSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#C5C5C5",
    justifyContent: "center",
    alignItems: "center",
  },
  radioOuterActive: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },

  // Voucher
  voucherCardSection: {
    gap: Spacing.sm,
  },
  voucherTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  voucherTriggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  voucherIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primarySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  voucherTextWrap: {
    flex: 1,
  },
  voucherTitle: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  voucherSubtitle: {
    marginTop: 2,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  voucherAppliedBox: {
    backgroundColor: "#F4FBF6",
    borderWidth: 1,
    borderColor: "#D9EFE0",
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  voucherAppliedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.sm,
  },
  voucherAppliedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  voucherAppliedCode: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.primary,
  },
  voucherRemoveText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.error,
  },
  voucherAppliedMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  voucherMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  voucherMetaLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  voucherMetaValue: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.error,
  },
  voucherMetaStrong: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.primary,
  },
  voucherHintBox: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    borderStyle: "dashed" as const,
    padding: Spacing.md,
    backgroundColor: "#FAFCFA",
  },
  voucherHintText: {
    fontSize: FontSize.sm,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  voucherNoticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.primarySurface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  voucherNoticeText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.primary,
    lineHeight: 19,
    fontWeight: "500",
  },
  voucherErrorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFF5F5",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  voucherErrorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.error,
    lineHeight: 19,
    fontWeight: "500",
  },

  // Summary
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  summaryDiscountValue: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.error,
  },
  summaryValueNote: {
    fontSize: FontSize.sm,
    fontStyle: "italic",
    color: Colors.textLight,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.sm,
  },
  summaryLabelTotal: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  summaryValueTotal: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.primary,
  },
  summaryNote: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    fontStyle: "italic",
    marginTop: Spacing.xs,
  },
  shippingHint: {
    fontSize: 11,
    color: Colors.textLight,
    fontStyle: "italic",
    marginTop: 2,
    marginBottom: 4,
  },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    ...Shadow.medium,
  },
  footerLeft: {
    flex: 1,
  },
  footerLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  footerPrice: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.primary,
    marginTop: 2,
  },
  placeOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  placeOrderBtnDisabled: {
    backgroundColor: Colors.textLight,
  },
  placeOrderText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },

  // GPS address styles
  gpsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gpsBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1976D2",
  },
  gpsCoordText: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#BBDEFB",
    backgroundColor: "#F5F9FF",
    borderStyle: "dashed" as const,
  },
  gpsBtnActive: {
    backgroundColor: "#E3F2FD",
    borderColor: "#1976D2",
    borderStyle: "solid" as const,
  },
  gpsBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "500",
    color: "#1976D2",
  },
  gpsActionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  mapBtn: {
    borderColor: "#FFCC80",
    backgroundColor: "#FFF8E1",
    borderStyle: "dashed" as const,
  },
  inventoryModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
    justifyContent: "center",
    paddingHorizontal: Spacing.base,
  },
  inventoryModalCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    ...Shadow.medium,
  },
  inventoryModalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFF8E1",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  inventoryModalTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  inventoryModalText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  inventoryNoticeList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  inventoryNoticeItem: {
    backgroundColor: "#F8FBF8",
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E3EFE4",
  },
  inventoryNoticeLead: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    lineHeight: 23,
    fontWeight: "500",
  },
  inventoryNoticeProductName: {
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  inventoryNoticeQuantityHighlight: {
    color: Colors.primary,
    fontWeight: "800",
  },
  inventoryNoticeSubText: {
    marginTop: 8,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  inventoryNoticeQuantityStrong: {
    fontWeight: "800",
    color: Colors.error,
  },
  inventoryNoticeFooterText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  inventoryModalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  inventorySecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  inventorySecondaryButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.primary,
  },
  inventoryPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  inventoryPrimaryButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.white,
  },
  vnpayModalContainer: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  vnpayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    paddingTop: Platform.OS === "ios" ? Spacing.xxl : Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.white,
  },
  vnpayHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F6F5",
  },
  vnpayHeaderCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.md,
  },
  vnpayHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  vnpayHeaderSubtitle: {
    marginTop: 2,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  vnpayHeaderSpacer: {
    width: 40,
    height: 40,
  },
  vnpayWebViewWrap: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  vnpayLoadingOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: Colors.white,
  },
  vnpayLoadingText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  vnpayVerifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  vnpayVerifyingCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: "center",
    ...Shadow.medium,
  },
  vnpayVerifyingTitle: {
    marginTop: Spacing.md,
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  vnpayVerifyingText: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
  vnpayFallbackWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  vnpayFallbackTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  vnpayFallbackText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
