import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AppButton from "../../src/components/common/AppButton";
import { Colors, FontSize, Radius, Spacing } from "../../src/constants";
import { useCountdown } from "../../src/hooks/useCountdown"; // 1. Gọi Custom Hook Bonus
import { Endpoints } from "../../src/services/api/endpoints";
import client from "../../src/services/api/client"; // Gọi qua Axios chặn lỗi

export default function VerifyOTPScreen() {
  const router = useRouter();
  
  // 2. Nhận biến tham số truyền sang từ trang trước (Email)
  const { email } = useLocalSearchParams<{ email: string }>();
  
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [errorMSG, setErrorMSG] = useState("");
  const inputs = useRef<TextInput[]>([]);

  // 3. Khởi tạo Đồng Hồ đếm ngược Countdown 5 Minutes (300 giây)
  // Tính năng mới: Gắn email vào Storage Key để lưu mốc thời gian chống F5
  const { isActive, formatTime, resetCountdown } = useCountdown(300, `OTP_TIMER_${email || "unknown"}`);



  // Handle Focus Mảng 6 Input Box OTP
  const handleChange = (text: string, index: number) => {
    // Chỉ giữ lại số
    const cleaned = text.replace(/[^0-9]/g, "");
    if (errorMSG) setErrorMSG("");

    // 1. Nếu bàn phím Autofill dán đủ 6 số OTP (Từ SMS)
    if (cleaned.length >= 6) {
      setOtp((prev) => {
        const newOtp = [...prev];
        const pasted = cleaned.substring(0, 6).split("");
        pasted.forEach((char, i) => { newOtp[i] = char; });
        return newOtp;
      });
      inputs.current[5]?.focus();
      return;
    }

    // 2. Gõ từng số (Hoặc gõ đè)
    let validChar = "";
    if (cleaned.length > 0) {
      // Nhận diện kí tự mới gõ nếu ô cũ đang có chữ 
      if (cleaned.length === 2 && otp[index]) {
        validChar = cleaned[0] === otp[index] ? cleaned[1] : cleaned[0];
      } else {
        validChar = cleaned.slice(-1);
      }
    }

    // Dùng Functional Update `prev` để CHỐNG MẤT SỐ KHI GÕ QUÁ NHANH
    setOtp((prev) => {
      const newOtp = [...prev];
      newOtp[index] = validChar;
      return newOtp;
    });

    // 3. Tự động nhảy sang phải khi điền xong
    if (validChar !== "" && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleKeyPress = ({ nativeEvent }: any, index: number) => {
    // Nếu bấm Xoá trên một ô TRỐNG -> lùi và xoá ô trước đó
    if (nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      
      setOtp((prev) => {
        const newOtp = [...prev];
        newOtp[index - 1] = "";
        return newOtp;
      });
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    
    // Validate
    if (code.length !== 6) {
      setErrorMSG("Vui lòng nhập đủ mã OTP 6 con số.");
      return;
    }
    
    if (!email) {
      Alert.alert("Lỗi Router", "Lạc mất địa chỉ Email trong quá trình chuyển hướng.");
      return;
    }

    setLoading(true);

    try {
      // 4. Gọi API xác thực 6 số OTP (Truyền cả username và email)
      const response = await client.post<{
        message?: string;
        reset_token?: string;
      }>(Endpoints.VERIFY_OTP, { username: email, email: email, otp: code });

      const resetToken = response.data?.reset_token?.trim();

      if (!resetToken) {
        setErrorMSG("Xác thực OTP thất bại do thiếu reset token bảo mật.");
        return;
      }
      
      // Nếu xác thực ổn -> Chuyển màn 3 mang theo Email + reset_token (không truyền OTP nữa)
      router.push({
        pathname: "/(auth)/reset-password",
        params: { email: email, reset_token: resetToken },
      });
      
    } catch (err: any) {
      // Lỗi 400: Sai/Hết hạn 5 phút
      const msg = err.response?.data?.error || err.response?.data?.detail || "Nhập sai mã OTP hoặc mã không tồn tại.";
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
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* --- HEADER --- */}
        <LinearGradient colors={[Colors.primary, Colors.primaryLight]} style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Xác nhận OTP</Text>
          <View style={styles.headerIcon}>
            <Ionicons name="key-outline" size={48} color={Colors.white} />
          </View>
        </LinearGradient>

        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Nhập mã xác thực</Text>
          <Text style={styles.sectionSubtitle}>
            Chúng tôi đã gửi yêu cầu đặt lại mật khẩu của tài khoản 
            <Text style={styles.boldText}> {email} </Text>.
            Vui lòng lấy dãy 6 số ở trong hòm thư Email.
          </Text>

          {/* Render mảng OTP (6 Cục hình Vuông) */}
          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => {
                  if (ref) inputs.current[i] = ref; // map ref trỏ chuột vào input index
                }}
                style={[
                  styles.otpInput, 
                  digit ? styles.otpFilled : null,
                  errorMSG ? styles.otpErrorBorder : null // Xung đột màu thì render đỏ
                ]}
                value={digit}
                onChangeText={(t) => handleChange(t, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                // Xóa (maxLength = 1) để cho phép nhận Text chuỗi dài gõ đè, sau đó cắt lấy kí tự cuối
                selectTextOnFocus
              />
            ))}
          </View>
          {errorMSG ? <Text style={styles.otpErrorText}>{errorMSG}</Text> : null}

          {/* Countdown Zone */}
          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Thời gian mã có hiệu lực:</Text>
            {isActive ? (
              <View style={styles.countdownRow}>
                <Ionicons name="alarm-outline" size={16} color={Colors.error} />
                <Text style={styles.countdownText}> {formatTime()}</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  // Re-Call Resend OTP logic here if want, now just reset clock (simulate)
                  Alert.alert("Lưu ý", "Hãy quay lại màn hình trước để gửi lại Yêu Cầu OTP.")
                }}
              >
                <Text style={styles.resendLink}>Đã hết hạn?</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* BUTTON Xác Nhận */}
          <AppButton
            title="XÁC NHẬN"
            onPress={handleVerify}
            loading={loading} // UX: Cấm chọc 2 lần gửi api duplicate
            disabled={!isActive} // Hết 5 phút bắt buộc khoá Input
            size="large"
            style={{ marginTop: Spacing.xl }}
          />

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============== STYLES (UI UX Tối Ưu Bóng Bóng, Spacing Đẹp) ==============
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
    left: Spacing.base,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: "700", color: Colors.white, marginBottom: Spacing.lg },
  headerIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center", alignItems: "center",
  },
  formContainer: { padding: Spacing.xl, paddingTop: Spacing.xxl },
  sectionTitle: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.textPrimary, textAlign: "center", marginBottom: Spacing.sm },
  sectionSubtitle: { fontSize: FontSize.base, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: Spacing.xxl },
  boldText: { fontWeight: "700", color: Colors.primary },
  
  // OTP Styles Box
  otpRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: Spacing.md },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    textAlign: "center",
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  otpFilled: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  otpErrorBorder: { borderColor: Colors.error },
  otpErrorText: { fontSize: FontSize.sm, color: Colors.error, textAlign: "center", marginBottom: Spacing.md },

  // Countdown Time CSS
  resendRow: { alignItems: "center", marginTop: Spacing.md },
  resendText: { fontSize: FontSize.base, color: Colors.textSecondary, marginBottom: Spacing.xs },
  countdownRow: { flexDirection: "row", alignItems: "center" },
  countdownText: { fontSize: FontSize.md, color: Colors.error, fontWeight: "700" },
  resendLink: { fontSize: FontSize.base, color: Colors.primary, fontWeight: "700", textDecorationLine: "underline" },
});
