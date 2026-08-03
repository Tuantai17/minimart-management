import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import AppButton from "../../src/components/common/AppButton";
import AppInput from "../../src/components/common/AppInput";
import { Colors, FontSize, Radius, Spacing } from "../../src/constants";
import { Endpoints } from "../../src/services/api/endpoints";
import client from "../../src/services/api/client"; // Dùng Axios Client cấu hình sẵn của dự án
import { storage } from "../../src/utils/storage";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMSG, setErrorMSG] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleRequestOTP = async () => {
    if (!email.trim()) {
      setErrorMSG("Email không được để trống");
      return;
    }

    setErrorMSG("");
    setLoading(true);

    try {
      // Giải pháp Reset Giờ: Xóa sạch cái hẹn giờ cũ nếu dính bộ đếm dở dang của phiên OTP lần trước
      await storage.remove(`OTP_TIMER_${email.trim()}`);

      // 1. Gọi API gửi thư cấp OTP (Truyền tham số cả email lẫn username để tương thích với BE cũ và mới)
      await client.post(Endpoints.FORGOT_PASSWORD, {
        email: email.trim(),
        username: email.trim(),
      });
      // 2. Hiển thị thông báo thành công xịn bằng Modal thay vì Trình duyệt
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        router.push({
          pathname: "/(auth)/verify-otp",
          params: { email: email.trim() },
        });
      }, 2000);
    } catch (err: any) {
      // Kiểm tra HTTP error
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Gửi yêu cầu thất bại. Vui lòng kiểm tra lại Email.";
      setErrorMSG(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* === HEADER GRADIENT TẠO ĐIỂM NHẤN (UI/UX) === */}
        <LinearGradient
          colors={[Colors.primary, Colors.primaryLight]}
          style={styles.header}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quên mật khẩu</Text>
          <View style={styles.headerIcon}>
            <Ionicons name="shield-half" size={48} color={Colors.white} />
          </View>
        </LinearGradient>

        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Xác minh tài khoản</Text>
          <Text style={styles.sectionSubtitle}>
            Nhập địa chỉ Email tài khoản của bạn. Chúng tôi sẽ tự động gửi mã
            OTP xác nhận vào hòm thư này.
          </Text>

          {/* === REUSABLE COMPONENT: APP_INPUT === */}
          <AppInput
            label="Địa chỉ Email"
            placeholder="Ví dụ: nguyenvana@gmail.com"
            value={email}
            onChangeText={(txt) => {
              setEmail(txt);
              if (errorMSG) setErrorMSG("");
            }}
            icon="mail-outline"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errorMSG} // Prop tự động đổi viền đỏ nếu có error
          />

          {/* === REUSABLE COMPONENT: APP_BUTTON === */}
          <AppButton
            title="GỬI MÃ OTP"
            onPress={handleRequestOTP}
            loading={loading} // Auto disable khi loading
            size="large"
            style={{ marginTop: Spacing.xl }}
          />
        </View>
      </ScrollView>

      {/* MODAL THÀNH CÔNG */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBox}>
              <Ionicons
                name="checkmark-circle"
                size={60}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.modalTitle}>Thành công</Text>
            <Text style={styles.modalText}>
              Đã gửi mã OTP về hòm thư Email của tài khoản! Hệ thống tự chuyển
              trang...
            </Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: Spacing.base,
    alignItems: "center",
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    ...(Platform.OS === "web"
      ? {
          boxShadow: `0px 4px 20px ${Colors.primary}33`,
        }
      : {
          shadowColor: Colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 10,
          elevation: 5,
        }),
  },
  backBtn: {
    position: "absolute",
    top: 52,
    left: Spacing.base,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.white,
    marginBottom: Spacing.md,
  },
  headerIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  formContainer: {
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  sectionSubtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  modalContent: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.1)",
        }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 4,
        }),
  },
  modalIconBox: { marginBottom: Spacing.md },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  modalText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xs,
    lineHeight: 22,
  },
});
