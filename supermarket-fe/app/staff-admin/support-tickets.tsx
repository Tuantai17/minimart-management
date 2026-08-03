import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    AppState,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import {
    adminSupportService,
    SupportTicket,
} from "../../src/services/admin-support.service";
import { formatDateTime } from "../../src/utils";

const normalizeRole = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveLastSenderRole = (ticket: SupportTicket): string => {
  const directRole = normalizeRole(ticket.last_sender?.role);
  if (directRole) {
    return directRole;
  }

  if (ticket.last_sender?.is_superuser) {
    return "admin";
  }

  if (ticket.last_sender?.is_staff) {
    return "staff";
  }

  return "customer";
};

const buildPreviewText = (ticket: SupportTicket): string => {
  const preview =
    ticket.last_message_preview ||
    ticket.last_message ||
    ticket.message ||
    "Chưa có tin nhắn";

  if (!preview || preview === "Chưa có tin nhắn") {
    return preview;
  }

  const lastSenderRole = resolveLastSenderRole(ticket);
  const senderPrefix =
    lastSenderRole === "admin"
      ? "Admin"
      : lastSenderRole === "staff"
        ? "Nhân viên"
        : "Khách";

  return `${senderPrefix}: ${preview}`;
};

const resolveTicketOwnerRole = (ticket: SupportTicket): string => {
  const ownerRole = normalizeRole(ticket.owner?.role || ticket.role);
  if (ownerRole) {
    return ownerRole;
  }

  if (ticket.owner?.is_superuser || ticket.is_superuser) {
    return "admin";
  }

  if (ticket.owner?.is_staff || ticket.is_staff) {
    return "staff";
  }

  return "customer";
};

const buildOwnerRoleLabel = (ticket: SupportTicket): string => {
  const ownerRole = resolveTicketOwnerRole(ticket);

  return ownerRole === "admin"
    ? "Quản trị viên"
    : ownerRole === "staff"
      ? "Nhân viên"
      : "Người dùng";
};

export default function SupportTicketsScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await adminSupportService.getTickets();
      // Đưa ticket chưa resolve (false) lên đầu
      const sorted = data.sort((a: any, b: any) => {
        const isResolvedA = a.is_resolved === true || a.is_resolved === "true";
        const isResolvedB = b.is_resolved === true || b.is_resolved === "true";

        if (isResolvedA === isResolvedB) {
          const timeA = new Date(
            a.last_message_time || a.updated_at || a.created_at || 0,
          ).getTime();
          const timeB = new Date(
            b.last_message_time || b.updated_at || b.created_at || 0,
          ).getTime();
          return timeB - timeA;
        }
        return isResolvedA ? 1 : -1;
      });
      setTickets(sorted);
    } catch (err: any) {
      console.error("[SupportTickets] Error fetching tickets:", err);
      setError("Không thể tải danh sách tài khoản cần hỗ trợ.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTickets();

      const intervalId = setInterval(() => {
        fetchTickets(true);
      }, 3000);

      const appStateSubscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (nextAppState === "active") {
            void fetchTickets(true);
          }
        },
      );

      const handleWindowFocus = () => {
        void fetchTickets(true);
      };

      const handleVisibilityChange = () => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          void fetchTickets(true);
        }
      };

      const canListenWindowFocus =
        typeof window !== "undefined" &&
        typeof window.addEventListener === "function";
      const canRemoveWindowFocus =
        typeof window !== "undefined" &&
        typeof window.removeEventListener === "function";
      const canListenDocumentVisibility =
        typeof document !== "undefined" &&
        typeof document.addEventListener === "function";
      const canRemoveDocumentVisibility =
        typeof document !== "undefined" &&
        typeof document.removeEventListener === "function";

      if (canListenWindowFocus) {
        window.addEventListener("focus", handleWindowFocus);
      }

      if (canListenDocumentVisibility) {
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }

      return () => {
        clearInterval(intervalId);
        appStateSubscription.remove();

        if (canRemoveWindowFocus) {
          window.removeEventListener("focus", handleWindowFocus);
        }

        if (canRemoveDocumentVisibility) {
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
          );
        }
      };
    }, [fetchTickets]),
  );

  const renderTicket = ({ item }: { item: any }) => {
    // API có thể nhóm bằng SupportMessage nên trả về item.ticket thay vì id
    // và trạng thái resolves có thể ko đúng tuỳ API
    const isWaiting =
      item.is_resolved === false || item.is_resolved === "false";
    const ticketId = item.id || item.ticket || item.ticket_id;

    const userName =
      item.owner?.name ||
      item.owner?.email ||
      item.user_name ||
      item.customer_name ||
      item.user_info?.name ||
      `Khách hàng #${item.user || ticketId || "?"}`;

    const userAvatar = item.owner?.avatar_url || item.avatar_url || null;
    const ownerRoleLabel = buildOwnerRoleLabel(item);
    const lastSenderRole = resolveLastSenderRole(item);
    const messagePreview = buildPreviewText(item);
    const displayTime =
      item.last_message_time || item.updated_at || item.created_at;
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || "User")}&background=E2E8F0&color=1E293B&bold=true`;

    return (
      <TouchableOpacity
        style={[styles.ticketCard, isWaiting && styles.ticketCardActive]}
        onPress={() =>
          router.push({
            pathname: "/staff-admin/support-chat" as any,
            params: {
              ticketId: ticketId,
              userName: userName,
              userAvatar: userAvatar,
            },
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.ticketIconBox}>
          <Image
            source={{
              uri: userAvatar || fallbackAvatar,
            }}
            style={styles.ticketAvatar}
          />
          {isWaiting && <View style={styles.badgeDot} />}
        </View>

        <View style={styles.ticketInfo}>
          <View style={styles.ticketHeaderRow}>
            <View style={styles.headerMainInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {userName}
              </Text>
              <Text style={styles.ownerRoleText} numberOfLines={1}>
                Loại tài khoản: {ownerRoleLabel}
              </Text>
            </View>
            <Text style={styles.timeText}>
              {displayTime ? formatDateTime(displayTime) : ""}
            </Text>
          </View>
          <Text style={styles.previewText} numberOfLines={1}>
            {messagePreview}
          </Text>
          <View style={styles.ticketFooterRow}>
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.roleBadge,
                  lastSenderRole === "staff"
                    ? styles.roleStaff
                    : lastSenderRole === "admin"
                      ? styles.roleAdmin
                      : styles.roleCustomer,
                ]}
              >
                <Text
                  style={[
                    styles.roleBadgeText,
                    lastSenderRole === "staff"
                      ? styles.roleStaffText
                      : lastSenderRole === "admin"
                        ? styles.roleAdminText
                        : styles.roleCustomerText,
                  ]}
                >
                  {lastSenderRole === "staff"
                    ? "Tin cuối: Nhân viên"
                    : lastSenderRole === "admin"
                      ? "Tin cuối: Admin"
                      : "Tin cuối: Khách"}
                </Text>
              </View>
              <Text
                style={[
                  styles.statusText,
                  isWaiting ? styles.statusWait : styles.statusDone,
                  { marginLeft: 8 },
                ]}
              >
                {isWaiting ? "Cần hỗ trợ" : "Đã phản hồi"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#6B7280" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Hộp thư Hỗ trợ" showBack />

      {error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchTickets()}
          >
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item, index) =>
            (item?.id || item?.ticket || item?.ticket_id)?.toString() ||
            index.toString()
          }
          renderItem={renderTicket}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchTickets(true)}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator
                size="large"
                color={Colors.primary}
                style={{ marginTop: 40 }}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={60}
                  color={Colors.border}
                />
                <Text style={styles.emptyText}>Chưa có yêu cầu hỗ trợ nào</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC", // bg slate 50
  },
  listContent: {
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  ticketCard: {
    flexDirection: "row",
    backgroundColor: Colors.white,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    ...Shadow.small,
  },
  ticketCardActive: {
    borderColor: "#FECACA", // red 200
    backgroundColor: "#FEF2F2", // red 50
  },
  ticketIconBox: {
    marginRight: Spacing.md,
    position: "relative",
  },
  ticketAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
  },
  badgeDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    backgroundColor: Colors.error,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  ticketInfo: {
    flex: 1,
    gap: 4,
  },
  previewText: {
    fontSize: FontSize.sm,
    color: "#6B7280",
  },
  ticketHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerMainInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  userName: {
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  ownerRoleText: {
    marginTop: 2,
    fontSize: FontSize.xs,
    color: "#64748B",
    fontWeight: "500",
  },
  timeText: {
    fontSize: FontSize.xs,
    color: "#6B7280",
  },
  ticketFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusText: {
    fontSize: FontSize.sm,
    fontWeight: "500",
  },
  statusWait: {
    color: Colors.error,
  },
  statusDone: {
    color: Colors.success,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  roleCustomer: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  roleCustomerText: {
    color: "#2563EB",
  },
  roleStaff: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  roleStaffText: {
    color: "#D97706",
  },
  roleAdmin: {
    backgroundColor: "#F3E8FF",
    borderColor: "#E9D5FF",
  },
  roleAdminText: {
    color: "#9333EA",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  errorText: {
    fontSize: FontSize.base,
    color: Colors.error,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: "#6B7280",
  },
});
