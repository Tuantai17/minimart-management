import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { useNotificationStore } from "../../src/store";
import type { AppNotification } from "../../src/types";
import { formatDate } from "../../src/utils";

// ─── Icon & color per notification type ────────────────────────────────────
const TYPE_META: Record<
  NonNullable<AppNotification["type"]>,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  order_update: { icon: "receipt-outline", color: "#2563EB", bg: "#EFF6FF" },
  success: { icon: "checkmark-circle-outline", color: "#059669", bg: "#ECFDF5" },
  error: { icon: "alert-circle-outline", color: "#DC2626", bg: "#FEF2F2" },
  info: { icon: "information-circle-outline", color: "#6366F1", bg: "#EEF2FF" },
};

const DEFAULT_META = TYPE_META.info;

// ─── Notification Item ──────────────────────────────────────────────────────
function NotificationItem({
  item,
  onMarkRead,
}: {
  item: AppNotification;
  onMarkRead: (id: string) => void;
}) {
  const meta = TYPE_META[item.type ?? "info"] ?? DEFAULT_META;

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={() => !item.is_read && onMarkRead(item.id)}
      style={[styles.itemCard, !item.is_read && styles.itemCardUnread]}
    >
      {/* Unread indicator */}
      {!item.is_read && <View style={styles.unreadDot} />}

      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>

      {/* Content */}
      <View style={styles.itemContent}>
        <Text style={[styles.itemTitle, !item.is_read && styles.itemTitleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.itemMessage} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={styles.itemTime}>{formatDate(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────
function EmptyState() {
  const addNotification = useNotificationStore((s) => s.addNotification);

  const handleTest = () => {
    addNotification({
      title: "Đơn hàng #DH1002 đang giao",
      message: "Đơn hàng của bạn đã được giao cho đơn vị vận chuyển.",
      type: "order_update"
    });
    addNotification({
      title: "Cập nhật thành công",
      message: "Thông tin cá nhân của bạn đã được thay đổi thành công.",
      type: "success"
    });
  };

  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="notifications-off-outline" size={40} color={Colors.textLight} />
      </View>
      <Text style={styles.emptyTitle}>Chưa có thông báo</Text>
      <Text style={styles.emptyDesc}>
        Các thông báo về đơn hàng và khuyến mãi sẽ xuất hiện ở đây.
      </Text>
      <TouchableOpacity onPress={handleTest} style={{ marginTop: 20, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: Colors.primary, borderRadius: Radius.md }}>
        <Text style={{ color: 'white', fontWeight: 'bold' }}>Tạo thông báo test (Để chụp báo cáo)</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearNotifications = useNotificationStore((s) => s.clearNotifications);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Thông báo</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.actionBtn} onPress={markAllAsRead}>
              <Ionicons name="checkmark-done-outline" size={18} color={Colors.primary} />
              <Text style={styles.actionBtnText}>Đọc tất cả</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity style={styles.actionBtn} onPress={clearNotifications}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem item={item} onMarkRead={markAsRead} />
        )}
        ListEmptyComponent={<EmptyState />}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    ...Shadow.small,
    shadowOpacity: 0.06,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerBadge: {
    marginLeft: Spacing.xs,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: "800",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    gap: 4,
  },
  actionBtnText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: "600",
  },
  listContent: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 8,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    position: "relative",
    ...Shadow.small,
    shadowOpacity: 0.05,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderLight,
  },
  itemCardUnread: {
    borderColor: "#C7D2FE",
    backgroundColor: "#FAFBFF",
  },
  unreadDot: {
    position: "absolute",
    top: Spacing.md,
    left: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6366F1",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
    marginLeft: 4,
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  itemTitleUnread: {
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  itemMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  itemTime: {
    fontSize: 11,
    color: Colors.textLight,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: 80,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.borderLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptyDesc: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
