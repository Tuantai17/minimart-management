import { Ionicons } from "@expo/vector-icons";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    ViewStyle,
} from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants";

type Variant = "primary" | "secondary" | "outline" | "text" | "danger";
type Size = "small" | "medium" | "large";

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  icon,
  loading,
  disabled,
  fullWidth = true,
  style,
}: Props) {
  const bg: Record<Variant, string> = {
    primary: Colors.primary,
    secondary: Colors.secondary,
    outline: "transparent",
    text: "transparent",
    danger: Colors.error,
  };
  const txt: Record<Variant, string> = {
    primary: Colors.textWhite,
    secondary: Colors.textWhite,
    outline: Colors.primary,
    text: Colors.primary,
    danger: Colors.textWhite,
  };
  const h: Record<Size, number> = { small: 36, medium: 46, large: 54 };
  const fs: Record<Size, number> = {
    small: FontSize.sm,
    medium: FontSize.base,
    large: FontSize.md,
  };
  const isOutline = variant === "outline";

  return (
    <TouchableOpacity
      style={[
        styles.base,
        {
          backgroundColor: bg[variant],
          height: h[size],
          borderWidth: isOutline ? 1.5 : 0,
          borderColor: Colors.primary,
        },
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={txt[variant]} size="small" />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={fs[size] + 2}
              color={txt[variant]}
              style={{ marginRight: Spacing.sm }}
            />
          )}
          <Text
            style={[styles.text, { color: txt[variant], fontSize: fs[size] }]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
  },
  fullWidth: { width: "100%" } as ViewStyle,
  disabled: { opacity: 0.5 },
  text: { fontWeight: "600" } as TextStyle,
});
