import { Ionicons } from "@expo/vector-icons";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { buildShadow, Colors, FontSize, Radius, Spacing } from "../../constants";

interface ProductFilterActionProps {
  activeCount?: number;
  label?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ProductFilterAction({
  activeCount = 0,
  label = "Bộ lọc",
  onPress,
  style,
}: ProductFilterActionProps) {
  const safeCount =
    typeof activeCount === "number" && Number.isFinite(activeCount) && activeCount > 0
      ? Math.min(activeCount, 99)
      : 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
        style,
      ]}
      onPress={onPress}
    >
      {safeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{safeCount}</Text>
        </View>
      ) : null}

      <Ionicons name="options-outline" size={18} color={Colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 64,
    height: 88,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#DCE9C8",
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...buildShadow(1, 3, 0.08, 2),
  },
  containerPressed: {
    opacity: 0.92,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 13,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDE047",
  },
  badgeText: {
    color: "#202020",
    fontSize: 10,
    fontWeight: "700",
  },
  label: {
    marginTop: 4,
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: "600",
    textAlign: "center",
  },
});
