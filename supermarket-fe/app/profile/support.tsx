import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, Shadow } from "../../src/constants";

const SUPPORT_CONTACT = {
  hotlineDisplay: "1900 xxx xxx",
  hotlineDial: "",
  email: "support@yourapp.com",
};

type SectionRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  color: string;
  onPress: () => void;
  isLast?: boolean;
};

const openUrlSafely = async (url: string, fallbackMessage: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert("Thông báo", fallbackMessage);
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    console.log("[SupportCenter] openURL failed:", url, error);
    Alert.alert("Thông báo", fallbackMessage);
  }
};

const SectionRow = ({
  icon,
  title,
  subtitle,
  color,
  onPress,
  isLast = false,
}: SectionRowProps) => {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.row, isLast && styles.rowLast]}
    >
      <View style={[styles.rowIcon, { backgroundColor: color + "12" }]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.rowArrow}>
        <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
};

export default function SupportCenterScreen() {
  const router = useRouter();

  const handleOpenFaq = (question: string, answer: string) => {
    Alert.alert(question, answer);
  };

  const handleCallHotline = async () => {
    if (!SUPPORT_CONTACT.hotlineDial.trim()) {
      Alert.alert(
        "Thông báo",
        "Hotline đang là giá trị mẫu. Bạn hãy cập nhật số thật trong cấu hình.",
      );
      return;
    }

    await openUrlSafely(
      `tel:${SUPPORT_CONTACT.hotlineDial}`,
      "Không thể mở cuộc gọi trên thiết bị này.",
    );
  };

  const handleEmailSupport = async (subject: string) => {
    const mailTo = `mailto:${SUPPORT_CONTACT.email}?subject=${encodeURIComponent(
      subject,
    )}`;
    await openUrlSafely(mailTo, "Không thể mở ứng dụng email lúc này.");
  };

  const handleOpenPolicy = (policyName: string) => {
    Alert.alert(
      policyName,
      "Bạn có thể tạo màn hình/nội dung chi tiết cho chính sách này ở phiên bản tiếp theo.",
    );
  };

  const handleOpenChat = () => {
    router.push("/profile/chat");
  };

  const handleFeedback = (type: "bug" | "idea") => {
    if (type === "bug") {
      void handleEmailSupport("[Báo lỗi] Mini Supermarket");
      return;
    }

    void handleEmailSupport("[Góp ý cải thiện] Mini Supermarket");
  };

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
        <Text style={styles.navTitle}>Trung tâm hỗ trợ</Text>
        <View style={styles.navActionEmpty} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.spacer} />

        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="headset-outline" size={22} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Trung tâm hỗ trợ</Text>
          <Text style={styles.heroDescription}>
            Chúng tôi luôn sẵn sàng hỗ trợ bạn
          </Text>
        </View>

        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Câu hỏi thường gặp (FAQ)</Text>
          </View>
          <View style={styles.sectionCard}>
            <SectionRow
              icon="bag-handle-outline"
              title="Làm sao để đặt hàng?"
              color="#F59E0B"
              onPress={() =>
                handleOpenFaq(
                  "Làm sao để đặt hàng?",
                  "Chọn sản phẩm, thêm vào giỏ, vào trang Thanh toán, điền địa chỉ và xác nhận đặt đơn.",
                )
              }
            />
            <SectionRow
              icon="close-circle-outline"
              title="Làm sao hủy đơn?"
              color="#EF4444"
              onPress={() =>
                handleOpenFaq(
                  "Làm sao hủy đơn?",
                  "Vào Đơn hàng của tôi, mở đơn ở trạng thái chờ xử lý và bấm Hủy đơn. Nếu đơn đang giao, vui lòng liên hệ CSKH.",
                )
              }
            />
            <SectionRow
              icon="time-outline"
              title="Khi nào nhận được hàng?"
              color="#0EA5E9"
              onPress={() =>
                handleOpenFaq(
                  "Khi nào nhận được hàng?",
                  "Đơn thường giao trong 1-3 ngày làm việc tùy khu vực. Bạn có thể theo dõi trạng thái trong lịch sử đơn hàng.",
                )
              }
            />
            <SectionRow
              icon="card-outline"
              title="Thanh toán như thế nào?"
              color="#10B981"
              onPress={() =>
                handleOpenFaq(
                  "Thanh toán như thế nào?",
                  "Ứng dụng hỗ trợ các hình thức như COD và các kênh thanh toán online được kích hoạt tại checkout.",
                )
              }
            />
            <SectionRow
              icon="alert-circle-outline"
              title="Tại sao đơn bị hủy?"
              color="#F97316"
              onPress={() =>
                handleOpenFaq(
                  "Tại sao đơn bị hủy?",
                  "Đơn có thể bị hủy do hết hàng, sai thông tin nhận hàng hoặc không liên lạc được với người nhận.",
                )
              }
              isLast
            />
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Liên hệ hỗ trợ</Text>
          </View>
          <View style={styles.sectionCard}>
            <SectionRow
              icon="call-outline"
              title="Hotline"
              subtitle={SUPPORT_CONTACT.hotlineDisplay}
              color="#2563EB"
              onPress={() => void handleCallHotline()}
            />
            <SectionRow
              icon="chatbox-ellipses-outline"
              title="Chat với CSKH"
              color="#7C3AED"
              onPress={handleOpenChat}
            />
            <SectionRow
              icon="mail-outline"
              title="Email"
              subtitle={SUPPORT_CONTACT.email}
              color="#EA580C"
              onPress={() => void handleEmailSupport("[Hỗ trợ] Mini Supermarket")}
              isLast
            />
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Chính sách và điều khoản</Text>
          </View>
          <View style={styles.sectionCard}>
            <SectionRow
              icon="refresh-circle-outline"
              title="Chính sách đổi trả"
              color="#14B8A6"
              onPress={() => handleOpenPolicy("Chính sách đổi trả")}
            />
            <SectionRow
              icon="cube-outline"
              title="Chính sách giao hàng"
              color="#16A34A"
              onPress={() => handleOpenPolicy("Chính sách giao hàng")}
            />
            <SectionRow
              icon="shield-checkmark-outline"
              title="Chính sách bảo mật"
              color="#6366F1"
              onPress={() => handleOpenPolicy("Chính sách bảo mật")}
            />
            <SectionRow
              icon="document-text-outline"
              title="Điều khoản sử dụng"
              color="#64748B"
              onPress={() => handleOpenPolicy("Điều khoản sử dụng")}
              isLast
            />
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Báo lỗi / Góp ý</Text>
          </View>
          <View style={styles.sectionCard}>
            <SectionRow
              icon="bug-outline"
              title="Báo lỗi ứng dụng"
              color="#DC2626"
              onPress={() => handleFeedback("bug")}
            />
            <SectionRow
              icon="sparkles-outline"
              title="Góp ý cải thiện"
              color="#0D9488"
              onPress={() => handleFeedback("idea")}
              isLast
            />
          </View>
        </View>

        <View style={styles.footerSpace} />
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
    paddingBottom: 80,
  },
  spacer: {
    height: 100,
  },
  heroCard: {
    marginHorizontal: 20,
    paddingVertical: 22,
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    alignItems: "center",
    ...Shadow.medium,
    shadowOpacity: 0.04,
  },
  heroIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.primary + "14",
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.4,
  },
  heroDescription: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  sectionWrap: {
    marginTop: 26,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F7",
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
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowTextWrap: {
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
    fontWeight: "500",
    color: "#6B7280",
  },
  rowArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    alignItems: "center",
  },
  footerSpace: {
    height: 24,
  },
});
