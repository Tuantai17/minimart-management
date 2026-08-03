import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../constants";

interface CartToastProps {
  message: string;
  visible: boolean;
  type?: "success" | "error" | "info";
}

export default function CartToast({
  message,
  visible,
  type = "success",
}: CartToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [visible]);

  const iconName =
    type === "success"
      ? "checkmark-circle"
      : type === "error"
        ? "close-circle"
        : "information-circle";

  const bgColor =
    type === "success"
      ? Colors.primary
      : type === "error"
        ? Colors.error
        : Colors.info;

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          pointerEvents: "none",
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Ionicons name={iconName} size={20} color={Colors.white} />
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 50,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    gap: 10,
    zIndex: 9999,
    ...Shadow.large,
  },
  text: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.white,
  },
});
