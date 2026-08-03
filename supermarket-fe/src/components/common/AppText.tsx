import { Text as RNText, StyleSheet, TextProps } from "react-native";
import { Colors, FontSize } from "../../constants";

interface Props extends TextProps {
  variant?: "title" | "heading" | "body" | "caption" | "price";
}

export default function AppText({ variant = "body", style, ...rest }: Props) {
  return <RNText style={[styles[variant], style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  heading: {
    fontSize: FontSize.lg,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  body: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  caption: { fontSize: FontSize.sm, color: Colors.textLight },
  price: { fontSize: FontSize.md, fontWeight: "700", color: Colors.textPrice },
});
