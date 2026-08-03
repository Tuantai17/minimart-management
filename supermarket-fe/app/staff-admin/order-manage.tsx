import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { orderService } from "../../src/services/order.service";
import { useAuthStore } from "../../src/store/auth.store";
import type { OrderResponse } from "../../src/types/order.type";
import { formatCurrency } from "../../src/utils";

type ProfileRole = "customer" | "staff" | "admin";
type OrderTabKey =
  | "ALL"
  | "PENDING"
  | "CONFIRMED"
  | "SHIPPING"
  | "COMPLETED"
  | "CANCELLED";

type ManageableStatus = Exclude<OrderTabKey, "ALL">;

const STATUS_META: Record<
  ManageableStatus,
  {
    label: string;
    description: string;
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  PENDING: {
    label: "Chờ xác nhận",
    description: "Đơn mới tạo, cần nhân viên tiếp nhận và xác nhận xử lý.",
    color: "#D97706",
    bg: "#FEF3C7",
    icon: "time-outline",
  },
  CONFIRMED: {
    label: "Đã xác nhận",
    description: "Đơn đã được kiểm tra và sẵn sàng cho bước vận hành tiếp theo.",
    color: "#2563EB",
    bg: "#DBEAFE",
    icon: "checkmark-circle-outline",
  },
  SHIPPING: {
    label: "Đang giao",
    description: "Đơn đang trong quá trình giao đến khách hàng.",
    color: "#EA580C",
    bg: "#FFEDD5",
    icon: "car-outline",
  },
  COMPLETED: {
    label: "Hoàn thành",
    description: "Đơn đã giao thành công và có thể tổng hợp doanh thu.",
    color: "#16A34A",
    bg: "#DCFCE7",
    icon: "bag-check-outline",
  },
  CANCELLED: {
    label: "Đã hủy",
    description: "Đơn bị hủy và cần kiểm tra lại nguyên nhân nếu cần.",
    color: "#DC2626",
    bg: "#FEE2E2",
    icon: "close-circle-outline",
  },
};

const STATUS_ORDER: ManageableStatus[] = [
  "PENDING",
  "CONFIRMED",
  "SHIPPING",
  "COMPLETED",
  "CANCELLED",
];

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

const getRolePresentation = (role: ProfileRole) => {
  if (role === "admin") {
    return {
      label: "Admin Console",
      description: "Mở nhanh từng nhóm đơn hàng để kiểm tra và xử lý theo trạng thái.",
      accent: "#7C3AED",
      icon: "shield-checkmark-outline" as const,
    };
  }

  if (role === "staff") {
    return {
      label: "Staff Operations",
      description: "Mở nhanh từng nhóm đơn hàng để xử lý đúng tiến trình vận hành.",
      accent: "#2563EB",
      icon: "briefcase-outline" as const,
    };
  }

  return {
    label: "Customer",
    description: "Chế độ người dùng thông thường.",
    accent: "#10B981",
    icon: "person-outline" as const,
  };
};

export default function StaffOrdersManageScreen() {
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const authRole = useAuthStore((state) => state.role);
  const isStaff = useAuthStore((state) => state.isStaff);
  const isSuperuser = useAuthStore((state) => state.isSuperuser);

  const role: ProfileRole = isSuperuser || user?.is_superuser
    ? "admin"
    : isStaff || user?.is_staff
      ? "staff"
      : authRole || "customer";

  const rolePresentation = getRolePresentation(role);
  const canManageOrders = role === "staff" || role === "admin";

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderCodeKeyword, setOrderCodeKeyword] = useState("");

  const handleOrderCodeSearch = useCallback(() => {
    const normalizedKeyword = orderCodeKeyword.trim();

    if (!normalizedKeyword) {
      router.push("/staff-admin/order-status?status=ALL" as any);
      return;
    }

    router.push(
      `/staff-admin/order-status?status=ALL&keyword=${encodeURIComponent(normalizedKeyword)}` as any,
    );
  }, [orderCodeKeyword, router]);

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
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.message ??
        "Không thể tải danh sách đơn hàng.";
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

  const summary = useMemo(() => {
    const counts = {
      total: orders.length,
      pending: 0,
      confirmed: 0,
      shipping: 0,
      completed: 0,
      cancelled: 0,
    };

    orders.forEach((order) => {
      const status = normalizeStatus(order.status);
      if (status === "PENDING") counts.pending += 1;
      if (status === "CONFIRMED") counts.confirmed += 1;
      if (status === "SHIPPING") counts.shipping += 1;
      if (status === "COMPLETED") counts.completed += 1;
      if (status === "CANCELLED") counts.cancelled += 1;
    });

    return counts;
  }, [orders]);

  const totalRevenue = useMemo(() => {
    return orders
      .filter((order) => normalizeStatus(order.status) === "COMPLETED")
      .reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
  }, [orders]);

  if (!canManageOrders) {
    return (
      <View style={styles.container}>
        <AppHeader title="Quản lý đơn hàng" showBack />
        <View style={styles.blockedWrap}>
          <View style={styles.blockedIconBox}>
            <Ionicons name="shield-checkmark-outline" size={42} color={Colors.primary} />
          </View>
          <Text style={styles.blockedTitle}>Bạn không có quyền truy cập</Text>
          <Text style={styles.blockedText}>
            Trang này chỉ dành cho nhân viên hoặc quản trị viên để quản lý đơn hàng.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace("/(tabs)/profile" as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Quay về trang cá nhân</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title="Quản lý đơn hàng" showBack />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchOrders(true)}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.consoleHero}>
          <View style={styles.heroGlow} />

          <View style={styles.consoleTopRow}>
            <View style={styles.consoleTitleWrap}>
              <Text style={styles.consoleEyebrow}>ORDER OPERATIONS CENTER</Text>
              <Text style={styles.consoleTitle}>Staff Order Manager</Text>
              <Text style={styles.consoleDescription}>{rolePresentation.description}</Text>
            </View>

            <View
              style={[
                styles.rolePill,
                { backgroundColor: rolePresentation.accent + "16" },
              ]}
            >
              <Ionicons
                name={rolePresentation.icon}
                size={16}
                color={rolePresentation.accent}
              />
              <Text style={[styles.rolePillText, { color: rolePresentation.accent }]}>
                {rolePresentation.label}
              </Text>
            </View>
          </View>

          <View style={styles.heroStatsGrid}>
            <DashboardStatCard
              icon="albums-outline"
              label="Tổng đơn"
              value={String(summary.total)}
              accent="#2563EB"
              onPress={() => router.push("/staff-admin/order-status?status=ALL" as any)}
            />
            <DashboardStatCard
              icon="time-outline"
              label="Chờ xác nhận"
              value={String(summary.pending)}
              accent="#D97706"
              onPress={() => router.push("/staff-admin/order-status?status=PENDING" as any)}
            />
            <DashboardStatCard
              icon="checkmark-circle-outline"
              label="Đã xác nhận"
              value={String(summary.confirmed)}
              accent="#2563EB"
              onPress={() => router.push("/staff-admin/order-status?status=CONFIRMED" as any)}
            />
            <DashboardStatCard
              icon="car-outline"
              label="Đang giao"
              value={String(summary.shipping)}
              accent="#EA580C"
              onPress={() => router.push("/staff-admin/order-status?status=SHIPPING" as any)}
            />
            <DashboardStatCard
              icon="bag-check-outline"
              label="Hoàn thành"
              value={String(summary.completed)}
              accent="#16A34A"
              onPress={() => router.push("/staff-admin/order-status?status=COMPLETED" as any)}
            />
            <DashboardStatCard
              icon="close-circle-outline"
              label="Đã hủy"
              value={String(summary.cancelled)}
              accent="#DC2626"
              onPress={() => router.push("/staff-admin/order-status?status=CANCELLED" as any)}
            />
          </View>

          <View style={styles.searchPanel}>
            <View style={styles.searchPanelHeader}>
              <Text style={styles.searchPanelTitle}>Tìm nhanh mã đơn hàng</Text>
              <Text style={styles.searchPanelHint}>Nhập mã đơn để mở đúng danh sách cần kiểm tra.</Text>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
              <TextInput
                value={orderCodeKeyword}
                onChangeText={setOrderCodeKeyword}
                placeholder="Ví dụ: ORD-00125"
                placeholderTextColor={Colors.textLight}
                style={styles.searchInput}
                autoCapitalize="characters"
                returnKeyType="search"
                onSubmitEditing={handleOrderCodeSearch}
              />
              {orderCodeKeyword ? (
                <TouchableOpacity
                  onPress={() => setOrderCodeKeyword("")}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.searchSubmitButton}
              onPress={handleOrderCodeSearch}
              activeOpacity={0.88}
            >
              <Ionicons name="arrow-forward-outline" size={18} color={Colors.white} />
              <Text style={styles.searchSubmitButtonText}>Tìm đơn hàng</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.revenueBar}>
            <View>
              <Text style={styles.revenueLabel}>Doanh thu đơn hoàn thành</Text>
              <Text style={styles.revenueValue}>{formatCurrency(totalRevenue)}</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshGhostButton}
              onPress={() => fetchOrders(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
              <Text style={styles.refreshGhostText}>Làm mới</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

function DashboardStatCard({
  icon,
  label,
  value,
  accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.86}>
      <View style={[styles.statIconWrap, { backgroundColor: accent + "14" }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEF3F9",
  },
  content: {
    padding: Spacing.base,
    paddingBottom: 42,
  },

  blockedWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  blockedIconBox: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: "#EAF1FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.base,
  },
  blockedTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  blockedText: {
    fontSize: FontSize.base,
    lineHeight: 24,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },

  consoleHero: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    ...Shadow.medium,
  },
  heroGlow: {
    position: "absolute",
    top: -30,
    right: -20,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
  },
  consoleTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: Spacing.lg,
  },
  consoleTitleWrap: {
    flex: 1,
  },
  consoleEyebrow: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  consoleTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  consoleDescription: {
    fontSize: FontSize.base,
    lineHeight: 24,
    color: Colors.textSecondary,
    maxWidth: 280,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  rolePillText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
  },
  heroStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: "47%",
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  revenueBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 22,
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
  },
  revenueLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: FontSize.lg,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  refreshGhostButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: "#EEF4FF",
  },
  refreshGhostText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.primary,
  },


  searchPanel: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 22,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  searchPanelHeader: {
    marginBottom: 12,
  },
  searchPanelTitle: {
    fontSize: FontSize.base,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  searchPanelHint: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    paddingVertical: 13,
  },
  searchSubmitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  searchSubmitButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.white,
  },

  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },
  loadingText: {
    marginTop: 12,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
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
  retryButton: {
    backgroundColor: "#FEE2E2",
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: "#B91C1C",
  },

});
