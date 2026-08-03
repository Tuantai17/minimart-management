import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SearchBar } from "../../src/components/search/SearchBar";
import { SearchSuggestions } from "../../src/components/search/SearchSuggestions";
import { Colors, FontSize, Radius, Spacing } from "../../src/constants";
import { useDebounce } from "../../src/hooks/useDebounce";
import { searchService } from "../../src/services/search.service";
import { useCartStore, useSearchStore } from "../../src/store";
import type { SearchSuggestionItem } from "../../src/types/search";

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    source?: string | string[];
    categoryId?: string | string[];
    categoryName?: string | string[];
  }>();
  const totalCartItems = useCartStore((state) => state.getTotalItems());
  const searchHistory = useSearchStore((state) => state.searchHistory);
  const historyLoaded = useSearchStore((state) => state.historyLoaded);
  const loadSearchHistory = useSearchStore((state) => state.loadSearchHistory);
  const addSearchHistory = useSearchStore((state) => state.addSearchHistory);
  const removeSearchHistory = useSearchStore((state) => state.removeSearchHistory);
  const clearSearchHistory = useSearchStore((state) => state.clearSearchHistory);

  const [keyword, setKeyword] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedKeyword = useDebounce(keyword, 400);
  const latestRequestId = useRef(0);
  const inputRef = useRef<TextInput | null>(null);

  const sourceParam = useMemo(
    () => (Array.isArray(params.source) ? params.source[0] : params.source) ?? "",
    [params.source],
  );
  const categoryIdParam = useMemo(() => {
    const rawValue = Array.isArray(params.categoryId) ? params.categoryId[0] : params.categoryId;
    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }, [params.categoryId]);
  const categoryNameParam = useMemo(
    () => (Array.isArray(params.categoryName) ? params.categoryName[0] : params.categoryName) ?? "",
    [params.categoryName],
  );

  useEffect(() => {
    return () => {
      inputRef.current?.blur();
    };
  }, []);

  useEffect(() => {
    void loadSearchHistory();
  }, [loadSearchHistory]);

  useEffect(() => {
    const trimmedKeyword = debouncedKeyword.trim();

    if (!trimmedKeyword) {
      latestRequestId.current += 1;
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = ++latestRequestId.current;
    setLoading(true);
    setError(null);

    searchService
      .searchSuggestions(trimmedKeyword)
      .then((items) => {
        if (requestId !== latestRequestId.current) {
          return;
        }

        setSuggestions(items);
        setLoading(false);
      })
      .catch((serviceError) => {
        if (requestId !== latestRequestId.current) {
          return;
        }

        console.error("[Search Screen] fetch suggestions failed:", serviceError);
        setSuggestions([]);
        setLoading(false);
        setError("Không thể tải gợi ý tìm kiếm. Vui lòng thử lại.");
      });
  }, [debouncedKeyword]);

  const handleSubmitSearch = (overrideKeyword?: string) => {
    const nextKeyword = (overrideKeyword ?? keyword).trim();

    if (!nextKeyword) {
      return;
    }

    void addSearchHistory(nextKeyword);
    inputRef.current?.blur();
    Keyboard.dismiss();

    requestAnimationFrame(() => {
      router.push({
        pathname: "/search/result",
        params: {
          keyword: nextKeyword,
          ...(sourceParam ? { source: sourceParam } : {}),
          ...(categoryIdParam ? { categoryId: String(categoryIdParam) } : {}),
          ...(categoryNameParam ? { categoryName: categoryNameParam } : {}),
        },
      } as any);
    });
  };

  const handleClear = () => {
    latestRequestId.current += 1;
    setKeyword("");
    setSuggestions([]);
    setLoading(false);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SearchBar
          inputRef={inputRef}
          value={keyword}
          cartCount={totalCartItems}
          onChangeText={setKeyword}
          onSubmitEditing={() => handleSubmitSearch()}
          onPressBack={() => router.back()}
          onPressCart={() => router.push("/cart" as any)}
          onClear={handleClear}
        />

        {keyword.trim() ? (
          <SearchSuggestions
            keyword={keyword.trim()}
            suggestions={suggestions}
            loading={loading}
            error={error}
            onRetry={() => {
              const trimmedKeyword = keyword.trim();

              if (!trimmedKeyword) {
                return;
              }

              const requestId = ++latestRequestId.current;
              setLoading(true);
              setError(null);

              void searchService
                .searchSuggestions(trimmedKeyword)
                .then((items) => {
                  if (requestId !== latestRequestId.current) {
                    return;
                  }

                  setSuggestions(items);
                  setLoading(false);
                  setError(null);
                })
                .catch((serviceError) => {
                  if (requestId !== latestRequestId.current) {
                    return;
                  }

                  console.error("[Search Screen] retry suggestions failed:", serviceError);
                  setSuggestions([]);
                  setLoading(false);
                  setError("Không thể tải gợi ý tìm kiếm. Vui lòng thử lại.");
                });
            }}
            onSelectItem={(item) => handleSubmitSearch(item.name)}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.defaultContent}
            showsVerticalScrollIndicator={false}
          >
            {categoryIdParam && categoryNameParam ? (
              <View style={styles.categoryContextChip}>
                <Text style={styles.categoryContextLabel}>Danh mục mặc định:</Text>
                <Text style={styles.categoryContextValue}>{categoryNameParam}</Text>
              </View>
            ) : null}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Lịch sử tìm kiếm</Text>
              {searchHistory.length > 0 ? (
                <TouchableOpacity
                  onPress={() => {
                    void clearSearchHistory();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.clearAllText}>Xóa tất cả</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {!historyLoaded ? (
              <View style={styles.stateCard}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : searchHistory.length === 0 ? (
              <View style={styles.stateCard}>
                <Ionicons name="time-outline" size={22} color={Colors.textLight} />
                <Text style={styles.emptyHistoryText}>Chưa có lịch sử tìm kiếm</Text>
              </View>
            ) : (
              <View style={styles.historyCard}>
                {searchHistory.map((item) => (
                  <View key={`search-history-${item}`} style={styles.historyRow}>
                    <TouchableOpacity
                      style={styles.historyMain}
                      onPress={() => handleSubmitSearch(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="time-outline" size={18} color={Colors.textLight} />
                      <Text style={styles.historyText} numberOfLines={1}>
                        {item}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        void removeSearchHistory(item);
                      }}
                      hitSlop={8}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close" size={18} color={Colors.textLight} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  container: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },
  defaultContent: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  categoryContextChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: Spacing.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: "#ECF8EE",
    gap: Spacing.xs,
  },
  categoryContextLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "500",
  },
  categoryContextValue: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  sectionHeader: {
    marginTop: Spacing.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  clearAllText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.primary,
  },
  stateCard: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  emptyHistoryText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
  },
  historyCard: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: "hidden",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  historyMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginRight: Spacing.sm,
  },
  historyText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
  },
});
