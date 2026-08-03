import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { orderService } from "../../src/services/order.service";
import { useAuthStore } from "../../src/store/auth.store";
import type { OrderResponse } from "../../src/types/order.type";
import { formatCurrency, formatDateTime } from "../../src/utils";

type ProfileRole = "customer" | "staff" | "admin";
type ManageableStatus = "PENDING" | "CONFIRMED" | "SHIPPING" | "COMPLETED" | "CANCELLED";
type FeatureStatus = "live" | "ui" | "backend";

type FeatureItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  status: FeatureStatus;
  actionLabel?: string;
  onPress?: () => void;
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

const getRole = ({
  authRole,
  isStaff,
  isSuperuser,
  user,
}: {
  authRole: ProfileRole | null;
  isStaff: boolean;
  isSuperuser: boolean;
  user: {
    is_staff?: boolean;
    is_superuser?: boolean;
  } | null;
}): ProfileRole =>
  isSuperuser || user?.is_superuser
    ? "admin"
    : isStaff || user?.is_staff
      ? "staff"
      : authRole || "customer";

const getStatusMeta = (status: FeatureStatus) => {
  if (status === "live") {
    return {
      label: "Đang dùng",
      color: "#047857",
      backgroundColor: "#DCFCE7",
      borderColor: "#BBF7D0",
    };
  }

  if (status === "ui") {
    return {
      label: "Có khung FE",
      color: "#1D4ED8",
      backgroundColor: "#DBEAFE",
      borderColor: "#BFDBFE",
    };
  }

  return {
    label: "Chờ BE",
    color: "#B45309",
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  };
};

export default function AdminOverviewScreen() {
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const authRole = useAuthStore((state) => state.role);
  const isStaff = useAuthStore((state) => state.isStaff);
  const isSuperuser = useAuthStore((state) => state.isSuperuser);

  const role = getRole({ authRole, isStaff, isSuperuser, user });
  const canAccess = role === "admin";

  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const fetchOverview = useCallback(async (showRefresh = false) => {
    if (!canAccess) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      const data = await orderService.getOrders();
      setOrders(data);
      setLastSyncAt(new Date().toISOString());
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ??
        err?.message ??
        "Không thể tải dữ liệu tổng quan quản trị.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canAccess]);

  useFocusEffect(
    useCallback(() => {
      fetchOverview();
      return undefined;
    }, [fetchOverview]),
  );

  const summary = useMemo(() => {
    const next = {
      total: orders.length,
      pending: 0,
      confirmed: 0,
      shipping: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
    };

    orders.forEach((order) => {
      const status = normalizeStatus(order.status);
      if (status === "PENDING") next.pending += 1;
      if (status === "CONFIRMED") next.confirmed += 1;
      if (status === "SHIPPING") next.shipping += 1;
      if (status === "COMPLETED") {
        next.completed += 1;
        next.revenue += Number(order.total_amount) || 0;
      }
      if (status === "CANCELLED") next.cancelled += 1;
    });

    return next;
  }, [orders]);

  const detectionSignals = useMemo(() => {
    const signals: string[] = [];

    if (isSuperuser || user?.is_superuser) {
      signals.push("is_superuser=true");
    }
    if (isStaff || user?.is_staff) {
      signals.push("is_staff=true");
    }
    if (authRole) {
      signals.push(`authRole=${authRole}`);
    }

    return signals;
  }, [authRole, isStaff, isSuperuser, user?.is_staff, user?.is_superuser]);

  const features = useMemo<FeatureItem[]>(
    () => [
      {
        icon: "grid-outline",
        title: "Tổng quan quyền quản trị",
        description:
          "Màn này đã chạy thật, dùng để xác nhận tài khoản admin và gom các entry point quản trị hiện có.",
        status: "live",
      },
      {
        icon: "list-outline",
        title: "Quản lý đơn hàng vận hành",
        description:
          "Đi vào flow staff/admin đang hoạt động để xem toàn bộ đơn, lọc theo trạng thái và xử lý đơn.",
        status: "live",
        actionLabel: "Mở quản lý đơn",
        onPress: () => router.push("/order/manage" as any),
      },
      {
        icon: "cube-outline",
        title: "Quản lý hàng hóa cơ bản",
        description:
          "Đã có màn quản lý hàng hóa cơ bản để rà tồn kho, lọc trạng thái hàng và mở nhanh sang chi tiết sản phẩm hoặc danh mục.",
        status: "live",
        actionLabel: "Mở quản lý hàng",
        onPress: () => router.push("/profile/inventory-basic" as any),
      },
      {
        icon: "speedometer-outline",
        title: "Dashboard summary",
        description:
          "Đang chờ endpoint GET /api/admin/dashboard/summary/ để lấy total orders, revenue, pending orders và các chỉ số vận hành.",
        status: "backend",
      },
      {
        icon: "download-outline",
        title: "Export tồn kho",
        description:
          "Chưa có API export file tồn kho, nên hiện mới dừng ở mức định nghĩa quyền admin.inventory.export.",
        status: "backend",
      },
      {
        icon: "print-outline",
        title: "In / export đơn hoàn thành",
        description:
          "Chưa có API lấy print-data hoặc export completed orders, nên chưa thể in phiếu hoặc xuất file từ mobile.",
        status: "backend",
      },
      {
        icon: "people-outline",
        title: "Quản lý nhân viên",
        description:
          "Cần backend mở danh sách nhân viên, tạo mới, cập nhật và xóa để frontend có thể làm màn quản trị thật.",
        status: "backend",
      },
      {
        icon: "document-text-outline",
        title: "Báo cáo doanh thu & nhật ký hệ thống",
        description:
          "Thiếu API revenue reports và system logs, nên hiện chưa có service/store và route quản trị tương ứng.",
        status: "backend",
      },
      {
        icon: "chatbubbles-outline",
        title: "Hỗ trợ khách hàng (Support)",
        description:
          "Danh sách phòng chat của khách hàng, phản hồi trực tiếp cho khách.",
        status: "live",
        actionLabel: "Mở hộp thư",
        onPress: () => router.push("/staff-admin/support-tickets" as any),
      },
    ],
    [router],
  );

  const liveCount = features.filter((item) => item.status === "live").length;
  const uiCount = features.filter((item) => item.status === "ui").length;
  const backendCount = features.filter((item) => item.status === "backend").length;

  if (!canAccess) {
    return (
      <View style={styles.container}>
        <AppHeader title="Tổng quan quản trị" showBack />
        <View style={styles.blockedWrap}>
          <View style={styles.blockedIconBox}>
            <Ionicons name="shield-checkmark-outline" size={42} color="#7C3AED" />
          </View>
          <Text style={styles.blockedTitle}>Bạn không có quyền truy cập</Text>
          <Text style={styles.blockedText}>
            Màn này chỉ dành cho tài khoản admin. Điều kiện hiện tại là `is_superuser = true`
            hoặc role đã được đồng bộ thành `admin`.
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
      <AppHeader title="Tổng quan quản trị" showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchOverview(true)} />
        }
        contentContainerStyle={styles.content}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="shield-checkmark" size={26} color="#7C3AED" />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroOverline}>ADMIN OVERVIEW</Text>
              <Text style={styles.heroTitle}>
                {user?.full_name || user?.name || user?.username || "Quản trị viên"}
              </Text>
              <Text style={styles.heroSubtext}>
                Tài khoản này đang được FE nhận diện là admin và có thể đi vào flow quản lý đơn
                hàng hiện có.
              </Text>
            </View>
          </View>

          <View style={styles.signalRow}>
            {detectionSignals.map((signal) => (
              <View key={signal} style={styles.signalChip}>
                <Text style={styles.signalChipText}>{signal}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.heroNote}>
            Thứ tự suy ra role hiện tại: `is_superuser` → `is_staff` → `authRole` → `customer`.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tình trạng hiện tại</Text>
          <Text style={styles.sectionCaption}>
            {lastSyncAt ? `Đồng bộ ${formatDateTime(lastSyncAt)}` : "Chưa có thời điểm đồng bộ"}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{summary.total}</Text>
            <Text style={styles.statLabel}>Tổng đơn truy cập được</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{summary.pending}</Text>
            <Text style={styles.statLabel}>Đơn chờ xử lý</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{summary.completed}</Text>
            <Text style={styles.statLabel}>Đơn hoàn thành</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatCurrency(summary.revenue)}</Text>
            <Text style={styles.statLabel}>Doanh thu hoàn thành</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tải số liệu đơn hàng hiện có...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Không tải được dữ liệu vận hành</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => fetchOverview()}
              activeOpacity={0.85}
            >
              <Text style={styles.retryButtonText}>Tải lại</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Snapshot capability</Text>
          <Text style={styles.sectionCaption}>
            {liveCount} đang dùng, {uiCount} có khung FE, {backendCount} chờ BE
          </Text>
        </View>

        <View style={styles.featureList}>
          {features.map((item) => {
            const statusMeta = getStatusMeta(item.status);

            return (
              <View key={item.title} style={styles.featureCard}>
                <View style={styles.featureHeader}>
                  <View style={styles.featureIconBox}>
                    <Ionicons name={item.icon} size={20} color="#334155" />
                  </View>
                  <View style={styles.featureTitleWrap}>
                    <Text style={styles.featureTitle}>{item.title}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: statusMeta.backgroundColor,
                          borderColor: statusMeta.borderColor,
                        },
                      ]}
                    >
                      <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                        {statusMeta.label}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.featureDescription}>{item.description}</Text>
                {item.onPress ? (
                  <TouchableOpacity
                    style={styles.featureAction}
                    onPress={item.onPress}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.featureActionText}>
                      {item.actionLabel || "Mở chức năng"}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Entry point khả dụng</Text>
          <Text style={styles.sectionCaption}>Các luồng FE đang vào được ngay</Text>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => router.push("/order/manage" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="receipt-outline" size={22} color="#2563EB" />
            <Text style={styles.quickActionTitle}>Quản lý đơn hàng</Text>
            <Text style={styles.quickActionText}>
              Xem các nhóm trạng thái, số lượng đơn và doanh thu đơn hoàn thành.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => router.push("/(tabs)/profile" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-circle-outline" size={22} color="#7C3AED" />
            <Text style={styles.quickActionTitle}>Quay lại profile</Text>
            <Text style={styles.quickActionText}>
              Kiểm tra lại section quyền theo vai trò và các tiện ích tài khoản hiện tại.
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: Spacing.base,
    paddingBottom: Spacing.xxl,
    gap: Spacing.base,
  },
  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#E9D5FF",
    ...Shadow.medium,
  },
  heroTopRow: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: {
    flex: 1,
    gap: 4,
  },
  heroOverline: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: "#7C3AED",
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  heroSubtext: {
    fontSize: FontSize.base,
    lineHeight: 20,
    color: "#475569",
  },
  signalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.base,
  },
  signalChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: "#F1F5F9",
  },
  signalChipText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: "#334155",
  },
  heroNote: {
    marginTop: Spacing.md,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: "#64748B",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.md,
  },
  sectionTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  sectionCaption: {
    fontSize: FontSize.sm,
    color: "#64748B",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statCard: {
    width: "47.5%",
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Shadow.small,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  statLabel: {
    fontSize: FontSize.sm,
    lineHeight: 18,
    color: "#64748B",
  },
  loadingCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.base,
    color: "#475569",
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: Spacing.sm,
  },
  errorTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: "#991B1B",
  },
  errorText: {
    fontSize: FontSize.base,
    lineHeight: 20,
    color: "#7F1D1D",
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: Colors.error,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryButtonText: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.white,
  },
  featureList: {
    gap: Spacing.md,
  },
  featureCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: Spacing.md,
    ...Shadow.small,
  },
  featureHeader: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  featureIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitleWrap: {
    flex: 1,
    gap: 8,
  },
  featureTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  featureDescription: {
    fontSize: FontSize.base,
    lineHeight: 20,
    color: "#475569",
  },
  featureAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  featureActionText: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.white,
  },
  quickActions: {
    gap: Spacing.md,
  },
  quickActionCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: Spacing.sm,
    ...Shadow.small,
  },
  quickActionTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  quickActionText: {
    fontSize: FontSize.base,
    lineHeight: 20,
    color: "#64748B",
  },
  blockedWrap: {
    flex: 1,
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.base,
  },
  blockedIconBox: {
    width: 80,
    height: 80,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3E8FF",
  },
  blockedTitle: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  blockedText: {
    fontSize: FontSize.base,
    lineHeight: 22,
    color: "#64748B",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  primaryButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },
});
