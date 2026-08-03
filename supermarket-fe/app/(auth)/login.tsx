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
import {
    buildShadow,
    Colors,
    Config,
    FontSize,
    Radius,
    Shadow,
    Spacing,
} from "../../src/constants";
import { loginUser } from "../../src/services/api";
import { firebaseAuthService } from "../../src/services/firebase-auth.service";
import {
    useAddressStore,
    useAuthStore,
    useCartStore,
    useNotificationStore,
    useProfileStore,
} from "../../src/store";
import type { AuthResponse, User } from "../../src/types";

type JwtPayload = {
  user_id?: number;
  userId?: number;
  id?: number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
};

type AuthRole = "customer" | "staff" | "admin";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(0[3|5|7|8|9])+([0-9]{8})$/;

const decodeBase64 = (value: string): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let buffer = 0;
  let accumulatedBits = 0;

  for (const character of value.replace(/=+$/, "")) {
    const index = chars.indexOf(character);

    if (index < 0) {
      continue;
    }

    buffer = (buffer << 6) | index;
    accumulatedBits += 6;

    if (accumulatedBits >= 8) {
      accumulatedBits -= 8;
      output += String.fromCharCode((buffer >> accumulatedBits) & 0xff);
    }
  }

  return output;
};

const decodeJwtPayload = (token: string): JwtPayload | null => {
  const parts = token.split(".");

  if (parts.length < 2) {
    return null;
  }

  try {
    const normalizedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload =
      normalizedPayload +
      "=".repeat((4 - (normalizedPayload.length % 4 || 4)) % 4);
    const decodedPayload = decodeBase64(paddedPayload);
    const jsonPayload = decodeURIComponent(
      decodedPayload
        .split("")
        .map(
          (character) =>
            `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
        )
        .join(""),
    );

    return JSON.parse(jsonPayload) as JwtPayload;
  } catch {
    return null;
  }
};

const buildAuthUser = (emailOrPhone: string, accessToken: string): User => {
  const payload = decodeJwtPayload(accessToken);
  const email =
    payload?.email || (emailOrPhone.includes("@") ? emailOrPhone : "");
  const username =
    payload?.username ||
    (emailOrPhone.includes("@")
      ? emailOrPhone
      : emailOrPhone.replace(/\s+/g, ""));
  const firstName =
    payload?.first_name || (email ? email.split("@")[0] : username || "");

  return {
    id: payload?.user_id ?? payload?.userId ?? payload?.id ?? 0,
    username,
    first_name: firstName,
    last_name: payload?.last_name || "",
    name: firstName || username || "",
    full_name: firstName || username || "",
    email,
  };
};

const resolveRole = (isStaff?: boolean, isSuperuser?: boolean): AuthRole => {
  if (isSuperuser) {
    return "admin";
  }

  if (isStaff) {
    return "staff";
  }

  return "customer";
};

function validateLogin(
  emailOrPhone: string,
  password: string,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!emailOrPhone.trim()) {
    errors.email = "Vui lòng nhập email hoặc số điện thoại";
  } else {
    const isEmail = emailOrPhone.includes("@");

    if (isEmail && !EMAIL_REGEX.test(emailOrPhone.trim())) {
      errors.email = "Email không đúng định dạng";
    }

    if (!isEmail && !PHONE_REGEX.test(emailOrPhone.trim())) {
      errors.email = "Số điện thoại không đúng định dạng (VD: 0901234567)";
    }
  }

  if (!password) {
    errors.password = "Vui lòng nhập mật khẩu";
  } else if (password.length < 6) {
    errors.password = "Mật khẩu phải có ít nhất 6 ký tự";
  }

  return errors;
}

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const clearProfile = useProfileStore((state) => state.clearProfile);
  const clearAddresses = useAddressStore((state) => state.clearAddresses);
  const clearNotifications = useNotificationStore(
    (state) => state.clearNotifications,
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const finalizeLogin = async (response: AuthResponse, identifier: string) => {
    const accessToken = response.access || response.token || "";
    const jwtClaims = decodeJwtPayload(accessToken);

    const isStaffResolved =
      response.is_staff ??
      jwtClaims?.is_staff ??
      response.user?.is_staff ??
      false;
    const isSuperuserResolved =
      response.is_superuser ??
      jwtClaims?.is_superuser ??
      response.user?.is_superuser ??
      false;
    const isActiveResolved =
      response.is_active ??
      jwtClaims?.is_active ??
      response.user?.is_active ??
      true;

    const role = resolveRole(isStaffResolved, isSuperuserResolved);

    console.warn("[AUTH] Login role debug:", {
      "response.is_staff": response.is_staff,
      "response.is_superuser": response.is_superuser,
      "jwt.is_staff": jwtClaims?.is_staff,
      "jwt.is_superuser": jwtClaims?.is_superuser,
      "user.is_staff": response.user?.is_staff,
      "user.is_superuser": response.user?.is_superuser,
      resolved: { isStaffResolved, isSuperuserResolved, role },
    });

    const fallbackUser = buildAuthUser(identifier, accessToken);
    const user = {
      ...fallbackUser,
      ...response.user,
      name:
        response.user?.name ||
        response.user?.full_name ||
        fallbackUser.name ||
        fallbackUser.username ||
        "",
      full_name:
        response.user?.full_name ||
        response.user?.name ||
        fallbackUser.full_name ||
        fallbackUser.name ||
        "",
      email: response.user?.email || fallbackUser.email || identifier,
      is_staff: isStaffResolved,
      is_superuser: isSuperuserResolved,
      is_active: isActiveResolved,
      role,
    } satisfies User;

    clearProfile();
    clearAddresses();
    clearNotifications();
    setAuth(user, accessToken, null, {
      refreshToken: response.refresh || null,
      isStaff: isStaffResolved,
      isSuperuser: isSuperuserResolved,
      isActive: isActiveResolved,
    });
    await refreshProfile().catch(() => null);
    await useCartStore.getState().syncLocalCart();

    setLoading(false);
    setShowSuccessModal(true);

    setTimeout(() => {
      setShowSuccessModal(false);
      router.replace(role === "customer" ? "/(tabs)/home" : "/(tabs)/profile");
    }, 1500);
  };

  const handleLogin = async () => {
    const validationErrors = validateLogin(email, password);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const response = await loginUser(email, password);
      await finalizeLogin(response, email);
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "detail" in error &&
        typeof error.detail === "string"
      ) {
        setErrors({ form: error.detail });
      } else {
        setErrors({ form: "Đăng nhập thất bại, vui lòng thử lại." });
      }

      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (Platform.OS === "web") {
      setErrors({
        form: "Đăng nhập Google native hiện chưa hỗ trợ trên Expo web. Hãy dùng Android/iOS development build.",
      });
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const { GoogleSignin } =
        await import("@react-native-google-signin/google-signin");

      console.log("[GOOGLE LOGIN] Web Client ID đang dùng là:", Config.GOOGLE_WEB_CLIENT_ID);

      await GoogleSignin.hasPlayServices();

      // Bắt buộc đăng xuất phiên cũ trước để hiện lại hộp thoại chọn tài khoản (tránh tự động đăng nhập ngầm)
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // bỏ qua lỗi nếu chưa có phiên
      }

      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;

      if (!idToken) {
        throw {
          detail: "Không lấy được id_token từ Google. Vui lòng thử lại.",
        };
      }

      // Sử dụng Modular API của Firebase (v21+) để loại bỏ các deprecation warning
      const { GoogleAuthProvider, getAuth, signInWithCredential, getIdToken } = await import("@react-native-firebase/auth");
      const googleCredential = GoogleAuthProvider.credential(idToken);

      const authInstance = getAuth();
      const userCredential = await signInWithCredential(authInstance, googleCredential);
      const firebaseIdToken = await getIdToken(userCredential.user);

      const response = await firebaseAuthService.firebaseAuthLogin({
        id_token: firebaseIdToken,
      });

      const identifier =
        response.user?.email ||
        signInResult.data?.user?.email ||
        signInResult.data?.user?.name ||
        "google-user";

      await finalizeLogin(response, identifier);
    } catch (error: unknown) {
      // User chủ động huỷ Sign-In dialog — không hiện lỗi
      if (typeof error === "object" && error !== null && "code" in error) {
        try {
          const { statusCodes } = await import("@react-native-google-signin/google-signin");
          if ((error as { code: string }).code === statusCodes.SIGN_IN_CANCELLED) {
            setLoading(false);
            return;
          }
        } catch {
          // ignore import failure (e.g. web)
        }
      }

      console.error("[GOOGLE LOGIN ERROR]", error);
      const detail = error instanceof Error ? error.message : JSON.stringify(error);

      setErrors({ form: `Lỗi Google: ${detail}` });
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    if (Platform.OS === "web") {
      setErrors({ form: "Đăng nhập Facebook chưa hỗ trợ trên web." });
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const { LoginManager, AccessToken } = await import("react-native-fbsdk-next");

      // 1. Facebook Login
      const result = await LoginManager.logInWithPermissions(["public_profile"]);
      if (result.isCancelled) {
        setLoading(false);
        return; // User huỷ — không hiện lỗi
      }

      // 2. Lấy Access Token
      const tokenData = await AccessToken.getCurrentAccessToken();
      if (!tokenData?.accessToken) {
        throw { detail: "Không lấy được access token từ Facebook. Vui lòng thử lại." };
      }

      // 3. Tạo Firebase credential từ Facebook token
      const { FacebookAuthProvider, getAuth, signInWithCredential, getIdToken } = await import("@react-native-firebase/auth");
      const facebookCredential = FacebookAuthProvider.credential(tokenData.accessToken.toString());

      // 4. Sign in Firebase với credential bằng Modular API
      const authInstance = getAuth();
      const userCredential = await signInWithCredential(authInstance, facebookCredential);
      const idToken = await getIdToken(userCredential.user);

      // 5. Gọi backend để lấy JWT
      const response = await firebaseAuthService.firebaseAuthLogin({ id_token: idToken });

      const identifier =
        response.user?.email ||
        userCredential.user.email ||
        userCredential.user.displayName ||
        "facebook-user";

      await finalizeLogin(response, identifier);
    } catch (error: unknown) {
      console.error("[FACEBOOK LOGIN ERROR]", error);
      const detail = error instanceof Error ? error.message : JSON.stringify(error);

      setErrors({ form: `Lỗi Facebook: ${detail}` });
      setLoading(false);
    }
  };

  const clearError = (field: string) =>
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });

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
        <View style={styles.topSection}>
          <LinearGradient
            colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerIconWrap}>
              <Ionicons name="storefront" size={40} color={Colors.white} />
            </View>

            <Text style={styles.headerBrand}>Siêu Thị Mini</Text>
            <Text style={styles.headerTagline}>Tươi ngon mỗi ngày</Text>
          </LinearGradient>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Đăng nhập</Text>
            <Text style={styles.formSubtitle}>Chào mừng bạn quay trở lại</Text>

            {errors.form ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={Colors.error} />
                <Text style={styles.errorBannerText}>{errors.form}</Text>
              </View>
            ) : null}

            <AppInput
              label="Số điện thoại hoặc Email"
              placeholder="Nhập email hoặc số điện thoại"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                clearError("email");
                clearError("form");
              }}
              icon="person-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <AppInput
              label="Mật khẩu"
              placeholder="Nhập mật khẩu"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                clearError("password");
                clearError("form");
              }}
              icon="lock-closed-outline"
              secureTextEntry
              error={errors.password}
            />

            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setRememberMe(!rememberMe)}
                activeOpacity={0.7}
              >
                <View
                  style={[styles.checkbox, rememberMe && styles.checkboxActive]}
                >
                  {rememberMe ? (
                    <Ionicons name="checkmark" size={14} color={Colors.white} />
                  ) : null}
                </View>
                <Text style={styles.checkboxLabel}>Ghi nhớ đăng nhập</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/(auth)/forgot-password" as never)}
                activeOpacity={0.7}
              >
                <Text style={styles.forgot}>Quên mật khẩu?</Text>
              </TouchableOpacity>
            </View>

            <AppButton
              title="ĐĂNG NHẬP"
              onPress={handleLogin}
              loading={loading}
              size="large"
            />

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Ionicons name="logo-google" size={18} color="#DB4437" />
              <Text style={styles.googleButtonText}>Đăng nhập bằng Google</Text>
            </TouchableOpacity>

            {/* Social Login Divider */}
            <View style={styles.socialDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>hoặc</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Facebook Button */}
            <TouchableOpacity
              style={styles.facebookButton}
              onPress={handleFacebookLogin}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Ionicons name="logo-facebook" size={18} color="#FFFFFF" />
              <Text style={styles.facebookButtonText}>Đăng nhập bằng Facebook</Text>
            </TouchableOpacity>

            {/* Phone Button */}
            <TouchableOpacity
              style={styles.phoneButton}
              onPress={() => router.push("/(auth)/phone-login" as never)}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Ionicons name="call-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.phoneButtonText}>Đăng nhập bằng số điện thoại</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.registerWrap}>
            <View style={styles.registerRow}>
              <Text style={styles.registerText}>Chưa có tài khoản? </Text>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/register")}
                activeOpacity={0.7}
              >
                <Text style={styles.registerLink}>Đăng ký ngay</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.guestBtn}
              onPress={() => router.replace("/(tabs)/home")}
              activeOpacity={0.7}
            >
              <Text style={styles.guestBtnText}>Trang chủ (Khách)</Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={Colors.textSecondary}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <Text style={styles.copyright}>
            © 2026 Siêu Thị Mini. Tất cả quyền được bảo lưu.
          </Text>
        </View>
      </ScrollView>

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
              Đăng nhập thành công!{"\n"}Đang được chuyển hướng...
            </Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
  },
  topSection: {
    flexShrink: 0,
  },
  bottomSection: {
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 56,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerIconWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerBrand: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  headerTagline: {
    fontSize: FontSize.base,
    color: "rgba(255,255,255,0.85)",
    marginTop: Spacing.xs,
  },
  formCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.lg,
    marginTop: -24,
    padding: Spacing.xl,
    ...Shadow.medium,
  },
  formTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  formSubtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.base,
  },
  errorBannerText: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.error,
    marginLeft: Spacing.sm,
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  checkboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  forgot: {
    color: Colors.primary,
    fontWeight: "600",
    fontSize: FontSize.sm,
  },
  registerWrap: {
    marginTop: Spacing.lg,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  registerText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  registerLink: {
    fontSize: FontSize.base,
    color: Colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  guestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    backgroundColor: "#F0F0F0",
    borderRadius: Radius.full,
  },
  guestBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  copyright: {
    fontSize: FontSize.sm,
    color: Colors.textLight,
    textAlign: "center",
    marginTop: Spacing.xxl,
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
    ...buildShadow(2, 4, 0.1, 4),
  },
  modalIconBox: {
    marginBottom: Spacing.md,
  },
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
    marginBottom: Spacing.xl,
  },
  googleButton: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  googleButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  socialDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: FontSize.sm,
    color: Colors.textLight,
    fontWeight: "600",
    paddingHorizontal: Spacing.xs,
  },
  facebookButton: {
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1877F2",
    gap: Spacing.sm,
  },
  facebookButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },
  phoneButton: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: Spacing.sm,
  },
  phoneButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
});
