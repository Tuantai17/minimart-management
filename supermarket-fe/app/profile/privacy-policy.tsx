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

const POLICY_SECTIONS = [
  {
    title: "Giới thiệu chung",
    content:
      "Mini Supermarket cam kết tôn trọng và bảo vệ thông tin cá nhân của người dùng khi sử dụng ứng dụng. Chính sách này mô tả cách chúng tôi thu thập, sử dụng và bảo vệ dữ liệu.",
  },
  {
    title: "Dữ liệu được thu thập",
    content:
      "Chúng tôi có thể thu thập thông tin tài khoản (họ tên, email, số điện thoại), địa chỉ giao hàng, lịch sử đơn hàng, và dữ liệu kỹ thuật cần thiết để vận hành ứng dụng ổn định.",
  },
  {
    title: "Mục đích sử dụng dữ liệu",
    content:
      "Dữ liệu được dùng để xác thực tài khoản, xử lý đơn hàng, giao hàng, chăm sóc khách hàng, cải thiện trải nghiệm người dùng và đảm bảo an toàn hệ thống.",
  },
  {
    title: "Bảo mật thông tin",
    content:
      "Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức phù hợp để bảo vệ dữ liệu khỏi truy cập trái phép, thất thoát hoặc lạm dụng. Quyền truy cập nội bộ được giới hạn theo vai trò.",
  },
  {
    title: "Quyền của người dùng",
    content:
      "Người dùng có quyền xem, cập nhật hoặc yêu cầu chỉnh sửa thông tin cá nhân; có quyền yêu cầu hỗ trợ liên quan đến dữ liệu cá nhân theo chính sách hiện hành của ứng dụng.",
  },
  {
    title: "Liên hệ hỗ trợ",
    content:
      "Nếu bạn có câu hỏi về quyền riêng tư, vui lòng liên hệ bộ phận hỗ trợ qua mục Trung tâm hỗ trợ trong ứng dụng hoặc email hỗ trợ chính thức của hệ thống.",
  },
];

export default function PrivacyPolicyScreen() {
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
        <Text style={styles.navTitle}>Chính sách bảo mật</Text>
        <View style={styles.navActionEmpty} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.spacer} />

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Chính sách bảo mật</Text>
          <Text style={styles.heroSubtitle}>
            Tài liệu này giúp bạn hiểu rõ cách Mini Supermarket quản lý và bảo
            vệ dữ liệu cá nhân.
          </Text>
        </View>

        {POLICY_SECTIONS.map((section, index) => (
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
