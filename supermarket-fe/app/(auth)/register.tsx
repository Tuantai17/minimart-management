import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { registerUser } from "../../src/services/api";

/* ──── VALIDATION REGEX ──── */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(0[3|5|7|8|9])+([0-9]{8})$/;

const toFieldErrorText = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
      .map((item) => item.trim())
      .join("\n");
  }

  return "";
};

const normalizeBackendErrors = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Record<string, unknown>;
  const normalized: Record<string, string> = {};

  for (const [field, fieldError] of Object.entries(source)) {
    const message = toFieldErrorText(fieldError);
    if (message) {
      normalized[field] = message;
    }
  }

  return normalized;
};

// Component con cho Input để code gọn hơn
const AppInput = ({ label, icon, error, ...props }: any) => (
  <View style={styles.inputGroup}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputWrapper, error && { borderColor: "#ff4d4d" }]}>
      <Ionicons name={icon} size={20} color="#999" style={styles.inputIcon} />
      <TextInput style={styles.input} placeholderTextColor="#ccc" {...props} />
    </View>
    {error && <Text style={styles.errorText}>{error}</Text>}
  </View>
);

export default function RegisterScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    password: "",
    confirm_password: "",
  });

  const [errors, setErrors] = useState<any>({});

  const validate = () => {
    const newErrors: any = {};
    if (!formData.full_name.trim())
      newErrors.full_name = "Vui lòng nhập họ tên";

    if (!formData.phone.trim()) {
      newErrors.phone = "Vui lòng nhập số điện thoại";
    } else if (!PHONE_REGEX.test(formData.phone)) {
      newErrors.phone = "Số điện thoại không đúng định dạng";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Vui lòng nhập email";
    } else if (!EMAIL_REGEX.test(formData.email)) {
      newErrors.email = "Email không đúng định dạng";
    }

    if (!formData.password) {
      newErrors.password = "Vui lòng nhập mật khẩu";
    } else if (formData.password.length < 6) {
      newErrors.password = "Mật khẩu phải có ít nhất 6 ký tự";
    }

    if (formData.password !== formData.confirm_password) {
      newErrors.confirm_password = "Mật khẩu xác nhận không khớp";
    }

    if (!agreeTerms) {
      newErrors.terms = "Bạn cần đồng ý với điều khoản";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setErrors({});
    setLoading(true);
    try {
      // Gửi dữ liệu thực sự sang backend của bạn
      const result = await registerUser(formData);
      console.log("Đăng ký thành công:", result);
      setIsSuccess(true);
    } catch (error: any) {
      console.error("Dang ky that bai:", error);

      if (typeof error === "object" && error !== null) {
        const backendErrors = normalizeBackendErrors(error);
        if (Object.keys(backendErrors).length > 0) {
          setErrors(backendErrors);
          return;
        }

        if (typeof error.detail === "string" && error.detail.trim()) {
          Alert.alert("Loi", error.detail);
          return;
        }
      }

      Alert.alert("Loi", "Da co loi he thong xay ra. Vui long thu lai sau.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* HEADER GIỐNG MẪU BẠN FE */}
          <View style={styles.greenHeader}>
            <Text style={styles.headerBrand}>Siêu Thị Mini</Text>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Đăng ký tài khoản</Text>
              <Text style={styles.headerSubtitle}>
                Tham gia cùng chúng tôi để nhận ưu đãi hấp dẫn mỗi ngày
              </Text>
            </View>
          </View>

          {isSuccess ? (
            <View style={styles.successCard}>
              <Ionicons name="checkmark-circle" size={80} color="#2d9c5e" />
              <Text style={styles.successTitle}>Đăng ký thành công!</Text>
              <Text style={styles.successSubtitle}>
                Chào mừng {formData.full_name}, tài khoản của bạn đã sẵn sàng sử
                dụng.
              </Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => router.replace("/(auth)/login")}
              >
                <Text style={styles.buttonText}>ĐĂNG NHẬP NGAY</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formCard}>
              <AppInput
                label="Họ và tên"
                icon="person-outline"
                placeholder="Nguyễn Văn A"
                value={formData.full_name}
                onChangeText={(text: string) =>
                  setFormData({ ...formData, full_name: text })
                }
                error={errors.full_name}
              />

              <AppInput
                label="Số điện thoại"
                icon="call-outline"
                placeholder="0901 234 567"
                keyboardType="phone-pad"
                value={formData.phone}
                onChangeText={(text: string) =>
                  setFormData({ ...formData, phone: text })
                }
                error={errors.phone}
              />

              <AppInput
                label="Email"
                icon="mail-outline"
                placeholder="example@gmail.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={formData.email}
                onChangeText={(text: string) =>
                  setFormData({ ...formData, email: text })
                }
                error={errors.email}
              />

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mật khẩu</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    errors.password && { borderColor: "#ff4d4d" },
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color="#999"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#ccc"
                    secureTextEntry={!showPassword}
                    value={formData.password}
                    onChangeText={(text) =>
                      setFormData({ ...formData, password: text })
                    }
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#999"
                    />
                  </TouchableOpacity>
                </View>
                {errors.password && (
                  <Text style={styles.errorText}>{errors.password}</Text>
                )}
              </View>

              <AppInput
                label="Nhập lại mật khẩu"
                icon="checkmark-circle-outline"
                placeholder="••••••••"
                secureTextEntry={true}
                value={formData.confirm_password}
                onChangeText={(text: string) =>
                  setFormData({ ...formData, confirm_password: text })
                }
                error={errors.confirm_password}
              />

              <TouchableOpacity
                style={styles.termsRow}
                onPress={() => setAgreeTerms(!agreeTerms)}
              >
                <View
                  style={[
                    styles.checkbox,
                    agreeTerms && styles.checkboxChecked,
                  ]}
                >
                  {agreeTerms && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
                <Text style={styles.termsText}>
                  Tôi đồng ý với{" "}
                  <Text style={styles.linkText}>Điều khoản dịch vụ</Text> và{" "}
                  <Text style={styles.linkText}>Chính sách bảo mật</Text>
                </Text>
              </TouchableOpacity>
              {errors.terms && (
                <Text
                  style={[
                    styles.errorText,
                    { marginLeft: 30, marginTop: -15, marginBottom: 15 },
                  ]}
                >
                  {errors.terms}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>TẠO TÀI KHOẢN</Text>
                )}
              </TouchableOpacity>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Đã có tài khoản? </Text>
                <TouchableOpacity
                  onPress={() => router.replace("/(auth)/login")}
                >
                  <Text style={styles.linkTextBold}>Đăng nhập ngay</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.bottomDecor}>
            <Ionicons name="basket-outline" size={26} color="#B9E3C6" />
            <Ionicons
              name="cart-outline"
              size={26}
              color="#B9E3C6"
              style={{ marginHorizontal: 20 }}
            />
            <Ionicons name="cube-outline" size={26} color="#B9E3C6" />
          </View>
          <Text style={styles.tagline}>
            F R E S H & F A S T D E L I V E R Y
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FBF9",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  greenHeader: {
    backgroundColor: "#2E7D32",
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
  },
  headerBrand: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: 1,
  },
  headerTextWrap: {
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -30,
    borderRadius: 25,
    padding: 24,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 30px rgba(0, 0, 0, 0.1)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 15,
          elevation: 8,
        }),
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f0f0f0",
    borderRadius: 12,
    paddingHorizontal: 15,
    backgroundColor: "#fafafa",
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#333",
  },
  errorText: {
    color: "#ff4d4d",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
    marginBottom: 24,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    marginRight: 10,
    marginTop: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#2d9c5e",
    borderColor: "#2d9c5e",
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
  },
  linkText: {
    color: "#2d9c5e",
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#2d9c5e",
    height: 55,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 12px rgba(45, 156, 94, 0.3)",
        }
      : {
          shadowColor: "#2d9c5e",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
          elevation: 4,
        }),
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: {
    color: "#666",
    fontSize: 14,
  },
  linkTextBold: {
    color: "#2d9c5e",
    fontSize: 14,
    fontWeight: "bold",
  },
  successCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -30,
    borderRadius: 25,
    padding: 40,
    alignItems: "center",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 30px rgba(0, 0, 0, 0.1)",
        }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 15,
          elevation: 8,
        }),
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#2d9c5e",
    marginTop: 20,
    marginBottom: 10,
  },
  successSubtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 22,
  },
  bottomDecor: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 30,
  },
  tagline: {
    textAlign: "center",
    fontSize: 10,
    color: "#B9E3C6",
    fontWeight: "600",
    marginTop: 10,
    letterSpacing: 2,
  },
});

