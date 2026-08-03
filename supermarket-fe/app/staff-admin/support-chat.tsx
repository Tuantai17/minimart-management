import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { Colors, Shadow } from "../../src/constants";
import { adminSupportService } from "../../src/services/admin-support.service";
import type { SupportMessage } from "../../src/services/support.service";

const buildMessageKey = (message: Partial<SupportMessage>) => {
  if (typeof message.id !== "undefined" && message.id !== null) {
    return `id::${String(message.id)}`;
  }

  const senderId = message.sender?.id || message.user?.id || message.customer?.id || "unknown";
  return [message.id, message.message, message.created_at, senderId].join("::");
};

const mergeMessages = (
  currentMessages: SupportMessage[],
  incomingMessages: SupportMessage[],
): SupportMessage[] => {
  const safeCurrent = Array.isArray(currentMessages) ? currentMessages : [];
  const safeIncoming = Array.isArray(incomingMessages) ? incomingMessages : [];

  if (safeIncoming.length === 0) {
    return safeCurrent;
  }

  const mergedMap = new Map<string, SupportMessage>();

  safeCurrent.forEach((message) => {
    mergedMap.set(buildMessageKey(message), message);
  });

  safeIncoming.forEach((message) => {
    mergedMap.set(buildMessageKey(message), message);
  });

  return Array.from(mergedMap.values()).sort(
    (first, second) =>
      new Date(first.created_at || 0).getTime() - new Date(second.created_at || 0).getTime(),
  );
};

const resolveSenderRole = (message: Partial<SupportMessage>): "admin" | "staff" | "customer" => {
  const normalizedRole =
    typeof message.sender?.role === "string" ? message.sender.role.trim().toLowerCase() : "";

  if (normalizedRole === "admin") {
    return "admin";
  }

  if (normalizedRole === "staff") {
    return "staff";
  }

  if (message.is_admin_reply) {
    return "admin";
  }

  return "customer";
};

const getSenderMeta = (message: Partial<SupportMessage>) => {
  const role = resolveSenderRole(message);

  if (role === "admin") {
    return {
      role,
      label: "Admin hỗ trợ",
      bubbleStyle: "admin",
    } as const;
  }

  if (role === "staff") {
    return {
      role,
      label: "Nhân viên",
      bubbleStyle: "staff",
    } as const;
  }

  return {
    role,
    label: "Người dùng",
    bubbleStyle: "customer",
  } as const;
};

export default function AdminSupportChatScreen() {
  const router = useRouter();
  const { ticketId, userName, userAvatar } = useLocalSearchParams<{
    ticketId: string;
    userName: string;
    userAvatar?: string;
  }>();

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const fetchHistory = useCallback(async () => {
    if (!ticketId) return;
    try {
      const data = await adminSupportService.getHistory(ticketId);
      const msgList = Array.isArray(data) ? data : [];
      setMessages((prev) => mergeMessages(prev, msgList));
    } catch (e) {
      console.error("[AdminSupportChat] Lỗi lấy lịch sử:", e);
      setMessages((prev) => (Array.isArray(prev) ? prev : []));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
      
      // Auto polling every 3 seconds to achieve near real-time experience for admin
      const intervalId = setInterval(() => {
        fetchHistory();
      }, 3000);

      return () => {
        clearInterval(intervalId);
      };
    }, [fetchHistory]),
  );

  const handleSend = async () => {
    if (!inputText.trim() || isSending || !ticketId) return;

    const trimmed = inputText.trim();
    const optimisticMessage: SupportMessage = {
      id: Date.now(),
      ticket: Number(ticketId) || 0,
      sender_name: "Admin",
      is_admin_reply: true,
      message: trimmed,
      is_read: true,
      created_at: new Date().toISOString(),
      sender: {
        name: "Admin",
        role: "admin",
      },
    } as SupportMessage;

    try {
      setIsSending(true);
      setMessages((prev) => mergeMessages(prev, [optimisticMessage]));
      const newMsg = await adminSupportService.replyMessage(ticketId, trimmed);

      setMessages((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const filteredPrev = safePrev.filter(
          (message) => buildMessageKey(message) !== buildMessageKey(optimisticMessage),
        );

        return mergeMessages(filteredPrev, [newMsg]);
      });
      setInputText("");
    } catch (e) {
      setMessages((prev) =>
        Array.isArray(prev)
          ? prev.filter(
              (message) => buildMessageKey(message) !== buildMessageKey(optimisticMessage),
            )
          : [],
      );
      console.error("[AdminSupportChat] Gửi lỗi:", e);
    } finally {
      setIsSending(false);
    }
  };

  const userAvatarFromHistory =
    messages.find((message) => !message.is_admin_reply)?.avatar_url || null;

  const resolvedUserAvatar = userAvatar || userAvatarFromHistory || null;
  const fallbackUserAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || "User")}&background=E2E8F0&color=1E293B&bold=true`;
  const headerAvatarUrl = resolvedUserAvatar || fallbackUserAvatar;

  const renderItem = ({ item }: { item: any }) => {
    const senderMeta = getSenderMeta(item);
    const isMyMessage = senderMeta.role === "admin" || senderMeta.role === "staff";
    const senderName =
      item.sender?.name || (isMyMessage ? senderMeta.label : userName || "Người dùng");
    const avatarFromSender = item.sender?.avatar_url || item.avatar_url || null;
    const roleFallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=${isMyMessage ? "2563EB" : "E2E8F0"}&color=${isMyMessage ? "ffffff" : "1E293B"}&bold=true`;
    const finalAvatar =
      avatarFromSender || (!isMyMessage ? resolvedUserAvatar : null) || roleFallbackAvatar;

    return (
      <View
        style={[
          styles.messageRow,
          isMyMessage ? styles.rowRight : styles.rowLeft,
        ]}
      >
        {!isMyMessage && <Image source={{ uri: finalAvatar }} style={styles.avatarLeft} />}

        <View style={styles.messageContent}>
          <View
            style={[
              styles.senderMetaRow,
              isMyMessage ? styles.senderMetaRowRight : styles.senderMetaRowLeft,
            ]}
          >
            <Text style={styles.senderNameText} numberOfLines={1}>
              {senderName}
            </Text>
            <View
              style={[
                styles.senderRoleBadge,
                senderMeta.bubbleStyle === "admin"
                  ? styles.senderRoleBadgeAdmin
                  : senderMeta.bubbleStyle === "staff"
                    ? styles.senderRoleBadgeStaff
                    : styles.senderRoleBadgeCustomer,
              ]}
            >
              <Text
                style={[
                  styles.senderRoleBadgeText,
                  senderMeta.bubbleStyle === "admin"
                    ? styles.senderRoleBadgeAdminText
                    : senderMeta.bubbleStyle === "staff"
                      ? styles.senderRoleBadgeStaffText
                      : styles.senderRoleBadgeCustomerText,
                ]}
              >
                {senderMeta.label}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.bubble,
              senderMeta.bubbleStyle === "admin"
                ? styles.adminBubble
                : senderMeta.bubbleStyle === "staff"
                  ? styles.staffBubble
                  : styles.userBubble,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                isMyMessage ? styles.myText : styles.userText,
              ]}
            >
              {item.message}
            </Text>
          </View>

          <Text
            style={[
              styles.timeText,
              isMyMessage ? styles.timeTextRight : styles.timeTextLeft,
            ]}
          >
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {isMyMessage && <Image source={{ uri: finalAvatar }} style={styles.avatarRight} />}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.navAction}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerEyebrow}>HỘP THƯ HỖ TRỢ</Text>
            <View style={styles.headerUserBox}>
              <Image source={{ uri: headerAvatarUrl }} style={styles.headerAvatar} />
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {userName || "Phòng hỗ trợ"}
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  Theo dõi và phản hồi hội thoại hỗ trợ theo thời gian thực
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerStateBadge}>
            <View style={styles.headerStateDot} />
            <Text style={styles.headerStateText}>Đang theo dõi</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {loading && messages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => buildMessageKey(item)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            onLayout={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.chatHintCard}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#2563EB" />
                <Text style={styles.chatHintText}>
                  Giao diện này giúp admin/staff phân biệt rõ người dùng, nhân viên và admin trong từng tin nhắn.
                </Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={48}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>
                  Chưa có tin nhắn nào trong phòng này.
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.inputContainer}>
          <View style={styles.inputToolbarBadge}>
            <Ionicons name="sparkles-outline" size={16} color="#2563EB" />
          </View>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Nhập nội dung phản hồi cho hội thoại này..."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={500}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isSending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isSending}
            activeOpacity={0.85}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EEF4FF",
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 54 : 24,
    paddingBottom: 18,
    paddingHorizontal: 16,
    backgroundColor: "#1D4ED8",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...Shadow.medium,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  navAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    marginRight: 12,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 1,
    marginBottom: 8,
  },
  headerUserBox: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
    backgroundColor: "#DBEAFE",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(255,255,255,0.78)",
  },
  headerStateBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginLeft: 10,
    marginTop: 20,
  },
  headerStateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#86EFAC",
    marginRight: 6,
  },
  headerStateText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 28,
  },
  chatHintCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    marginBottom: 16,
    ...Shadow.small,
  },
  chatHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#475569",
  },
  emptyContainer: {
    paddingTop: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: 16,
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 18,
    width: "100%",
    alignItems: "flex-end",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  avatarLeft: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E2E8F0",
    marginRight: 8,
  },
  avatarRight: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#BFDBFE",
    marginLeft: 8,
  },
  messageContent: {
    maxWidth: "76%",
  },
  senderMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 6,
  },
  senderMetaRowLeft: {
    justifyContent: "flex-start",
  },
  senderMetaRowRight: {
    justifyContent: "flex-end",
  },
  senderNameText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  senderRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  senderRoleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  senderRoleBadgeAdmin: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  senderRoleBadgeAdminText: {
    color: "#1D4ED8",
  },
  senderRoleBadgeStaff: {
    backgroundColor: "#E0E7FF",
    borderColor: "#C7D2FE",
  },
  senderRoleBadgeStaffText: {
    color: "#4338CA",
  },
  senderRoleBadgeCustomer: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  senderRoleBadgeCustomerText: {
    color: "#475569",
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
  },
  staffBubble: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  adminBubble: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "#0F172A",
  },
  myText: {
    color: "#FFFFFF",
  },
  timeText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 6,
  },
  timeTextLeft: {
    alignSelf: "flex-start",
    marginLeft: 4,
  },
  timeTextRight: {
    alignSelf: "flex-end",
    marginRight: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopWidth: 1,
    borderTopColor: "#DBEAFE",
  },
  inputToolbarBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginRight: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#D6E4FF",
    ...Shadow.small,
  },
  input: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 15,
    color: "#0F172A",
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    ...Shadow.small,
  },
  sendButtonDisabled: {
    backgroundColor: "#BFDBFE",
    shadowOpacity: 0,
  },
});
