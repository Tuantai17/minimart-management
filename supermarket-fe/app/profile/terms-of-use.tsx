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

const TERMS_SECTIONS = [
  {
    title: "Điều kiện sử dụng ứng dụng",
    content:
      "Người dùng cần cung cấp thông tin chính xác khi đăng ký và chịu trách nhiệm bảo mật tài khoản của mình. Việc tiếp tục sử dụng ứng dụng đồng nghĩa với việc đồng ý các điều khoản hiện hành.",
  },
  {
    title: "Quy định đặt hàng",
    content:
      "Đơn hàng chỉ được ghi nhận khi người dùng hoàn tất quy trình đặt hàng và nhận được thông báo xác nhận từ hệ thống. Tình trạng hàng hóa phụ thuộc vào tồn kho tại thời điểm xử lý.",
  },
  {
    title: "Thanh toán",
    content:
      "Người dùng cần thanh toán theo các phương thức được cung cấp trên ứng dụng. Mọi giao dịch cần tuân thủ quy định về thanh toán và xác minh của hệ thống.",
  },
  {
    title: "Hủy đơn / hoàn tiền",
    content:
      "Người dùng có thể yêu cầu hủy đơn theo điều kiện của từng trạng thái đơn hàng. Trường hợp hoàn tiền (nếu phát sinh) sẽ được xử lý theo chính sách vận hành và thời gian đối soát của kênh thanh toán.",
  },
  {
    title: "Trách nhiệm người dùng",
    content:
      "Người dùng không được sử dụng ứng dụng cho mục đích gian lận, phát tán nội dung vi phạm pháp luật hoặc gây ảnh hưởng đến hệ thống. Mọi vi phạm có thể dẫn đến việc hạn chế hoặc chấm dứt quyền truy cập.",
  },
  {
    title: "Quyền của hệ thống",
    content:
      "Mini Supermarket có quyền cập nhật, chỉnh sửa hoặc bổ sung điều khoản sử dụng để phù hợp với chính sách vận hành và quy định pháp luật. Phiên bản điều khoản mới sẽ được áp dụng kể từ thời điểm công bố.",
  },
];

export default function TermsOfUseScreen() {
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
        <Text style={styles.navTitle}>Điều khoản sử dụng</Text>
        <View style={styles.navActionEmpty} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.spacer} />

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Điều khoản sử dụng</Text>
          <Text style={styles.heroSubtitle}>
            Vui lòng đọc kỹ các điều khoản trước khi tiếp tục sử dụng ứng dụng
            Mini Supermarket.
          </Text>
        </View>

        {TERMS_SECTIONS.map((section, index) => (
          <View key={section.title} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}
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
    paddingBottom: 30,
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
    paddingVertical: 18,
    ...Shadow.medium,
    shadowOpacity: 0.04,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  sectionCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...Shadow.medium,
    shadowOpacity: 0.03,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary + "14",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.primary,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  sectionContent: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 22,
  },
});
