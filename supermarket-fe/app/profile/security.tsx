import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, Shadow } from "../../src/constants";

type SecurityItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
  isLast?: boolean;
};

const SecurityItem = ({
  icon,
  title,
  subtitle,
  color,
  onPress,
  isLast = false,
}: SecurityItemProps) => {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.row, isLast && styles.rowLast]}
    >
      <View style={[styles.rowIcon, { backgroundColor: color + "14" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.rowArrow}>
        <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
};

export default function SecurityCenterScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.floatNav}>
        <TouchableOpacity
          style={styles.navAction}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Bảo mật & Quyền riêng tư</Text>
        <View style={styles.navActionEmpty} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.spacer} />

        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color={Colors.primary}
            />
          </View>
          <Text style={styles.heroTitle}>Bảo mật tài khoản của bạn</Text>
          <Text style={styles.heroSubtitle}>
            Quản lý mật khẩu, chính sách bảo mật và điều khoản sử dụng.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <SecurityItem
            icon="key-outline"
            title="Đổi mật khẩu"
            subtitle="Cập nhật mật khẩu mới để tăng an toàn tài khoản"
            color="#F59E0B"
            onPress={() => router.push("/profile/change-password" as any)}
          />
          <SecurityItem
            icon="shield-outline"
            title="Chính sách bảo mật"
            subtitle="Xem cách ứng dụng thu thập và bảo vệ dữ liệu"
            color="#2563EB"
            onPress={() => router.push("/profile/privacy-policy" as any)}
          />
          <SecurityItem
            icon="document-text-outline"
            title="Điều khoản sử dụng"
            subtitle="Các quy định khi sử dụng ứng dụng và đặt hàng"
            color="#10B981"
            onPress={() => router.push("/profile/terms-of-use" as any)}
            isLast
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FDFDFD",
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  spacer: {
    height: 100,
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: "center",
    ...Shadow.medium,
    shadowOpacity: 0.04,
  },
  heroIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primary + "14",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  sectionCard: {
    marginTop: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    overflow: "hidden",
    ...Shadow.medium,
    shadowOpacity: 0.04,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  rowSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
  },
  rowArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
  },
});
