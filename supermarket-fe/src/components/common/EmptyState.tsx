import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Colors, FontSize, Spacing } from "../../constants";
import AppButton from "./AppButton";

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionText?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = "cube-outline",
  title,
  message,
  actionText,
  onAction,
}: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={64} color={Colors.textLight} />
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {actionText && onAction && (
        <AppButton
          title={actionText}
          onPress={onAction}
          variant="outline"
          size="small"
          fullWidth={false}
          style={{ marginTop: Spacing.lg, paddingHorizontal: Spacing.xxl }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xxl,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  message: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: "center",
    lineHeight: 22,
  },
});
