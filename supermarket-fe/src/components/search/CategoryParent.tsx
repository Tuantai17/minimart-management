import { memo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants";
import type { Category } from "../../types/search";

interface CategoryParentProps {
  categories: Category[];
  selectedCategoryId: number | null;
  onSelect: (categoryId: number) => void;
}

function CategoryParentComponent({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryParentProps) {
  const safeCategories = Array.isArray(categories) ? categories : [];

  if (safeCategories.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {safeCategories.map((item) => {
          const isActive = item.id === selectedCategoryId;

          return (
            <TouchableOpacity
              key={`category-parent-${item.id}`}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onSelect(item.id)}
              activeOpacity={0.82}
            >
              <Text style={[styles.text, isActive && styles.textActive]} numberOfLines={1}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const CategoryParent = memo(CategoryParentComponent);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: "#ECF0E6",
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  chip: {
    minWidth: 84,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E1E8D7",
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  chipActive: {
    borderColor: "#22c55e",
    backgroundColor: "#E6F4EA",
  },
  text: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "500",
  },
  textActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
});
