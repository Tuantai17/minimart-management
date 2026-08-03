import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Animated,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import AppButton from "../common/AppButton";
import MapPickerModal from "../map/MapPickerModal";
import type { MapPickerResult } from "../map/MapPickerModal";
import { getCurrentCoordinates, reverseGeocodeToDetails } from "../../services/location.service";
import { Colors, Radius, Shadow, Spacing } from "../../constants";
import type { Address, CreateAddressPayload } from "../../types";

export type AddressFormValues = CreateAddressPayload;

interface AddressFormProps {
  initialValues?: Partial<AddressFormValues> | Address | null;
  title: string;
  subtitle: string;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: AddressFormValues) => void | Promise<void>;
  scrollY?: Animated.Value;
}

type AddressFormErrors = Partial<Record<keyof AddressFormValues, string>>;

const createInitialValues = (
  initialValues?: Partial<AddressFormValues> | Address | null,
): AddressFormValues => ({
  full_name: initialValues?.full_name || "",
  phone: initialValues?.phone || "",
  province: initialValues?.province || "",
  district: initialValues?.district || "",
  street: initialValues?.street || "",
  note: initialValues?.note || "",
  is_default: Boolean(initialValues?.is_default),
  lat: initialValues?.lat || null,
  lng: initialValues?.lng || null,
});

const VN_PHONE_REGEX = /^0\d{9,10}$/;

const validateAddressForm = (
  values: AddressFormValues,
): AddressFormErrors => {
  const errors: AddressFormErrors = {};

  if (!values.full_name.trim()) errors.full_name = "Vui lòng nhập họ và tên.";

  const phone = values.phone.trim();
  if (!phone) {
    errors.phone = "Vui lòng nhập số điện thoại.";
  } else if (!VN_PHONE_REGEX.test(phone)) {
    errors.phone = "SĐT không hợp lệ. Nhập 10-11 số, bắt đầu bằng 0.";
  }

  if (!values.province.trim()) errors.province = "Vui lòng nhập tỉnh/thành.";
  if (!values.district.trim()) errors.district = "Vui lòng nhập quận/huyện.";
  if (!values.street.trim()) errors.street = "Vui lòng nhập số nhà/đường.";

  return errors;
};

export default function AddressForm({
  initialValues,
  title,
  subtitle,
  submitLabel,
  submitting = false,
  error,
  onSubmit,
  scrollY
}: AddressFormProps) {
  const [form, setForm] = useState<AddressFormValues>(() => createInitialValues(initialValues));
  const [formErrors, setFormErrors] = useState<AddressFormErrors>({});

  const [showMapPicker, setShowMapPicker] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  const handleUseCurrentLocation = async () => {
    setIsFetchingLocation(true);
    try {
      const coords = await getCurrentCoordinates();
      if (!coords) {
        Alert.alert(
          "Thông báo",
          "Không thể lấy vị trí GPS. Vui lòng cấp quyền vị trí cho trình duyệt hoặc chọn trực tiếp trên bản đồ."
        );
        return;
      }
      const details = await reverseGeocodeToDetails(coords.latitude, coords.longitude);

      updateField("lat", coords.latitude);
      updateField("lng", coords.longitude);

      if (details) {
        if (details.province) updateField("province", details.province);
        if (details.district) updateField("district", details.district);
        if (details.street) updateField("street", details.street);
      } else {
        updateField("street", `Vị trí hiện tại (${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})`);
        return;
      }
    } catch (err) {
      Alert.alert("Lỗi", "Có lỗi xảy ra khi lấy vị trí.");
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const handleMapConfirm = async (result: MapPickerResult) => {
    setShowMapPicker(false);
    setIsFetchingLocation(true);
    try {
      const details = await reverseGeocodeToDetails(result.latitude, result.longitude);
      const selectedAddress =
        result.address_text ||
        `Vị trí chọn trên bản đồ (${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)})`;

      updateField("lat", result.latitude);
      updateField("lng", result.longitude);

      if (details) {
        if (details.province) updateField("province", details.province);
        if (details.district) updateField("district", details.district);
        updateField("street", selectedAddress);
      } else {
        updateField("street", selectedAddress);
        return;
      }
    } catch (err) {
      Alert.alert("Lỗi", "Có lỗi xảy ra khi lấy chi tiết địa chỉ.");
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const updateField = <T extends keyof AddressFormValues>(
    field: T,
    value: AddressFormValues[T],
  ) => {
    setForm((p) => ({ ...p, [field]: value }));
    setFormErrors((p) => ({ ...p, [field]: undefined }));
  };

  const handleSubmit = async () => {
    const nextValues: AddressFormValues = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      province: form.province.trim(),
      district: form.district.trim(),
      street: form.street.trim(),
      note: form.note?.trim() || "",
      is_default: Boolean(form.is_default),
      lat: form.lat,
      lng: form.lng,
    };
    const nextErrors = validateAddressForm(nextValues);

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    await onSubmit(nextValues);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={scrollY ? Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        ) : undefined}
        scrollEventThrottle={16}
      >
        <View style={styles.spacer} />

        {/* Hero Section */}
        <View style={styles.heroArea}>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroSub}>{subtitle}</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* GPS / Map Action Row */}
        <View style={styles.gpsRow}>
          <TouchableOpacity
            style={styles.gpsButton}
            onPress={() => void handleUseCurrentLocation()}
            disabled={isFetchingLocation}
          >
            {isFetchingLocation ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="locate" size={18} color={Colors.primary} />
            )}
            <Text style={styles.gpsButtonText}>Vị trí hiện tại</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => setShowMapPicker(true)}
            disabled={isFetchingLocation}
          >
            <Ionicons name="map-outline" size={18} color="#64748B" />
            <Text style={styles.mapButtonText}>Chọn trên bản đồ</Text>
          </TouchableOpacity>
        </View>

        {/* Form Cluster */}
        <View style={styles.formCluster}>
          {/* Tên */}
          <View style={styles.inputStack}>
            <Text style={styles.label}>HỌ VÀ TÊN</Text>
            <View style={[styles.inputWrapper, formErrors.full_name && styles.inputError]}>
              <Ionicons name="person-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={form.full_name}
                onChangeText={(v) => updateField("full_name", v)}
                placeholder="Ví dụ: Nguyễn Văn A"
                placeholderTextColor="#94A3B8"
              />
            </View>
            {formErrors.full_name && <Text style={styles.errorHint}>{formErrors.full_name}</Text>}
          </View>

          {/* SĐT */}
          <View style={styles.inputStack}>
            <Text style={styles.label}>SỐ ĐIỆN THOẠI</Text>
            <View style={[styles.inputWrapper, formErrors.phone && styles.inputError]}>
              <Ionicons name="call-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={form.phone}
                onChangeText={(v) => updateField("phone", v)}
                keyboardType="phone-pad"
                placeholder="Ví dụ: 0901234567"
                placeholderTextColor="#94A3B8"
              />
            </View>
            {formErrors.phone && <Text style={styles.errorHint}>{formErrors.phone}</Text>}
          </View>

          {/* Tỉnh/Thành */}
          <View style={styles.inputStack}>
            <Text style={styles.label}>TỈNH / THÀNH PHỐ</Text>
            <View style={[styles.inputWrapper, formErrors.province && styles.inputError]}>
              <Ionicons name="business-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={form.province}
                onChangeText={(v) => updateField("province", v)}
                placeholder="Ví dụ: TP. Hồ Chí Minh"
                placeholderTextColor="#94A3B8"
              />
            </View>
            {formErrors.province && <Text style={styles.errorHint}>{formErrors.province}</Text>}
          </View>

          {/* Quận/Huyện */}
          <View style={styles.inputStack}>
            <Text style={styles.label}>QUẬN / HUYỆN</Text>
            <View style={[styles.inputWrapper, formErrors.district && styles.inputError]}>
              <Ionicons name="map-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={form.district}
                onChangeText={(v) => updateField("district", v)}
                placeholder="Ví dụ: Quận 1"
                placeholderTextColor="#94A3B8"
              />
            </View>
            {formErrors.district && <Text style={styles.errorHint}>{formErrors.district}</Text>}
          </View>

          {/* Đường */}
          <View style={styles.inputStack}>
            <Text style={styles.label}>SỐ NHÀ / TÊN ĐƯỜNG</Text>
            <View style={[styles.inputWrapper, formErrors.street && styles.inputError]}>
              <Ionicons name="location-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={form.street}
                onChangeText={(v) => updateField("street", v)}
                placeholder="Ví dụ: 123 Nguyễn Huệ"
                placeholderTextColor="#94A3B8"
              />
            </View>
            {formErrors.street && <Text style={styles.errorHint}>{formErrors.street}</Text>}
          </View>

          {/* Ghi chú */}
          <View style={styles.inputStack}>
            <Text style={styles.label}>GHI CHÚ THÊM</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="create-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.textInput}
                value={form.note}
                onChangeText={(v) => updateField("note", v)}
                placeholder="Ví dụ: Cổng màu xanh, giao giờ hành chính"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          {/* Switch */}
          <View style={styles.switchContainer}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchTitle}>Đặt làm mặc định</Text>
              <Text style={styles.switchSub}>Dùng địa chỉ này cho các đơn hàng sau</Text>
            </View>
            <Switch
              value={form.is_default}
              onValueChange={(v) => updateField("is_default", v)}
              trackColor={{ false: "#E2E8F0", true: Colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E2E8F0"
            />
          </View>
        </View>

        <View style={styles.footer}>
          <AppButton
            title={submitLabel}
            onPress={() => void handleSubmit()}
            loading={submitting}
            disabled={submitting}
            size="large"
            style={styles.submitBtn}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </Animated.ScrollView>

      {showMapPicker && (
        <MapPickerModal
          visible={showMapPicker}
          onClose={() => setShowMapPicker(false)}
          onConfirm={(result) => void handleMapConfirm(result)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 24,
  },
  spacer: {
    height: 110,
  },
  heroArea: {
    marginBottom: 32,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.8,
  },
  heroSub: {
    fontSize: 15,
    color: "#64748B",
    marginTop: 8,
    lineHeight: 22,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "600",
  },
  formCluster: {
    gap: 24,
  },
  inputStack: {
    gap: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1.2,
    paddingHorizontal: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  inputError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  textInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: "#1E293B",
    fontWeight: "600",
  },
  errorHint: {
    fontSize: 11,
    color: "#EF4444",
    fontWeight: "600",
    paddingHorizontal: 4,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    padding: 20,
    borderRadius: 20,
    marginTop: 8,
  },
  switchInfo: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  switchSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  footer: {
    marginTop: 40,
  },
  submitBtn: {
    borderRadius: 18,
    height: 56,
    backgroundColor: Colors.primary,
    ...Shadow.medium,
  },
  bottomSpacer: {
    height: 60,
  },
  gpsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  gpsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF", // Màu nền nhạt, chủ đạo
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  gpsButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.primary,
  },
  mapButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  mapButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
});

