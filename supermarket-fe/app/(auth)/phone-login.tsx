/**
 * Phone Authentication Screen
 *
 * Flow:
 *   Bước 1 — Nhập SĐT → gửi OTP qua Firebase signInWithPhoneNumber()
 *   Bước 2 — Nhập mã OTP → confirm() → lấy idToken → gọi backend
 *
 * Backend `/api/auth/firebase/` nhận idToken, tạo/link user và trả JWT.
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import {
  buildShadow,
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../src/constants";
import { firebaseAuthService } from "../../src/services/firebase-auth.service";
import {
  useAddressStore,
  useAuthStore,
  useCartStore,
  useNotificationStore,
  useProfileStore,
} from "../../src/store";
import type { AuthResponse, User } from "../../src/types";

// ─── Constants ───────────────────────────────────────────────────────────────
const RESEND_COOLDOWN = 60; // seconds
const VN_PHONE_REGEX = /^(\+84|84|0)(3|5|7|8|9)\d{8}$/;
const OTP_LENGTH = 6;

// ─── Helper: normalize phone to E.164 ────────────────────────────────────────
const toE164 = (phone: string): string => {
  const digits = phone.replace(/\s+/g, "").replace(/^0/, "+84");
  return digits.startsWith("+") ? digits : `+84${digits}`;
};

// ─── OTP Input Component ─────────────────────────────────────────────────────
function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const cells = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => inputRef.current?.focus()}
      style={styles.otpRow}
    >
      {cells.map((char, idx) => (
        <View
          key={idx}
          style={[
            styles.otpCell,
            char && styles.otpCellFilled,
            idx === value.length && styles.otpCellActive,
          ]}
        >
          <Text style={styles.otpChar}>{char}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        editable={!disabled}
        style={styles.otpHiddenInput}
        autoFocus
      />
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function PhoneLoginScreen() {
  const router = useRouter();

  // Auth stores
  const setAuth = useAuthStore((s) => s.setAuth);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const clearProfile = useProfileStore((s) => s.clearProfile);
  const clearAddresses = useAddressStore((s) => s.clearAddresses);
  const clearNotifications = useNotificationStore((s) => s.clearNotifications);

  // UI state
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  // Firebase confirm object (type any — dynamic import)
  const confirmRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = () => {
    setCountdown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Bước 1: Gửi OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    const normalized = phone.trim();
    if (!VN_PHONE_REGEX.test(normalized)) {
      setError("Số điện thoại không hợp lệ (VD: 0901234567)");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const auth = (await import("@react-native-firebase/auth")).default;
      const e164 = toE164(normalized);
      confirmRef.current = await auth().signInWithPhoneNumber(e164);
      setStep("otp");
      startCountdown();
    } catch (err: unknown) {
      console.error("[PHONE LOGIN ERROR]", err);
      const detail = err instanceof Error ? err.message : JSON.stringify(err);
      setError(`Gửi OTP thất bại: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Bước 2: Xác nhận OTP ─────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (otp.length < OTP_LENGTH) {
      setError(`Vui lòng nhập đủ ${OTP_LENGTH} chữ số.`);
      return;
    }
    if (!confirmRef.current) {
      setError("Phiên xác thực đã hết hạn. Vui lòng gửi lại OTP.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Confirm OTP → lấy Firebase user credential
      const userCredential = await confirmRef.current.confirm(otp);
      const idToken: string = await userCredential.user.getIdToken();

      // Gọi backend để lấy JWT
      const response: AuthResponse =
        await firebaseAuthService.firebaseAuthLogin({ id_token: idToken });

      // Finalize login
      await finalizeLogin(response, phone.trim());
    } catch (err: unknown) {
      console.error("[PHONE VERIFY ERROR]", err);
      const isWrongCode =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "auth/invalid-verification-code";

      const detail = err instanceof Error ? err.message : JSON.stringify(err);
      setError(isWrongCode ? "Mã OTP không đúng, vui lòng kiểm tra lại." : `Xác thực OTP thất bại: ${detail}`);
      setLoading(false);
    }
  };

  const finalizeLogin = async (response: AuthResponse, identifier: string) => {
    const accessToken = response.access || response.token || "";

    clearProfile();
    clearAddresses();
    clearNotifications();

    const user: User = {
      id: response.user?.id ?? 0,
      username: response.user?.username || identifier,
      first_name: response.user?.name || response.user?.full_name || "",
      last_name: "",
      name: response.user?.name || response.user?.full_name || identifier,
      full_name: response.user?.full_name || response.user?.name || identifier,
      email: response.user?.email || "",
      phone: identifier,
      is_staff: response.is_staff ?? false,
      is_superuser: response.is_superuser ?? false,
      is_active: response.is_active ?? true,
      role: response.is_superuser ? "admin" : response.is_staff ? "staff" : "customer",
    };

    setAuth(user, accessToken, null, {
      refreshToken: response.refresh || null,
      isStaff: user.is_staff,
      isSuperuser: user.is_superuser,
      isActive: user.is_active,
    });

    await refreshProfile().catch(() => null);
    await useCartStore.getState().syncLocalCart();

    setLoading(false);
    router.replace("/(tabs)/home");
  };

  // ── Gửi lại OTP ──────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (countdown > 0) return;
    setOtp("");
    confirmRef.current = null;
    setStep("phone");
    setError("");
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <LinearGradient
          colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>

          <View style={styles.headerIconWrap}>
            <Ionicons name="call" size={36} color={Colors.white} />
          </View>
          <Text style={styles.headerTitle}>
            {step === "phone" ? "Nhập số điện thoại" : "Nhập mã OTP"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {step === "phone"
              ? "Chúng tôi sẽ gửi mã OTP về số của bạn"
              : `Mã OTP đã được gửi đến ${phone}`}
          </Text>
        </LinearGradient>

        {/* Form Card */}
        <View style={styles.formCard}>
          {/* Error */}
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {step === "phone" ? (
            <>
              <Text style={styles.label}>Số điện thoại</Text>
              <View style={styles.phoneInputWrap}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>🇻🇳 +84</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="0901 234 567"
                  placeholderTextColor={Colors.textLight}
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(v);
                    setError("");
                  }}
                  keyboardType="phone-pad"
                  autoFocus
                  maxLength={11}
                />
              </View>

              <AppButton
                title={loading ? "Đang gửi OTP..." : "GỬI MÃ OTP"}
                onPress={handleSendOtp}
                loading={loading}
                size="large"
                style={{ marginTop: Spacing.xl }}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Mã xác thực (OTP)</Text>
              <Text style={styles.otpHint}>
                Nhập {OTP_LENGTH} chữ số từ tin nhắn SMS
              </Text>

              <OtpInput value={otp} onChange={setOtp} disabled={loading} />

              <AppButton
                title={loading ? "Đang xác thực..." : "XÁC NHẬN"}
                onPress={handleVerifyOtp}
                loading={loading}
                size="large"
                style={{ marginTop: Spacing.xl }}
              />

              {/* Resend */}
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={handleResend}
                disabled={countdown > 0 || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : countdown > 0 ? (
                  <Text style={styles.resendCountdown}>
                    Gửi lại sau {countdown}s
                  </Text>
                ) : (
                  <Text style={styles.resendText}>Gửi lại OTP</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 64 : 44,
    paddingBottom: 56,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 20,
    left: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.white,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: FontSize.base,
    color: "rgba(255,255,255,0.85)",
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  formCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.lg,
    marginTop: -24,
    padding: Spacing.xl,
    ...Shadow.medium,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.error,
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  phoneInputWrap: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    overflow: "hidden",
    height: 52,
  },
  countryCode: {
    paddingHorizontal: Spacing.md,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  countryCodeText: {
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  otpHint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    position: "relative",
  },
  otpCell: {
    width: 46,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  otpCellFilled: {
    borderColor: Colors.primary,
    backgroundColor: "#E8F5E9",
  },
  otpCellActive: {
    borderColor: Colors.primaryDark,
    borderWidth: 2,
  },
  otpChar: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  otpHiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  resendBtn: {
    marginTop: Spacing.lg,
    alignItems: "center",
    padding: Spacing.sm,
  },
  resendText: {
    fontSize: FontSize.base,
    color: Colors.primary,
    fontWeight: "700",
  },
  resendCountdown: {
    fontSize: FontSize.base,
    color: Colors.textLight,
    fontWeight: "600",
  },
});
