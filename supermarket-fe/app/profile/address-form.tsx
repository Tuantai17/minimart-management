import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import EmptyState from "../../src/components/common/EmptyState";
import Loading from "../../src/components/common/Loading";
import AddressForm from "../../src/components/profile/AddressForm";
import { Shadow } from "../../src/constants";
import { useAddressStore, useNotificationStore } from "../../src/store";
import type {
    Address,
    CreateAddressPayload,
    UpdateAddressPayload,
} from "../../src/types";
import { confirmAction } from "../../src/utils";

const getChangedPayload = (
  initialAddress: Address,
  nextValues: CreateAddressPayload,
): UpdateAddressPayload => {
  const nextPayload: UpdateAddressPayload = {};

  if (nextValues.full_name !== initialAddress.full_name) {
    nextPayload.full_name = nextValues.full_name;
  }

  if (nextValues.phone !== initialAddress.phone) {
    nextPayload.phone = nextValues.phone;
  }

  if (nextValues.province !== initialAddress.province) {
    nextPayload.province = nextValues.province;
  }

  if (nextValues.district !== initialAddress.district) {
    nextPayload.district = nextValues.district;
  }

  if (nextValues.street !== initialAddress.street) {
    nextPayload.street = nextValues.street;
  }

  if ((nextValues.note || "") !== (initialAddress.note || "")) {
    nextPayload.note = nextValues.note || "";
  }

  if (Boolean(nextValues.is_default) !== Boolean(initialAddress.is_default)) {
    nextPayload.is_default = Boolean(nextValues.is_default);
  }

  return nextPayload;
};

export default function AddressFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const addressId = params.id ? Number(params.id) : null;
  const isEditMode =
    typeof addressId === "number" && Number.isFinite(addressId);

  const addresses = useAddressStore((state) => state.addresses);
  const isLoadingAddresses = useAddressStore(
    (state) => state.isLoadingAddresses,
  );
  const isCreatingAddress = useAddressStore((state) => state.isCreatingAddress);
  const isUpdatingAddress = useAddressStore((state) => state.isUpdatingAddress);
  const isDeletingAddress = useAddressStore((state) => state.isDeletingAddress);
  const addressError = useAddressStore((state) => state.addressError);
  const fetchAddresses = useAddressStore((state) => state.fetchAddresses);
  const createAddressAction = useAddressStore(
    (state) => state.createAddressAction,
  );
  const updateAddressAction = useAddressStore(
    (state) => state.updateAddressAction,
  );
  const deleteAddressAction = useAddressStore(
    (state) => state.deleteAddressAction,
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification,
  );

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (addresses.length === 0) {
      void fetchAddresses().catch(() => null);
    }
  }, [addresses.length, fetchAddresses]);

  const editingAddress = useMemo(() => {
    if (!isEditMode || !addressId) {
      return null;
    }

    return addresses.find((address) => address.id === addressId) || null;
  }, [addressId, addresses, isEditMode]);

  const handleSubmit = async (values: CreateAddressPayload) => {
    try {
      if (isEditMode && editingAddress) {
        const payload = getChangedPayload(editingAddress, values);

        if (Object.keys(payload).length === 0) {
          Alert.alert("Thông báo", "Không có thay đổi nào để lưu.");
          return;
        }

        await updateAddressAction(editingAddress.id, payload);
        addNotification({
          title: "Thông báo",
          message: "Cập nhật địa chỉ thành công",
          type: "success",
        });

        router.back();
        return;
      }

      await createAddressAction(values);
      addNotification({
        title: "Thông báo",
        message: "Thêm địa chỉ thành công",
        type: "success",
      });

      router.replace("/profile/addresses");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể lưu địa chỉ.";
      Alert.alert("Lỗi", message);
    }
  };

  const handleDelete = async () => {
    if (!editingAddress) return;

    const performDelete = async () => {
      try {
        await deleteAddressAction(editingAddress.id);
        addNotification({
          title: "Thông báo",
          message: "Xóa địa chỉ thành công",
          type: "success",
        });
        router.back();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Không thể xoá địa chỉ.";
        Alert.alert("Lỗi", message);
      }
    };

    const confirmed = await confirmAction({
      title: "Xác nhận xóa",
      message: "Bạn có chắc chắn muốn xóa địa chỉ này không?",
      confirmText: "Xóa",
      cancelText: "Hủy",
      isDestructive: true,
    });

    if (confirmed) {
      await performDelete();
    }
  };

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0.95],
    extrapolate: "clamp",
  });

  if (isEditMode && isLoadingAddresses && !editingAddress) {
    return <Loading text="Đang tải dữ liệu..." />;
  }

  if (isEditMode && !isLoadingAddresses && !editingAddress) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.floatNav}>
          <TouchableOpacity
            style={styles.navAction}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Lỗi</Text>
          <View style={styles.navActionEmpty} />
        </View>
        <EmptyState
          icon="alert-circle-outline"
          title="Không tìm thấy địa chỉ"
          message="Địa chỉ có thể đã bị xóa hoặc không còn tồn tại."
          actionText="Quay lại"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      {/* Floating Pill Nav */}
      <Animated.View style={[styles.floatNav, { opacity: headerOpacity }]}>
        <TouchableOpacity
          style={styles.navAction}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>
          {isEditMode ? "Sửa địa chỉ" : "Thêm địa chỉ"}
        </Text>
        {isEditMode ? (
          <TouchableOpacity
            style={[styles.navAction, { backgroundColor: "#FEF2F2" }]}
            onPress={handleDelete}
            disabled={isDeletingAddress}
          >
            {isDeletingAddress ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.navActionEmpty} />
        )}
      </Animated.View>

      <AddressForm
        initialValues={editingAddress}
        title={isEditMode ? "Cập nhật địa chỉ" : "Địa chỉ mới"}
        subtitle={
          isEditMode
            ? "Chỉnh sửa thông tin nhận hàng của bạn"
            : "Vui lòng điền thông tin để giao nhận thuận tiện hơn"
        }
        submitLabel={isEditMode ? "Lưu thay đổi" : "Tạo địa chỉ này"}
        submitting={isEditMode ? isUpdatingAddress : isCreatingAddress}
        error={addressError}
        onSubmit={handleSubmit}
        scrollY={scrollY}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  floatNav: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 16,
    right: 16,
    height: 56,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    zIndex: 100,
    ...Shadow.medium,
    shadowOpacity: 0.08,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.03)",
  },
  navAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
  },
  navActionEmpty: {
    width: 40,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: -0.3,
  },
});
