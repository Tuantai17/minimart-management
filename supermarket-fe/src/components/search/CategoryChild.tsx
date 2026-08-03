import { memo } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../constants";
import type { Category } from "../../types/search";
import { getImageUrl } from "../../utils";

interface CategoryChildProps {
  categories: Category[];
  selectedCategoryId: number | null;
  onSelect: (categoryId: number) => void;
}

function CategoryChildComponent({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryChildProps) {
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
              key={`category-child-${item.id}`}
              style={[styles.card, isActive && styles.cardActive]}
              onPress={() => onSelect(item.id)}
              activeOpacity={0.82}
            >
              <View style={[styles.imageWrap, isActive && styles.imageWrapActive]}>
                <Image
                  source={{ uri: getImageUrl(item.image) }}
                  style={styles.image}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.text, isActive && styles.textActive]} numberOfLines={2}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const CategoryChild = memo(CategoryChildComponent);

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
  card: {
    width: 72,
    minHeight: 88,
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#E6EAE1",
    backgroundColor: Colors.white,
    ...Shadow.small,
  },
  cardActive: {
    borderColor: "#22c55e",
    backgroundColor: "#F3FBF5",
  },
  imageWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F8FAF5",
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrapActive: {
    backgroundColor: "#E6F4EA",
  },
  image: {
    width: 36,
    height: 36,
  },
  text: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textAlign: "center",
    lineHeight: 16,
  },
  textActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
});
