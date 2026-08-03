import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
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
import AppHeader from "../../src/components/common/AppHeader";
import AppInput from "../../src/components/common/AppInput";
import { Colors, FontSize, Radius, Spacing } from "../../src/constants";

// 1. Phải nạp hệ thống Client Interceptor vì File Đánh chặn này sẽ ĐÍNH TOKEN kèm cho hàm POST
import client from "../../src/services/api/client"; 
import { Endpoints } from "../../src/services/api/endpoints";
import { useAuthStore } from "../../src/store";

export default function ChangePasswordScreen() {
  const router = useRouter();

  // Call Zustand -> Logout (Dùng để xé Token khi Đổi Pass xong, đá account văng ra web bắt log lại)
  const { logout } = useAuthStore();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errors, setErrors] = useState<{ old?: string; new?: string; confirm?: string }>({});

  const validate = () => {
    let isValid = true;
    const newErrors: any = {};

    if (!oldPassword.trim()) {
      newErrors.old = "Vui lòng nhập mật khẩu cũ";
      isValid = false;
    }
    if (newPassword.length < 6) {
      newErrors.new = "Mật khẩu mới phải từ 6 ký tự trở lên";
      isValid = false;
    }
    if (newPassword !== confirmPassword) {
      newErrors.confirm = "Mật khẩu xác nhận không khớp";
      isValid = false;
    }
    if (oldPassword === newPassword && oldPassword.length > 0) {
      newErrors.new = "Mật khẩu Cũ và Mới không được giống y hệt nhau!";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSave = async () => {
    if (!validate()) return;
    
    setLoading(true);

    try {
      // 2. Tái sử dụng Axios Đã nhét Token sẵn => Truyền Body Json Pass
      // Endpoint /change-password/ tùy backend thiết lập (thường thì thêm tiền tố /api/)
      await client.post(Endpoints.CHANGE_PASSWORD, {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      // 3. Hiển thị UI Popup
      setShowSuccessModal(true);
      setTimeout(async () => {
        setShowSuccessModal(false);
        await logout(); // Clear Token
        router.replace("/(auth)/login"); // Ép văng ra Đăng nhập
      }, 2000);
    } catch (err: any) {
      const newPasswordErrors =
        err.response?.data?.new_password || err.response?.data?.password;
      const confirmPasswordErrors = err.response?.data?.confirm_password;

      if (Array.isArray(newPasswordErrors) && newPasswordErrors.length > 0) {
        const message = newPasswordErrors.join("\n");
        setErrors((prev) => ({ ...prev, new: message }));
        Alert.alert("Lỗi", message);
        return;
      }

      if (Array.isArray(confirmPasswordErrors) && confirmPasswordErrors.length > 0) {
        const message = confirmPasswordErrors.join("\n");
        setErrors((prev) => ({ ...prev, confirm: message }));
        Alert.alert("Lỗi", message);
        return;
      }

      // 400 Lỗi nếu MK cũ sai => Render Error message cục bộ. Không cho Submit.
      const backendErrorMsg = err.response?.data?.error || err.response?.data?.old_password?.[0] || "Mật khẩu hiện tại không chính xác / Hoặc Request lỗi mạng.";
      
      setErrors({ ...errors, old: backendErrorMsg });
      Alert.alert("Lỗi", backendErrorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Đổi mật khẩu" showBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hướng Dẫn Text Design */}
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark" size={24} color={Colors.primary} />
            <Text style={styles.infoText}>
              Xác nhận mật khẩu cũ trước khi đổi. Sử dụng mật khẩu mạnh bao gồm
              chữ cái và số để bảo vệ tài khoản.
            </Text>
          </View>

          {/* Form UI Container */}
          <View style={styles.form}>
            {/* Box 1: Type Old Pass */}
            <AppInput
              label="Mật khẩu hiện tại"
              placeholder="••••••••"
              value={oldPassword}
              onChangeText={(txt) => {
                setOldPassword(txt);
                if(errors.old) setErrors({ ...errors, old: "" });
              }}
              icon="lock-closed-outline"
              secureTextEntry
              error={errors.old}
            />

            <View style={styles.divider} />

            {/* Box 2: Type Secure New Pass */}
            <AppInput
              label="Mật khẩu mới"
              placeholder="••••••••"
              value={newPassword}
              onChangeText={(txt) => {
                setNewPassword(txt);
                if(errors.new) setErrors({ ...errors, new: "" });
              }}
              icon="key-outline"
              secureTextEntry
              error={errors.new}
            />

            {/* Box 3: Confirm Box */}
            <AppInput
              label="Xác nhận mật khẩu mới"
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={(txt) => {
                setConfirmPassword(txt);
                if(errors.confirm) setErrors({ ...errors, confirm: "" });
              }}
              icon="checkmark-circle-outline"
              secureTextEntry
              error={errors.confirm}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Button Save Trôi Nổi (Sticky Bottom Action Bar) */}
      <View style={styles.bottomBar}>
        <AppButton
          title="LƯU THAY ĐỔI"
          onPress={handleSave}
          loading={loading}
          size="large"
        />
      </View>

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
              Đổi mật khẩu thành công!{"\n"}Đang đăng xuất để bảo mật...
            </Text>
          </View>
        </View>
      </Modal>
      
    </View>
  );
}

// ==== THIẾT KẾ ĐẸP THEO YÊU CẦU UI UX BONUS ===
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.base, paddingBottom: 100 },
  infoBox: {
    flexDirection: "row",
    backgroundColor: Colors.primarySurface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.xl,
    alignItems: "center",
  },
  infoText: { flex: 1, marginLeft: Spacing.md, fontSize: FontSize.sm, color: Colors.primary, lineHeight: 20 },
  form: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg,
    shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.lg, marginHorizontal: -Spacing.lg },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: Spacing.lg, backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: Platform.OS === "ios" ? 34 : Spacing.lg,
  },
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
