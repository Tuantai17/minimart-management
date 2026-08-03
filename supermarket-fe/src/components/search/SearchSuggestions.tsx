import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import EmptyState from "../common/EmptyState";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../constants";
import type { SearchSuggestionItem } from "../../types/search";
import { getImageUrl } from "../../utils";

interface SearchSuggestionsProps {
  keyword: string;
  suggestions: SearchSuggestionItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectItem: (item: SearchSuggestionItem) => void;
}

function SearchSuggestionsComponent({
  keyword,
  suggestions,
  loading,
  error,
  onRetry,
  onSelectItem,
}: SearchSuggestionsProps) {
  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];
  const dedupedSuggestions = safeSuggestions.filter(
    (item, index, items) =>
      index === items.findIndex((candidate) => candidate.categoryId === item.categoryId),
  );

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Không tải được gợi ý"
        message={error}
        actionText="Thử lại"
        onAction={onRetry}
      />
    );
  }

  if (dedupedSuggestions.length === 0) {
    return (
      <EmptyState
        icon="search-outline"
        title="Không tìm thấy danh mục phù hợp"
        message={`Chưa có gợi ý liên quan cho "${keyword}".`}
      />
    );
  }

  const imageSuggestions = dedupedSuggestions.filter((item) => !!item.image).slice(0, 8);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      {imageSuggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.iconList}
        >
          {imageSuggestions.map((item) => (
            <TouchableOpacity
              key={`category-image-${item.categoryId}`}
              style={styles.iconCard}
              onPress={() => onSelectItem(item)}
              activeOpacity={0.8}
            >
              <View style={styles.imageWrap}>
                <Image
                  source={{ uri: getImageUrl(item.image) }}
                  style={styles.image}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.iconLabel} numberOfLines={2}>
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.listCard}>
        {dedupedSuggestions.map((item, index) => (
          <TouchableOpacity
            key={`category-row-${item.categoryId}`}
            style={[
              styles.textRow,
              index === dedupedSuggestions.length - 1 && styles.lastRow,
            ]}
            onPress={() => onSelectItem(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.textLabel} numberOfLines={1}>
              {item.name}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.textLight} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

export const SearchSuggestions = memo(SearchSuggestionsComponent);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.xxl,
  },
  centerState: {
    paddingTop: Spacing.xxl,
    alignItems: "center",
  },
  iconList: {
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  iconCard: {
    width: 78,
    alignItems: "center",
  },
  imageWrap: {
    width: 68,
    height: 68,
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadow.small,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  iconLabel: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  listCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: "hidden",
  },
  textRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  textLabel: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginRight: Spacing.sm,
  },
});
