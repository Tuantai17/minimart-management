import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import client from "../../src/services/api/client"; // Reusable axios instance

export default function ResetPasswordScreen() {
  const router = useRouter();

  // 1. Nhận biến từ Router trước (VerifyOTP)
  const { email, reset_token } = useLocalSearchParams<{
    email: string;
    reset_token: string;
  }>();

  // 2. States dành riêng cho component (Hook)
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorModalMsg, setErrorModalMsg] = useState("");

  const validate = () => {
    const errorMap: any = {};
    if (password.length < 6) {
      errorMap.password = "Mật khẩu tối thiểu 6 kí tự.";
    }
    if (password !== confirmPassword) {
      errorMap.confirm = "Hai lần điền mật khẩu không trùng khớp.";
    }
    setErrors(errorMap);
    return Object.keys(errorMap).length === 0;
  };

  const handleResetPassword = async () => {
    // Front-end chặn Logic nếu form điền tào lao
    if (!validate()) return;
    
    // An toàn kiểm tra lại tham số của Màn hình trước đẩy vào đây
    if (!email || !reset_token) {
      setErrorModalMsg("Mất kết nối reset token bảo mật do thao tác Router lỗi");
      setTimeout(() => { setErrorModalMsg(""); router.replace("/(auth)/forgot-password"); }, 2500);
      return; 
    }

    setLoading(true);

    try {
      // 3. Tiến Hành Request đổi pass (Truyền cả username và email)
      await client.post(Endpoints.RESET_PASSWORD, {
        username: email,
        reset_token: reset_token,
        new_password: password,
        confirm_password: confirmPassword,
      });

      // Báo UI thành công -> Logout/Chuyển Về Trang Đăng Nhập
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        router.replace("/(auth)/login");
      }, 2000);
      
    } catch (err: any) {
      const passwordValidationErrors =
        err.response?.data?.password || err.response?.data?.new_password;
      const confirmPasswordErrors = err.response?.data?.confirm_password;

      if (Array.isArray(passwordValidationErrors) && passwordValidationErrors.length > 0) {
        setErrors((prev) => ({ ...prev, password: passwordValidationErrors.join("\n") }));
        return;
      }

      if (Array.isArray(confirmPasswordErrors) && confirmPasswordErrors.length > 0) {
        setErrors((prev) => ({ ...prev, confirm: confirmPasswordErrors.join("\n") }));
        return;
      }

      // Nếu 400 Bad request -> OTP Hết hạn do treo điện thoại 10 tiếng
      const backendError = err.response?.data?.error || err.response?.data?.detail 
                          || "Xác nhận không thành công do reset token đã hết hạn bảo mật.";
      
      setErrorModalMsg(backendError);
      setTimeout(() => {
        setErrorModalMsg("");
        router.replace("/(auth)/forgot-password");
      }, 3000);
      
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* === HEADER GRADIENT TÁN MÀU CHÍNH HÃNG UI === */}
        <LinearGradient colors={[Colors.primary, Colors.primaryLight]} style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tạo Mật Khẩu Mới</Text>
          <View style={styles.headerIcon}>
            <Ionicons name="lock-closed-outline" size={48} color={Colors.white} />
          </View>
        </LinearGradient>

        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Đặt lại mật khẩu</Text>
          <Text style={styles.sectionSubtitle}>
            Mật khẩu mới phải đảm bảo mạnh (Hơn 6 kí tự) và phải khác mật khẩu bị mất trước đó.
          </Text>

          {/* Ô nhập Password */}
          <AppInput
            label="Mật khẩu mới"
            placeholder="********"
            value={password}
            onChangeText={(txt) => { setPassword(txt); setErrors({ ...errors, password: "" }); }}
            icon="lock-closed-outline"
            secureTextEntry // Thuộc tính che pass dấu ****
            error={errors.password} // Lên màu đỏ nếu Lỗi Validation
          />

          {/* Ô nhập Confirm Pass */}
          <AppInput
            label="Nhập lại mật khẩu mới"
            placeholder="********"
            value={confirmPassword}
            onChangeText={(txt) => { setConfirmPassword(txt); setErrors({ ...errors, confirm: "" }); }}
            icon="checkmark-circle-outline"
            secureTextEntry
            error={errors.confirm}
          />

          {/* === NÚT HỮU DỤNG === */}
          <AppButton
            title="XÁC NHẬN ĐỔI MẬT KHẨU"
            onPress={handleResetPassword}
            loading={loading} // Auto Spinning Animation UI
            size="large"
            style={{ marginTop: Spacing.xl }}
          />

          <Text style={styles.disclaimer}>
            Sau khi ấn nút xác nhận, bạn sẽ phải đăng nhập lại ứng dụng bằng pass này.
          </Text>
        </View>
      </ScrollView>

      {/* MODAL THÀNH CÔNG */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBox}>
              <Ionicons name="checkmark-circle" size={60} color={Colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Đổi mật khẩu thành công</Text>
            <Text style={styles.modalText}>
              Mật khẩu đã được thiết lập lại an toàn. Hệ thống tự động chuyển trang đăng nhập...!
            </Text>
          </View>
        </View>
      </Modal>

      {/* MODAL BÁO LỖI VÀ CHUYỂN TRANG */}
      <Modal visible={!!errorModalMsg} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBox}>
              <Ionicons name="close-circle" size={60} color={Colors.error} />
            </View>
            <Text style={styles.modalTitle}>Lỗi xác thực</Text>
            <Text style={styles.modalText}>{errorModalMsg}</Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ==== UI UX Config Shadow + Rounded
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: Spacing.base,
    alignItems: "center",
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  backBtn: {
    position: "absolute",
    top: 52,
    left: Spacing.base, // Gắn trái giống màn hình con
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: "700", color: Colors.white, marginBottom: Spacing.md },
  headerIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center", alignItems: "center",
  },
  formContainer: { padding: Spacing.xl, paddingTop: Spacing.xxl },
  sectionTitle: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.textPrimary, textAlign: "center", marginBottom: Spacing.sm },
  sectionSubtitle: { fontSize: FontSize.base, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: Spacing.xl },
  disclaimer: { textAlign: "center", fontSize: FontSize.sm, color: Colors.error, marginTop: Spacing.xxl, paddingHorizontal: Spacing.lg },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", paddingHorizontal: Spacing.xl,
  },
  modalContent: {
    width: "100%", backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: Spacing.xl, alignItems: "center",
    shadowColor: "#000000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
  },
  modalIconBox: { marginBottom: Spacing.md },
  modalTitle: { fontSize: FontSize.xl, fontWeight: "700", color: Colors.textPrimary, marginBottom: 8 },
  modalText: { fontSize: FontSize.base, color: Colors.textSecondary, textAlign: "center", marginBottom: Spacing.xs, lineHeight: 22 },
});
