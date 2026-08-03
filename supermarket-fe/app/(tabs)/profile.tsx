import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Colors, Shadow } from "../../src/constants";
import client from "../../src/services/api/client";
import { Endpoints } from "../../src/services/api/endpoints";
import {
    useAddressStore,
    useAuthStore,
    useCartStore,
    useNotificationStore,
    useProfileStore,
} from "../../src/store";
import { storage } from "../../src/utils";

type ProfileRole = "customer" | "staff" | "admin";

type MenuStatus = "available" | "blocked" | "info";

type RoleMenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress?: () => void;
  note?: string;
  status?: MenuStatus;
};

type ProfileSectionMenuItem = RoleMenuItem & {
  visible?: boolean;
  isLast?: boolean;
};

// --- Vanguard UI Components ---

/**
 * Double-Bezel Container (Doppelrand)
 * Creates physical, machined hardware depth with nested enclosures.
 */
const BezelCard = ({
  children,
  style,
  innerStyle,
  outerPadding = 6,
  outerRadius = 32,
}: {
  children: React.ReactNode;
  style?: any;
  innerStyle?: any;
  outerPadding?: number;
  outerRadius?: number;
}) => (
  <View
    style={[
      styles.outerBezel,
      { padding: outerPadding, borderRadius: outerRadius },
      style,
    ]}
  >
    <View
      style={[
        styles.innerCore,
        { borderRadius: outerRadius - outerPadding },
        innerStyle,
      ]}
    >
      {children}
    </View>
  </View>
);

/**
 * Bento Stat Card
 * Asymmetrical layout element for visual rhythm.
 */
const BentoStat = ({
  label,
  value,
  icon,
  color = Colors.primary,
  delay = 0,
}: {
  label: string;
  value: string;
  icon: any;
  color?: string;
  delay?: number;
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
    >
      <BezelCard
        outerRadius={24}
        outerPadding={5}
        innerStyle={styles.statInner}
      >
        <View
          style={[styles.statIconCircle, { backgroundColor: color + "15" }]}
        >
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <Text style={styles.statValueText}>{value}</Text>
        <Text style={styles.statLabelText}>{label}</Text>
      </BezelCard>
    </Animated.View>
  );
};

/**
 * Island Menu Item
 * Nested architecture with leading icon highlights and trailing arrow circular wrappers.
 */
const ProfileMenuItem = ({
  icon,
  label,
  onPress,
  color = Colors.primary,
  rightElement,
  isLast = false,
  note,
  status = "info",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  color?: string;
  rightElement?: React.ReactNode;
  isLast?: boolean;
  note?: string;
  status?: MenuStatus;
}) => {
  const statusMeta =
    status === "available"
      ? {
          label: "Sẵn sàng",
          textColor: "#047857",
          backgroundColor: "#DCFCE7",
        }
      : status === "blocked"
        ? {
            label: "Chờ BE",
            textColor: "#B45309",
            backgroundColor: "#FEF3C7",
          }
        : {
            label: "Thông tin",
            textColor: "#475569",
            backgroundColor: "#E2E8F0",
          };

  return (
    <TouchableOpacity
      style={[styles.islandItem, isLast && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={0.82}
      disabled={!onPress && !rightElement}
    >
      <View style={[styles.islandIconBox, { backgroundColor: color + "12" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>

      <View style={styles.islandTextWrap}>
        <View style={styles.islandTopRow}>
          <Text style={styles.islandLabel}>{label}</Text>
          {!rightElement && note ? (
            <View
              style={[
                styles.statusPill,
                { backgroundColor: statusMeta.backgroundColor },
              ]}
            >
              <Text
                style={[styles.statusPillText, { color: statusMeta.textColor }]}
              >
                {statusMeta.label}
              </Text>
            </View>
          ) : null}
        </View>
        {note ? <Text style={styles.islandNote}>{note}</Text> : null}
      </View>

      {rightElement ? (
        rightElement
      ) : onPress ? (
        <View style={styles.arrowCircle}>
          <Ionicons name="chevron-forward" size={14} color="#7C8BA1" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const getRolePresentation = (role: ProfileRole) => {
  if (role === "admin") {
    return {
      label: "Quản trị viên",
      description:
        "Toàn quyền điều hành, theo dõi vận hành và quản lý hệ thống.",
      color: "#7C3AED",
    };
  }

  if (role === "staff") {
    return {
      label: "Nhân viên",
      description:
        "Hỗ trợ xử lý đơn hàng, hàng hóa và nghiệp vụ nội bộ hằng ngày.",
      color: "#2563EB",
    };
  }

  return {
    label: "Khách hàng",
    description: "Quản lý hồ sơ cá nhân và các tiện ích mua sắm cơ bản.",
    color: "#10B981",
  };
};

export default function ProfileScreen() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const authRole = useAuthStore((state) => state.role);
  const isStaff = useAuthStore((state) => state.isStaff);
  const isSuperuser = useAuthStore((state) => state.isSuperuser);
  const profile = useProfileStore((state) => state.profile);
  const fetchProfile = useProfileStore((state) => state.fetchProfile);
  const clearProfile = useProfileStore((state) => state.clearProfile);
  const clearAddresses = useAddressStore((state) => state.clearAddresses);
  const clearNotifications = useNotificationStore(
    (state) => state.clearNotifications,
  );
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const updateStockAlertsAction = useProfileStore(
    (state) => state.updateStockAlertsAction,
  );

  const [isUpdatingAlerts, setIsUpdatingAlerts] = useState(false);

  // Suy ra vai trò theo thứ tự ưu tiên:
  // 1. Cờ boolean (đáng tin cậy nhất, phản ánh đúng trạng thái từ backend)
  // 2. Cờ boolean trên user object (từ persistent storage)
  // 3. authRole từ store (có thể bị sai nếu backend không trả is_staff)
  // 4. Mặc định: customer
  const role: ProfileRole =
    isSuperuser || user?.is_superuser
      ? "admin"
      : isStaff || user?.is_staff
        ? "staff"
        : authRole || "customer";
  const rolePresentation = getRolePresentation(role);

  const roleMenuItems: RoleMenuItem[] =
    role === "admin"
      ? [
          {
            icon: "list-outline",
            label: "Điều phối đơn hàng",
            color: "#2563EB",
            onPress: () => router.push("/staff-admin/order-manage" as any),
            note: "Theo dõi và xử lý toàn bộ đơn hàng trên hệ thống.",
            status: "available",
          },
          {
            icon: "cube-outline",
            label: "Quản trị hàng hóa",
            color: "#0EA5E9",
            onPress: () => router.push("/staff-admin/inventory-basic" as any),
            note: "Quản lý sản phẩm, danh mục và dữ liệu tồn kho tổng thể.",
            status: "available",
          },
          {
            icon: "bar-chart-outline",
            label: "Báo cáo doanh thu",
            color: "#10B981",
            onPress: () => router.push("/staff-admin/revenue-report" as any),
            note: "Xem thống kê vận hành và doanh thu toàn hệ thống.",
            status: "available",
          },
          {
            icon: "mail-open-outline",
            label: "Hộp thư hỗ trợ",
            color: "#8B5CF6",
            onPress: () => router.push("/staff-admin/support-tickets" as any),
            note: "Tiếp nhận và phản hồi các ticket hỗ trợ từ người dùng và nhân viên.",
            status: "available",
          },
        ]
      : role === "staff"
        ? [
            {
              icon: "list-outline",
              label: "Danh sách đơn hàng",
              color: "#2563EB",
              onPress: () => router.push("/staff-admin/order-manage" as any),
              note: "Theo dõi và xử lý đơn hàng theo nghiệp vụ nhân viên.",
              status: "available",
            },
            {
              icon: "cube-outline",
              label: "Quản lý hàng hóa cơ bản",
              color: "#06B6D4",
              onPress: () => router.push("/staff-admin/inventory-basic" as any),
              note: "Cập nhật thông tin sản phẩm và xử lý tác vụ kho cơ bản.",
              status: "available",
            },
            {
              icon: "mail-open-outline",
              label: "Hộp thư hỗ trợ",
              color: "#8B5CF6",
              onPress: () => router.push("/staff-admin/support-tickets" as any),
              note: "Xem và phản hồi các hội thoại hỗ trợ đang chờ xử lý.",
              status: "available",
            },
          ]
        : [];

  const experienceMenuItems: ProfileSectionMenuItem[] =
    role === "admin"
      ? [
          {
            icon: "mail-unread-outline",
            label: "Nhận cảnh báo tồn kho tự động",
            color: "#F59E0B",
            note: "Nhận báo cáo qua email (Cronjob) khi có sản phẩm sắp hết hàng.",
            status: "available",
          },
          {
            icon: "moon-outline",
            label: "Chế độ tối",
            color: "#6366F1",
            note: "Thiết lập giao diện sẽ mở rộng khi app hỗ trợ theme đồng bộ toàn hệ thống.",
            status: "info",
          },
          {
            icon: "shield-checkmark-outline",
            label: "Bảo mật & Quyền riêng tư",
            color: "#8B5CF6",
            onPress: () => router.push("/profile/security" as any),
            note: "Quản lý mật khẩu, thông tin đăng nhập và quyền truy cập tài khoản.",
            status: "available",
          },
          {
            icon: "help-circle-outline",
            label: "Trung tâm hỗ trợ",
            color: "#6B7280",
            onPress: () => router.push("/profile/support" as any),
            note: "Tổng hợp hướng dẫn, câu hỏi thường gặp và quy trình hỗ trợ nội bộ.",
            status: "available",
          },
        ]
      : role === "staff"
        ? [
            {
              icon: "mail-unread-outline",
              label: "Nhận cảnh báo tồn kho tự động",
              color: "#F59E0B",
              note: "Nhận báo cáo qua email (Cronjob) khi có sản phẩm sắp hết hàng.",
              status: "available",
            },
            {
              icon: "moon-outline",
              label: "Chế độ tối",
              color: "#6366F1",
              note: "Thiết lập giao diện sẽ mở rộng khi app hỗ trợ theme đồng bộ toàn hệ thống.",
              status: "info",
            },
            {
              icon: "shield-checkmark-outline",
              label: "Bảo mật & Quyền riêng tư",
              color: "#8B5CF6",
              onPress: () => router.push("/profile/security" as any),
              note: "Quản lý mật khẩu, thông tin đăng nhập và quyền truy cập tài khoản.",
              status: "available",
            },
            {
              icon: "chatbox-ellipses-outline",
              label: "Gửi yêu cầu hỗ trợ",
              color: "#14B8A6",
              onPress: () => router.push("/profile/chat" as any),
              note: "Tạo ticket hỗ trợ khi chính tài khoản staff cần được hỗ trợ thêm.",
              status: "available",
            },
            {
              icon: "help-circle-outline",
              label: "Trung tâm hỗ trợ",
              color: "#6B7280",
              onPress: () => router.push("/profile/support" as any),
              note: "Tổng hợp hướng dẫn, FAQ và tài liệu nghiệp vụ hỗ trợ.",
              status: "available",
            },
          ]
        : [
            {
              icon: "moon-outline",
              label: "Chế độ tối",
              color: "#6366F1",
              note: "Thiết lập giao diện sẽ mở rộng khi app hỗ trợ theme đồng bộ toàn hệ thống.",
              status: "info",
            },
            {
              icon: "shield-checkmark-outline",
              label: "Bảo mật & Quyền riêng tư",
              color: "#8B5CF6",
              onPress: () => router.push("/profile/security" as any),
              note: "Quản lý mật khẩu, thông tin đăng nhập và quyền truy cập tài khoản.",
              status: "available",
            },
            {
              icon: "chatbox-ellipses-outline",
              label: "Hỗ trợ trực tuyến (Chat)",
              color: "#14B8A6",
              onPress: () => router.push("/profile/chat" as any),
              note: "Liên hệ với nhân viên hỗ trợ trực tiếp để giải quyết vấn đề.",
              status: "available",
            },
            {
              icon: "help-circle-outline",
              label: "Trung tâm hỗ trợ",
              color: "#6B7280",
              onPress: () => router.push("/profile/support" as any),
              note: "Tổng hợp hướng dẫn, câu hỏi thường gặp và kênh hỗ trợ khi cần.",
              status: "available",
            },
          ];

  useEffect(() => {
    if (user?.id) {
      fetchProfile().catch(console.error);
    }
  }, [fetchProfile, user?.id]);

  const confirmLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    // Đóng modal trước để tránh unmount khi animation đang chạy.
    setShowLogoutModal(false);
    setIsLoggingOut(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      const refresh = (
        refreshToken ||
        (await storage.get("refreshToken")) ||
        ""
      ).trim();

      try {
        const messagingModule =
          await import("@react-native-firebase/messaging");
        const currentFcmToken = await messagingModule.default().getToken();

        if (currentFcmToken) {
          await client.delete(Endpoints.DEVICE_DETAIL(currentFcmToken));
        }
      } catch (deviceError) {
        console.warn("[LOGOUT] Không thể gỡ FCM token:", deviceError);
      }

      if (refresh) {
        await client.post(Endpoints.LOGOUT, { refresh });
      }

      clearProfile();
      clearAddresses();
      clearNotifications();
      useCartStore.setState({ items: [], totalPrice: 0, selectedIds: [] });
      logout();
      router.replace("/(auth)/login");
    } catch (error: any) {
      if (!useAuthStore.getState().isLoggedIn) {
        return;
      }

      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        "Khong the dang xuat luc nay. Vui long thu lai.";
      Alert.alert("Khong the dang xuat", String(message));
    } finally {
      setIsLoggingOut(false);
    }
  };

  const toggleStockAlerts = async (value: boolean) => {
    if (isUpdatingAlerts) return;
    setIsUpdatingAlerts(true);
    try {
      await updateStockAlertsAction(value);
    } catch (error: any) {
      Alert.alert("Lỗi", error.message || "Không thể cập nhật cấu hình email.");
    } finally {
      setIsUpdatingAlerts(false);
    }
  };

  if (!user) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.floatNav}>
          <Text style={styles.navTitle}>Tài khoản</Text>
        </View>
        <View style={styles.emptyShell}>
          <View style={styles.emptyCard}>
            <Ionicons name="person-circle-outline" size={80} color="#E0E0E0" />
            <Text style={styles.emptyHeading}>Chào mừng bạn</Text>
            <Text style={styles.emptySub}>
              Đăng nhập để tận hưởng đầy đủ tiện ích và theo dõi đơn hàng của
              bạn.
            </Text>
            <TouchableOpacity
              style={styles.pillButton}
              onPress={() => router.push("/(auth)/login")}
            >
              <Text style={styles.pillButtonText}>Đăng nhập ngay</Text>
              <View style={styles.innerPillArrow}>
                <Ionicons name="arrow-forward" size={16} color={Colors.white} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      {/* Detached Floating Header */}
      <View style={styles.floatNav}>
        <TouchableOpacity
          style={styles.navAction}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Trang cá nhân</Text>
        <TouchableOpacity
          style={styles.navAction}
          onPress={() => router.push("/profile/notifications" as never)}
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={Colors.textPrimary}
          />
          {unreadCount > 0 ? (
            <View style={styles.navBadge}>
              <Text style={styles.navBadgeText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[0]}
      >
        <View style={styles.spacer} />

        {/* Profile Identity Section */}
        <View style={styles.heroSection}>
          <BezelCard
            outerRadius={34}
            outerPadding={6}
            style={styles.heroCardShell}
            innerStyle={styles.heroCardInner}
          >
            <View style={styles.heroGlowOrb} />
            <View style={styles.heroTopRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => router.push("/profile/edit")}
                style={styles.avatarPillWrapper}
              >
                <BezelCard
                  outerRadius={50}
                  outerPadding={6}
                  style={styles.avatarBezel}
                >
                  {profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.heroAvatar}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="person" size={40} color="#B0B0B0" />
                    </View>
                  )}
                  <View style={styles.floatingEditBadge}>
                    <Ionicons name="camera" size={14} color={Colors.white} />
                  </View>
                </BezelCard>
              </TouchableOpacity>

              <View style={styles.heroTextColumn}>
                <Text style={styles.heroOverline}>MINI SUPERMARKET ID</Text>
                <Text style={styles.heroName}>
                  {profile?.name ||
                    user?.full_name ||
                    user?.name ||
                    "Thành viên mới"}
                </Text>

                <View style={styles.roleBadgeWrap}>
                  <View
                    style={[
                      styles.roleBadge,
                      { backgroundColor: rolePresentation.color + "18" },
                    ]}
                  >
                    <Ionicons
                      name={
                        role === "admin"
                          ? "shield-checkmark"
                          : role === "staff"
                            ? "briefcase"
                            : "person"
                      }
                      size={14}
                      color={rolePresentation.color}
                    />
                    <Text
                      style={[
                        styles.roleBadgeText,
                        { color: rolePresentation.color },
                      ]}
                    >
                      {rolePresentation.label}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={styles.roleDescription}>
              {rolePresentation.description}
            </Text>

            <View style={styles.heroMetaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="call-outline" size={14} color="#64748B" />
                <Text style={styles.metaChipText}>
                  {profile?.phone || user?.phone || "Chưa xác thực SĐT"}
                </Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="sparkles-outline" size={14} color="#64748B" />
                <Text style={styles.metaChipText}>
                  {role === "admin"
                    ? "Quyền cao nhất"
                    : role === "staff"
                      ? "Nghiệp vụ nội bộ"
                      : "Trải nghiệm mua sắm"}
                </Text>
              </View>
            </View>
          </BezelCard>
        </View>

        {/* Bento Stats Row */}
        <View style={styles.bentoRow}>
          <BentoStat
            label="Điểm thưởng"
            value="2.450"
            icon="star"
            color="#F59E0B"
            delay={100}
          />
          <BentoStat
            label="Hạng thành viên"
            value="Vip 2"
            icon="medal"
            color={Colors.primary}
            delay={200}
          />
        </View>

        {/* Management Islands */}
        {/* Tiện ích mua sắm / Quản lý tài khoản (Hiện chung cho mọi role) */}
        <View style={styles.sectionArea}>
          <View style={styles.eyebrowContainer}>
            <View style={styles.eyebrowPill}>
              <Text style={styles.eyebrowText}>QUẢN LÝ TÀI KHOẢN</Text>
            </View>
          </View>

          <BezelCard
            outerRadius={28}
            outerPadding={6}
            style={styles.islandContainer}
          >
            <ProfileMenuItem
              icon="location-outline"
              label="Địa chỉ giao hàng"
              color="#3B82F6"
              onPress={() => router.push("/profile/addresses" as any)}
            />
            <ProfileMenuItem
              icon="receipt-outline"
              label="Lịch sử đơn hàng"
              color="#10B981"
              onPress={() => router.push("/(tabs)/orders" as any)}
            />
            <ProfileMenuItem
              icon="ticket-outline"
              label="Mã giảm giá của tôi"
              color="#F59E0B"
              onPress={() => router.push("/profile/vouchers" as any)}
              note="Chỉ hiển thị các voucher bạn đã nhận. Muốn lấy thêm voucher, hãy vào Kho Voucher riêng."
              status="available"
            />
            <ProfileMenuItem
              icon="medal-outline"
              label="Điểm thưởng / hạng thành viên"
              color="#8B5CF6"
              note="Cần thêm loyalty point và membership tier từ backend."
              status="blocked"
              isLast
            />
          </BezelCard>
        </View>

        {/* Chức năng tuỳ biến theo vai trò nghiệp vụ (Staff/Admin) */}
        {role !== "customer" && roleMenuItems.length > 0 && (
          <View style={styles.sectionArea}>
            <View style={styles.eyebrowContainer}>
              <View style={styles.eyebrowPill}>
                <Text style={styles.eyebrowText}>CHỨC NĂNG THEO VAI TRÒ</Text>
              </View>
            </View>

            <BezelCard
              outerRadius={28}
              outerPadding={6}
              style={styles.islandContainer}
            >
              {roleMenuItems.map((item, index) => (
                <ProfileMenuItem
                  key={`${role}-${item.label}`}
                  icon={item.icon}
                  label={item.label}
                  color={item.color}
                  onPress={item.onPress}
                  note={item.note}
                  status={item.status}
                  isLast={index === roleMenuItems.length - 1}
                />
              ))}
            </BezelCard>
          </View>
        )}

        <View style={styles.sectionArea}>
          <View style={styles.eyebrowContainer}>
            <View style={styles.eyebrowPill}>
              <Text style={styles.eyebrowText}>CÀI ĐẶT TRẢI NGHIỆM</Text>
            </View>
          </View>

          <BezelCard
            outerRadius={28}
            outerPadding={6}
            style={styles.islandContainer}
          >
            {experienceMenuItems.map((item, index) => {
              if (item.icon === "mail-unread-outline") {
                return (
                  <ProfileMenuItem
                    key={`${role}-${item.label}`}
                    icon={item.icon}
                    label={item.label}
                    color={item.color}
                    note={item.note}
                    status={item.status}
                    isLast={index === experienceMenuItems.length - 1}
                    rightElement={
                      <Switch
                        value={!!profile?.receive_stock_alerts}
                        onValueChange={toggleStockAlerts}
                        disabled={isUpdatingAlerts}
                        trackColor={{ false: "#E5E7EB", true: "#F59E0B" }}
                        thumbColor="#FFFFFF"
                        style={{
                          transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
                        }}
                      />
                    }
                  />
                );
              }

              if (item.icon === "moon-outline") {
                return (
                  <ProfileMenuItem
                    key={`${role}-${item.label}`}
                    icon={item.icon}
                    label={item.label}
                    color={item.color}
                    note={item.note}
                    status={item.status}
                    isLast={index === experienceMenuItems.length - 1}
                    rightElement={
                      <Switch
                        value={isDarkMode}
                        onValueChange={setIsDarkMode}
                        trackColor={{ false: "#E5E7EB", true: Colors.primary }}
                        thumbColor="#FFFFFF"
                        style={{
                          transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
                        }}
                      />
                    }
                  />
                );
              }

              return (
                <ProfileMenuItem
                  key={`${role}-${item.label}`}
                  icon={item.icon}
                  label={item.label}
                  color={item.color}
                  onPress={item.onPress}
                  note={item.note}
                  status={item.status}
                  isLast={index === experienceMenuItems.length - 1}
                />
              );
            })}
          </BezelCard>
        </View>

        {/* Logout Architecture */}
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={() => setShowLogoutModal(true)}
          activeOpacity={0.7}
        >
          <View style={styles.dangerIconBox}>
            <Ionicons name="log-out" size={20} color="#EF4444" />
          </View>
          <Text style={styles.dangerText}>Đăng xuất</Text>
        </TouchableOpacity>

        <Text style={styles.versionInfo}>...</Text>
      </ScrollView>

      {/* Modern Logout Dialog */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.logoutModalPanel}>
            <View style={styles.modalIconHero}>
              <Ionicons name="power" size={32} color="#EF4444" />
            </View>
            <Text style={styles.modalHeading}>Xác nhận đăng xuất</Text>
            <Text style={styles.modalMessage}>
              Hành động này sẽ xóa phiên làm việc hiện tại của bạn. Bạn có muốn
              tiếp tục?
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtnSec, isLoggingOut && { opacity: 0.6 }]}
                disabled={isLoggingOut}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.modalBtnSecText}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPri, isLoggingOut && { opacity: 0.8 }]}
                disabled={isLoggingOut}
                onPress={confirmLogout}
              >
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnPriText}>Đăng xuất</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  scrollContent: {
    paddingBottom: 108,
  },
  spacer: {
    height: 104,
  },
  floatNav: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 16,
    right: 16,
    height: 58,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    zIndex: 100,
    ...Shadow.medium,
    shadowOpacity: 0.12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.12)",
  },
  navAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  navBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#EF4444",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  navBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  outerBezel: {
    backgroundColor: "rgba(148, 163, 184, 0.14)",
  },
  innerCore: {
    backgroundColor: "#FFFFFF",
    flex: 1,
    overflow: "hidden",
  },
  heroSection: {
    marginTop: 8,
    paddingHorizontal: 20,
  },
  heroCardShell: {
    ...Shadow.large,
    shadowOpacity: 0.1,
  },
  heroCardInner: {
    padding: 20,
    backgroundColor: "#FFFFFF",
  },
  heroGlowOrb: {
    position: "absolute",
    top: -26,
    right: -20,
    width: 118,
    height: 118,
    borderRadius: 999,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarPillWrapper: {
    marginRight: 16,
  },
  avatarBezel: {
    width: 96,
    height: 96,
    ...Shadow.large,
    shadowOpacity: 0.08,
  },
  heroAvatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    flex: 1,
    backgroundColor: "#EEF2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  floatingEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  heroTextColumn: {
    flex: 1,
  },
  heroOverline: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#94A3B8",
    marginBottom: 6,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  roleBadgeWrap: {
    marginTop: 10,
    alignItems: "flex-start",
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  roleBadgeText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "700",
  },
  roleDescription: {
    marginTop: 16,
    color: "#64748B",
    fontSize: 13,
    lineHeight: 21,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  phoneTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    gap: 6,
  },
  phoneText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  bentoRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginTop: 18,
    gap: 14,
  },
  statInner: {
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  statIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statValueText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
  },
  statLabelText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
    marginTop: 4,
  },
  sectionArea: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  eyebrowContainer: {
    alignItems: "flex-start",
    marginBottom: 12,
  },
  eyebrowPill: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  eyebrowText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6366F1",
    letterSpacing: 1.2,
  },
  islandContainer: {
    ...Shadow.medium,
    shadowOpacity: 0.06,
  },
  islandItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  islandIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  islandTextWrap: {
    flex: 1,
  },
  islandTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  islandLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  islandNote: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 40,
    backgroundColor: "#FEF2F2",
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  dangerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    ...Shadow.small,
  },
  dangerText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#DC2626",
  },
  versionInfo: {
    textAlign: "center",
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 28,
    fontWeight: "600",
  },
  // Empty State
  emptyShell: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyCard: {
    padding: 40,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 36,
    borderWidth: 6,
    borderColor: "rgba(0,0,0,0.03)",
  },
  emptyHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginTop: 24,
    letterSpacing: -0.5,
  },
  emptySub: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
    marginBottom: 32,
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    paddingVertical: 14,
    paddingLeft: 24,
    paddingRight: 8,
    borderRadius: 100,
  },
  pillButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    marginRight: 16,
  },
  innerPillArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  // Modal Enhancements
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  logoutModalPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 30,
    alignItems: "center",
    width: "100%",
    ...Shadow.large,
  },
  modalIconHero: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  modalHeading: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  modalRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 8,
  },
  modalBtnSec: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  modalBtnSecText: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 15,
  },
  modalBtnPri: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#EF4444",
    alignItems: "center",
  },
  modalBtnPriText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 15,
  },
});
