import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import {
  Alert,
  Animated,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import EmptyState from "../../src/components/common/EmptyState";
import Loading from "../../src/components/common/Loading";
import AddressCard from "../../src/components/profile/AddressCard";
import { Colors, Shadow } from "../../src/constants";
import {
  useAddressStore,
  useAuthStore,
  useNotificationStore,
} from "../../src/store";
import type { Address } from "../../src/types";

export default function AddressesScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const addresses = useAddressStore((state) => state.addresses);
  const isLoadingAddresses = useAddressStore(
    (state) => state.isLoadingAddresses,
  );
  const isDeletingAddress = useAddressStore((state) => state.isDeletingAddress);
  const deletingAddressId = useAddressStore((state) => state.deletingAddressId);
  const defaultingAddressId = useAddressStore(
    (state) => state.defaultingAddressId,
  );
  const addressError = useAddressStore((state) => state.addressError);
  const fetchAddresses = useAddressStore((state) => state.fetchAddresses);
  const deleteAddressAction = useAddressStore(
    (state) => state.deleteAddressAction,
  );
  const setDefaultAddressAction = useAddressStore(
    (state) => state.setDefaultAddressAction,
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification,
  );

  // Motion Assets
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0.95],
    extrapolate: "clamp",
  });

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        void fetchAddresses().catch(() => null);
      }
    }, [fetchAddresses, user?.id]),
  );

  const handleEdit = (address: Address) => {
    router.push({
      pathname: "/profile/address-form",
      params: { id: String(address.id) },
    } as never);
  };

  const handleDelete = async (address: Address) => {
    try {
      await deleteAddressAction(address.id);
      addNotification({
        title: "Thông báo",
        message: "Xoá địa chỉ thành công",
        type: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể xoá địa chỉ.";
      Alert.alert("Lỗi", message);
    }
  };

  const handleSetDefault = async (address: Address) => {
    try {
      await setDefaultAddressAction(address.id);
      addNotification({
        title: "Thông báo",
        message: "Đặt địa chỉ mặc định thành công",
        type: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể đặt mặc định.";
      Alert.alert("Lỗi", message);
    }
  };

  if (!user) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.floatNav}>
          <TouchableOpacity
            style={styles.navAction}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={Colors.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Quản lý địa chỉ</Text>
          <View style={styles.navActionEmpty} />
        </View>
        <EmptyState
          icon="person-circle-outline"
          title="Bạn chưa đăng nhập"
          message="Vui lòng đăng nhập để quản lý địa chỉ giao hàng."
          actionText="Đăng nhập ngay"
          onAction={() => router.replace("/(auth)/login")}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      {/* Floating Glass Pill Nav */}
      <Animated.View style={[styles.floatNav, { opacity: headerOpacity }]}>
        <TouchableOpacity
          style={styles.navAction}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Địa chỉ của tôi</Text>
        <View style={styles.navActionEmpty} />
      </Animated.View>

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingAddresses}
            onRefresh={() => void fetchAddresses().catch(() => null)}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
            progressViewOffset={80}
          />
        }
      >
        <View style={styles.spacer} />

        {/* Hero Header */}
        <View style={styles.heroArea}>
          <View style={styles.eyebrowPill}>
            <Text style={styles.eyebrowText}>SỔ ĐỊA CHỈ</Text>
          </View>
          <Text style={styles.heroTitle}>Địa chỉ nhận hàng</Text>
          <Text style={styles.heroSub}>
            Lưu các địa chỉ thường xuyên sử dụng để đặt hàng nhanh chóng hơn.
          </Text>
        </View>

        {isLoadingAddresses && addresses.length === 0 ? (
          <View style={styles.loadingBox}>
            <Loading text="Đang tải danh sách..." />
          </View>
        ) : null}

        {addressError ? (
          <View style={styles.statusBox}>
            <EmptyState
              icon="alert-circle-outline"
              title="Khó khăn khi tải dữ liệu"
              message={addressError}
              actionText="Thử lại"
              onAction={() => void fetchAddresses().catch(() => null)}
            />
          </View>
        ) : null}

        {!addressError && !isLoadingAddresses && addresses.length === 0 ? (
          <View style={styles.statusBox}>
            <EmptyState
              icon="location-outline"
              title="Chưa có địa chỉ nào"
              message="Bạn chưa lưu địa chỉ giao hàng nào. Hãy thêm một cái ngay!"
              actionText="Thêm địa chỉ mới"
              onAction={() => router.push("/profile/address-form")}
            />
          </View>
        ) : null}

        <View style={styles.addressList}>
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
              isDeleting={isDeletingAddress && deletingAddressId === address.id}
              isDefaulting={defaultingAddressId === address.id}
            />
          ))}
        </View>

      </Animated.ScrollView>

      {/* Floating Bottom Action Bar */}
      {addresses.length > 0 && (
        <View style={styles.fixedBottomBar}>
          <TouchableOpacity
            style={styles.bottomAddBtn}
            activeOpacity={0.9}
            onPress={() => router.push("/profile/address-form")}
          >
            <View style={styles.addBtnIconBox}>
              <Ionicons name="add" size={24} color={Colors.white} />
            </View>
            <Text style={styles.addBtnText}>Thêm địa chỉ giao hàng mới</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FDFDFD",
  },
  scrollContent: {
    paddingBottom: 110,
  },
  spacer: {
    height: 100,
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
  navActionPrimary: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Shadow.small,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: -0.3,
  },
  heroArea: {
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 32,
  },
  eyebrowPill: {
    alignSelf: "flex-start",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  eyebrowText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.8,
  },
  heroSub: {
    fontSize: 15,
    color: "#6B7280",
    marginTop: 8,
    lineHeight: 22,
  },
  loadingBox: {
    padding: 40,
    alignItems: "center",
  },
  statusBox: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 32,
    padding: 20,
    ...Shadow.medium,
    shadowOpacity: 0.03,
  },
  addressList: {
    paddingHorizontal: 20,
    gap: 16,
  },
  fixedBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 24,
    paddingTop: 16,
    backgroundColor: "rgba(253, 253, 253, 0.9)", // slightly off-white transparent
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.03)",
  },
  bottomAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 100,
    ...Shadow.medium,
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
  },
  addBtnIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  addBtnText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginRight: 32, // to balance the icon width and center text visually
  },
});
