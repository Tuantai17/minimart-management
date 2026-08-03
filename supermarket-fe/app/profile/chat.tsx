import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { useChat } from "../../src/hooks/useChat";
import { useAuthStore, useProfileStore } from "../../src/store";
import { SupportMessage } from "../../src/services/support.service";

const buildRenderMessageKey = (message: Partial<SupportMessage>, index: number) => {
  if (typeof message.id !== "undefined" && message.id !== null) {
    return `id::${String(message.id)}`;
  }

  const senderId = message.sender?.id || message.user?.id || message.customer?.id || "unknown";
  return [index, message.message, message.created_at, senderId].join("::");
};

export default function ChatScreen() {
  const router = useRouter();
  const { messages, loading, sendMessage } = useChat();
  const profile = useProfileStore((state) => state.profile);
  const fetchProfile = useProfileStore((state) => state.fetchProfile);
  const authProfile = useAuthStore((state) => state.profile);
  const currentUser = useAuthStore((state) => state.user);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const hasAvatar =
      Boolean(profile?.avatar_url) ||
      Boolean(authProfile?.avatar_url) ||
      Boolean(currentUser?.avatar_url) ||
      Boolean(currentUser?.avatar);

    if (!hasAvatar && currentUser?.id) {
      void fetchProfile().catch((error) => {
        console.error("[ChatScreen] Failed to fetch profile for avatar:", error);
      });
    }
  }, [
    authProfile?.avatar_url,
    currentUser?.avatar,
    currentUser?.avatar_url,
    currentUser?.id,
    fetchProfile,
    profile?.avatar_url,
  ]);

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    try {
      setIsSending(true);
      await sendMessage(inputText);
      setInputText("");
    } catch (e) {
      console.log("Send feedback failed", e);
    } finally {
      setIsSending(false);
    }
  };

  const renderItem = ({ item }: { item: SupportMessage }) => {
    // Với Customer: Của Customer thì ở bên PHẢI, của Admin thì ở bên TRÁI
    const isMyMessage = !item.is_admin_reply;

    const adminAvatarUrl = "https://ui-avatars.com/api/?name=Admin&background=F59E0B&color=fff&bold=true";
    const userDisplayName =
      profile?.name ||
      authProfile?.name ||
      currentUser?.name ||
      currentUser?.full_name ||
      currentUser?.username ||
      profile?.email ||
      authProfile?.email ||
      currentUser?.email ||
      "Me";
    const userAvatarUrl =
      profile?.avatar_url ||
      authProfile?.avatar_url ||
      currentUser?.avatar_url ||
      currentUser?.avatar ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(userDisplayName)}&background=3B82F6&color=fff&bold=true`;

    return (
      <View
        style={[
          styles.messageRow,
          isMyMessage ? styles.rowRight : styles.rowLeft,
        ]}
      >
        {!isMyMessage && (
          <Image source={{ uri: adminAvatarUrl }} style={styles.avatarLeft} />
        )}
        <View style={styles.messageContent}>
          <View
            style={[
              styles.bubble,
              isMyMessage ? styles.myBubble : styles.userBubble,
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
          <Text style={[styles.timeText, isMyMessage && { alignSelf: 'flex-end', marginRight: 4 }]}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        {isMyMessage && (
          <Image source={{ uri: userAvatarUrl }} style={styles.avatarRight} />
        )}
      </View>
    );
  };

  const headerAvatarUrl = "https://ui-avatars.com/api/?name=NV&background=E2E8F0&color=1E293B&bold=true";

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.navAction}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerUserBox}>
          <Image source={{ uri: headerAvatarUrl }} style={styles.headerAvatar} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            Hỗ trợ trực tuyến
          </Text>
        </View>

        <View style={styles.navActionRight} />
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
            keyExtractor={(item, index) => buildRenderMessageKey(item, index)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            onLayout={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={48}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>
                  Hãy để lại lời nhắn, chúng tôi sẽ hỗ trợ bạn sớm nhất!
                </Text>
              </View>
            }
          />
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="camera" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="add-circle" size={28} color="#FF5252" />
          </TouchableOpacity>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Nhập tin nhắn..."
              placeholderTextColor="#9CA3AF"
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
            activeOpacity={0.8}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
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
    backgroundColor: "#FDFDFD",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
    backgroundColor: Colors.primary,
    zIndex: 10,
  },
  navAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  navActionRight: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  headerUserBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#E2E8F0',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
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
    padding: 16,
    paddingBottom: 24,
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: 16,
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 16,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F59E0B", // Orange/Yellow for staff
    marginRight: 8,
  },
  avatarRight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3B82F6", // Blue for user
    marginLeft: 8,
  },
  messageContent: {
    maxWidth: "70%",
  },
  bubble: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24, // Pill shape
  },
  userBubble: {
    backgroundColor: "#F3F4F6", // Light gray
  },
  myBubble: {
    backgroundColor: Colors.primary, // App primary color
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "#1F2937",
  },
  myText: {
    color: "#FFFFFF",
  },
  timeText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingBottom: Platform.OS === "ios" ? 30 : 12,
    backgroundColor: "#F9FAFB", // Light grey footer
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  iconButton: {
    padding: 4,
    marginRight: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginRight: 12,
    ...Shadow.small,
  },
  input: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 40,
    maxHeight: 120,
    fontSize: 15,
    color: "#111827",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Shadow.small,
  },
  sendButtonDisabled: {
    backgroundColor: "#D1D5DB",
    shadowOpacity: 0,
  },
});
