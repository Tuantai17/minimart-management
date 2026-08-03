import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, FontSize, Spacing } from "../../constants";

interface Props {
  title: string;
  showBack?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
}

export default function AppHeader({
  title,
  showBack = false,
  rightIcon,
  onRightPress,
}: Props) {
  const router = useRouter();

  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/" as any);
  };

  return (
    <View style={styles.header}>
      {showBack ? (
        <TouchableOpacity style={styles.btn} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.btn} />
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {rightIcon ? (
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            if (onRightPress) {
              onRightPress();
              return;
            }

            if (router.canGoBack()) {
              router.back();
              return;
            }

            router.replace("/" as any);
          }}
        >
          <Ionicons name={rightIcon} size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.btn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.base,
    backgroundColor: Colors.white,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.textPrimary,
    textAlign: "center",
    marginHorizontal: Spacing.sm,
  },
});
