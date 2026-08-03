import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { FontSize, Radius, Spacing } from "../../constants";
import type { Category } from "../../types";

interface Props {
  category: Category;
  onPress: (c: Category) => void;
}

export default function CategoryCard({ category, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.item}
      onPress={() => onPress(category)}
      activeOpacity={0.7}
    >
      <View style={[styles.icon, { backgroundColor: category.color + "15" }]}>
        <Ionicons
          name={category.icon as any}
          size={24}
          color={category.color}
        />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {category.name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  item: { width: "23%", alignItems: "center", marginBottom: Spacing.base },
  icon: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  name: {
    fontSize: FontSize.sm,
    color: "#757575",
    fontWeight: "500",
    textAlign: "center",
  },
});
