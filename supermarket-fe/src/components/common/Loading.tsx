import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Colors, FontSize, Spacing } from "../../constants";

interface Props {
  fullScreen?: boolean;
  text?: string;
}

export default function Loading({ fullScreen = true, text }: Props) {
  if (!fullScreen)
    return (
      <ActivityIndicator
        color={Colors.primary}
        style={{ padding: Spacing.lg }}
      />
    );
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      {text && <Text style={styles.text}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  text: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
});
