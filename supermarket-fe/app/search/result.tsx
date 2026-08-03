import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CategoryChild } from "../../src/components/search/CategoryChild";
import { CategoryParent } from "../../src/components/search/CategoryParent";
import { EmptySearchState } from "../../src/components/search/EmptySearchState";
import { FilterModal } from "../../src/components/search/FilterModal";
import { ProductCard } from "../../src/components/search/ProductCard";
import { ProductFilterAction } from "../../src/components/search/ProductFilterAction";
import { SearchHeader } from "../../src/components/search/SearchHeader";
import { Colors, FontSize, Spacing } from "../../src/constants";
import { getDescendantIds } from "../../src/services/search.service";
import { useCartStore, useSearchStore } from "../../src/store";
import {
  createProductSearchFilters,
  getActiveProductFilterCount,
} from "../../src/types/search";
import type { Category, Product, ProductSearchFilters } from "../../src/types/search";
import {
  getAddToCartErrorMessage,
  showLoginRequireAlert,
} from "../../src/utils";

const normalizeKeywordParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
};

const normalizeNumberParam = (value: string | string[] | undefined): number | null => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const dedupeCategories = (items: Category[]): Category[] => {
  const categoryMap = new Map<number, Category>();

  items.forEach((item) => {
    categoryMap.set(item.id, item);
  });

  return Array.from(categoryMap.values());
};

export default function SearchResultScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput | null>(null);
  const previousRootIdRef = useRef<number | null>(null);
  const previousChildIdRef = useRef<number | null>(null);
  const lastAppliedDefaultCategoryRef = useRef<string>("");

  const params = useLocalSearchParams<{
    keyword?: string | string[];
    source?: string | string[];
    categoryId?: string | string[];
    categoryName?: string | string[];
  }>();

  const initialKeyword = useMemo(() => normalizeKeywordParam(params.keyword), [params.keyword]);
  const normalizedParamKeyword = initialKeyword.trim();
  const sourceParam = useMemo(() => normalizeKeywordParam(params.source), [params.source]);
  const defaultCategoryId = useMemo(
    () => normalizeNumberParam(params.categoryId),
    [params.categoryId],
  );
  const defaultCategoryName = useMemo(
    () => normalizeKeywordParam(params.categoryName).trim(),
    [params.categoryName],
  );

  const [searchText, setSearchText] = useState<string>(initialKeyword);
  const [selectedRootId, setSelectedRootId] = useState<number | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [selectedGrandchildId, setSelectedGrandchildId] = useState<number | null>(null);
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);

  const totalCartItems = useCartStore((state) => state.getTotalItems());
  const addToCart = useCartStore((state) => state.addToCart);
  const checkBeforeAddToCart = useCartStore((state) => state.checkBeforeAddToCart);
  const addSearchHistory = useSearchStore((state) => state.addSearchHistory);

  const rawKeyword = useSearchStore((state) => state.keyword);
  const rawCategories = useSearchStore((state) => state.categories);
  const rawProducts = useSearchStore((state) => state.products);
  const rawLoading = useSearchStore((state) => state.loading);
  const rawError = useSearchStore((state) => state.error);
  const rawHasMore = useSearchStore((state) => state.hasMore);
  const rawHasSearched = useSearchStore((state) => state.hasSearched);
  const rawTotalProducts = useSearchStore((state) => state.totalProducts);
  const filters = useSearchStore((state) => state.searchFilters);
  const setKeyword = useSearchStore((state) => state.setKeyword);
  const setFilters = useSearchStore((state) => state.setSearchFilters);
  const searchByKeyword = useSearchStore((state) => state.searchByKeyword);
  const loadMoreProducts = useSearchStore((state) => state.loadMoreProducts);
  const clearSearch = useSearchStore((state) => state.clearSearch);

  const keyword = typeof rawKeyword === "string" ? rawKeyword : "";
  const categories = useMemo(
    () => dedupeCategories(Array.isArray(rawCategories) ? rawCategories : []),
    [rawCategories],
  );
  const products = useMemo(
    () => (Array.isArray(rawProducts) ? rawProducts : []),
    [rawProducts],
  );
  const loading = Boolean(rawLoading);
  const error = typeof rawError === "string" ? rawError : null;
  const hasMore = Boolean(rawHasMore);
  const hasSearched = Boolean(rawHasSearched);
  const totalProducts = typeof rawTotalProducts === "number" ? rawTotalProducts : 0;
  const safeSearchText = typeof searchText === "string" ? searchText : "";
  const activeFilterCount = getActiveProductFilterCount(filters);

  useEffect(() => {
    if (initialKeyword !== searchText) {
      setSearchText(initialKeyword);
    }
  }, [initialKeyword, searchText]);

  useEffect(() => {
    if (!normalizedParamKeyword) {
      clearSearch();
      setSelectedRootId(null);
      setSelectedChildId(null);
      setSelectedGrandchildId(null);
      previousRootIdRef.current = null;
      previousChildIdRef.current = null;
      lastAppliedDefaultCategoryRef.current = "";
      return;
    }

    setKeyword(normalizedParamKeyword);
    setSelectedRootId(null);
    setSelectedChildId(null);
    setSelectedGrandchildId(null);
    previousRootIdRef.current = null;
    previousChildIdRef.current = null;
    lastAppliedDefaultCategoryRef.current = "";

    void searchByKeyword(normalizedParamKeyword);
  }, [clearSearch, normalizedParamKeyword, searchByKeyword, setKeyword]);

  const rootCategories = useMemo(() => {
    return categories.filter(
      (category) => category.depth === 0 || category.id === category.rootParentId,
    );
  }, [categories]);

  useEffect(() => {
    if (rootCategories.length === 0) {
      setSelectedRootId(null);
      setSelectedChildId(null);
      setSelectedGrandchildId(null);
      previousRootIdRef.current = null;
      previousChildIdRef.current = null;
      return;
    }

    setSelectedRootId((currentRootId) => {
      if (
        typeof currentRootId === "number" &&
        rootCategories.some((category) => category.id === currentRootId)
      ) {
        return currentRootId;
      }

      return rootCategories[0]?.id ?? null;
    });
  }, [rootCategories]);

  useEffect(() => {
    if (!defaultCategoryId || categories.length === 0) {
      return;
    }

    const applyKey = `${normalizedParamKeyword}:${defaultCategoryId}`;

    if (lastAppliedDefaultCategoryRef.current === applyKey) {
      return;
    }

    const matchedCategory = categories.find((category) => category.id === defaultCategoryId);

    if (!matchedCategory) {
      return;
    }

    lastAppliedDefaultCategoryRef.current = applyKey;
    setSelectedRootId(matchedCategory.rootParentId ?? matchedCategory.id);

    if (matchedCategory.depth <= 0) {
      setSelectedChildId(null);
      setSelectedGrandchildId(null);
      return;
    }

    if (matchedCategory.depth === 1) {
      setSelectedChildId(matchedCategory.id);
      setSelectedGrandchildId(null);
      return;
    }

    setSelectedChildId(
      typeof matchedCategory.parent === "number" ? matchedCategory.parent : null,
    );
    setSelectedGrandchildId(matchedCategory.id);
  }, [categories, defaultCategoryId, normalizedParamKeyword]);

  useEffect(() => {
    if (previousRootIdRef.current === selectedRootId) {
      return;
    }

    previousRootIdRef.current = selectedRootId;
    setSelectedChildId(null);
    setSelectedGrandchildId(null);
    previousChildIdRef.current = null;
  }, [selectedRootId]);

  const childCategories = useMemo(() => {
    if (!selectedRootId) {
      return [];
    }

    return categories.filter((category) => category.parent === selectedRootId);
  }, [categories, selectedRootId]);

  useEffect(() => {
    if (previousChildIdRef.current === selectedChildId) {
      return;
    }

    previousChildIdRef.current = selectedChildId;
    setSelectedGrandchildId(null);
  }, [selectedChildId]);

  const grandchildCategories = useMemo(() => {
    if (!selectedChildId) {
      return [];
    }

    return categories.filter((category) => category.parent === selectedChildId);
  }, [categories, selectedChildId]);

  const activeCategoryId = selectedGrandchildId ?? selectedChildId ?? selectedRootId;

  const filteredProducts = useMemo(() => {
    if (!activeCategoryId) {
      return products;
    }

    const descendantIds = new Set(getDescendantIds(activeCategoryId, categories));

    return products.filter((product) => descendantIds.has(product.category));
  }, [activeCategoryId, categories, products]);

  const activeRoot = useMemo(
    () => rootCategories.find((category) => category.id === selectedRootId),
    [rootCategories, selectedRootId],
  );
  const activeChild = useMemo(
    () => childCategories.find((category) => category.id === selectedChildId),
    [childCategories, selectedChildId],
  );
  const activeGrandchild = useMemo(
    () => grandchildCategories.find((category) => category.id === selectedGrandchildId),
    [grandchildCategories, selectedGrandchildId],
  );

  const resultTitle =
    activeGrandchild?.name ||
    activeChild?.name ||
    activeRoot?.name ||
    defaultCategoryName ||
    normalizedParamKeyword ||
    keyword.trim() ||
    "Kết quả";

  const visibleProductCount = activeCategoryId
    ? filteredProducts.length
    : totalProducts || filteredProducts.length;

  const handleSubmitSearch = () => {
    const nextKeyword = safeSearchText.trim();

    if (!nextKeyword) {
      return;
    }

    void addSearchHistory(nextKeyword);
    inputRef.current?.blur();
    Keyboard.dismiss();

    router.replace({
      pathname: "/search/result",
      params: {
        keyword: nextKeyword,
        ...(sourceParam ? { source: sourceParam } : {}),
        ...(defaultCategoryId ? { categoryId: String(defaultCategoryId) } : {}),
        ...(defaultCategoryName ? { categoryName: defaultCategoryName } : {}),
      },
    } as never);
  };

  const handleRetry = () => {
    const nextKeyword = normalizedParamKeyword || safeSearchText.trim();

    if (!nextKeyword) {
      return;
    }

    void searchByKeyword(nextKeyword);
  };

  const handleClear = () => {
    setSearchText("");
    setSelectedRootId(null);
    setSelectedChildId(null);
    setSelectedGrandchildId(null);
    previousRootIdRef.current = null;
    previousChildIdRef.current = null;
    lastAppliedDefaultCategoryRef.current = "";
    clearSearch();
    router.replace("/search" as never);
  };

  const handleApplyFilters = (nextFilters: ProductSearchFilters) => {
    const normalizedFilters = createProductSearchFilters(nextFilters);
    const nextKeyword = normalizedParamKeyword || safeSearchText.trim();

    setFilters(normalizedFilters);
    setIsFilterVisible(false);

    if (nextKeyword) {
      void searchByKeyword(nextKeyword);
    }
  };

  const handleBuyProduct = async (product: Product) => {
    const productId = Number(product.id);

    if (!productId || addingProductId === productId) {
      return;
    }

    if ((product.stock_quantity ?? 0) <= 0) {
      Alert.alert("Thông báo", "Sản phẩm hiện đã hết hàng.");
      return;
    }

    try {
      setAddingProductId(productId);
      await checkBeforeAddToCart(productId, 1);

      await addToCart({
        id: productId,
        name: product.name,
        price: Number(product.discount_price || product.price),
        image: product.image || null,
        unit: product.unit,
        quantity: 1,
      });
    } catch (storeError: unknown) {
      if (storeError instanceof Error && storeError.message === "AUTH_REQUIRED") {
        showLoginRequireAlert();
        return;
      }

      console.error("[Search Result] addToCart failed:", storeError);
      Alert.alert(
        "Thông báo",
        getAddToCartErrorMessage(storeError, "Không thể thêm sản phẩm vào giỏ hàng."),
      );
    } finally {
      setAddingProductId((currentId) => (currentId === productId ? null : currentId));
    }
  };

  const listHeader = (
    <View>
      <CategoryParent
        categories={rootCategories}
        selectedCategoryId={selectedRootId}
        onSelect={(categoryId) => {
          setSelectedRootId(categoryId);
        }}
      />

      <View style={styles.childRow}>
        <CategoryChild
          categories={childCategories}
          selectedCategoryId={selectedChildId}
          onSelect={(categoryId) => {
            setSelectedChildId(categoryId);
          }}
        />

        <ProductFilterAction
          activeCount={activeFilterCount}
          onPress={() => setIsFilterVisible(true)}
          style={styles.filterTile}
        />
      </View>

      {grandchildCategories.length > 0 ? (
        <View style={styles.grandchildRow}>
          <CategoryChild
            categories={grandchildCategories}
            selectedCategoryId={selectedGrandchildId}
            onSelect={(categoryId) => {
              setSelectedGrandchildId(categoryId);
            }}
          />
        </View>
      ) : null}

      <View style={styles.commitmentBar}>
        <Text style={styles.commitmentText}>Cam kết sản phẩm Tích Xanh Trách Nhiệm</Text>
      </View>

      <View style={styles.bannerCard}>
        <Text style={styles.bannerTitle}>MUA HÀNG TƯƠI SỐNG TỪ 150.000đ - Freeship 3km</Text>
        <Text style={styles.bannerSubTitle}>Trừ hình thức giao siêu tốc</Text>
      </View>

      <View style={styles.filterBar}>
        <Text style={styles.resultTitle}>{resultTitle}</Text>
        <Text style={styles.resultCount}>{visibleProductCount} sản phẩm</Text>
      </View>
    </View>
  );

  const renderProduct = ({ item }: { item: Product }) => (
    <ProductCard
      product={item}
      isAdding={addingProductId === Number(item.id)}
      onPress={() => router.push(`/product/${item.id}` as never)}
      onBuy={() => {
        void handleBuyProduct(item);
      }}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SearchHeader
          inputRef={inputRef}
          value={safeSearchText}
          loading={loading}
          cartCount={totalCartItems}
          onChangeText={setSearchText}
          onClear={handleClear}
          onBack={() => router.back()}
          onCart={() => router.push("/cart" as never)}
          onSubmit={handleSubmitSearch}
        />

        {!normalizedParamKeyword && !hasSearched ? (
          <View style={styles.emptyWrap}>
            <EmptySearchState variant="no-keyword" />
          </View>
        ) : error && filteredProducts.length === 0 ? (
          <View style={styles.emptyWrap}>
            {listHeader}
            <EmptySearchState
              variant="error"
              title="Không thể tải sản phẩm"
              message={error}
              actionText="Thử lại"
              onAction={handleRetry}
            />
          </View>
        ) : !loading && filteredProducts.length === 0 ? (
          <View style={styles.emptyWrap}>
            {listHeader}
            <EmptySearchState variant="empty" />
          </View>
        ) : (
          <FlatList
            data={filteredProducts || []}
            renderItem={renderProduct}
            keyExtractor={(item) => `product-${item.id}`}
            numColumns={2}
            showsVerticalScrollIndicator={false}
            columnWrapperStyle={styles.column}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={listHeader}
            onEndReached={() => {
              void loadMoreProducts();
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loading && hasMore ? (
                <View style={styles.footerLoader}>
                  <Text style={styles.footerLoaderText}>Đang tải thêm...</Text>
                </View>
              ) : (
                <View style={styles.footerSpacing} />
              )
            }
          />
        )}

        <FilterModal
          visible={isFilterVisible}
          value={filters}
          productCount={visibleProductCount}
          onClose={() => setIsFilterVisible(false)}
          onApply={handleApplyFilters}
        />
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
    backgroundColor: "#F5F7F2",
  },
  emptyWrap: {
    flex: 1,
    backgroundColor: "#F5F7F2",
  },
  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxl,
  },
  column: {
    justifyContent: "space-between",
  },
  childRow: {
    position: "relative",
    backgroundColor: Colors.white,
  },
  grandchildRow: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: "#F1F4EC",
  },
  filterTile: {
    position: "absolute",
    right: Spacing.base,
    top: 8,
  },
  commitmentBar: {
    backgroundColor: "#F1FAF1",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E4EEE2",
  },
  commitmentText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  bannerCard: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: 16,
    backgroundColor: "#16A34A",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  bannerTitle: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: "800",
  },
  bannerSubTitle: {
    marginTop: 4,
    color: "#D7FADB",
    fontSize: FontSize.sm,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  resultTitle: {
    flex: 1,
    marginRight: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: "700",
  },
  resultCount: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  footerLoaderText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  footerSpacing: {
    height: Spacing.lg,
  },
});
