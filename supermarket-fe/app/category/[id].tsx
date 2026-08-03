import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FilterModal } from "../../src/components/search/FilterModal";
import { ProductFilterAction } from "../../src/components/search/ProductFilterAction";
import { Colors, FontSize, Radius, Spacing } from "../../src/constants";
import { categoryService } from "../../src/services/category.service";
import { useCartStore, useSearchStore } from "../../src/store";
import { getActiveProductFilterCount } from "../../src/types/search";
import type { CartItem, Category } from "../../src/types";
import type { Product, ProductSearchFilters } from "../../src/types/search";
import {
  formatCurrency,
  getAddToCartErrorMessage,
  getImageUrl,
  showLoginRequireAlert,
} from "../../src/utils";

const { width } = Dimensions.get("window");
const CARD_W = (width - Spacing.base * 2 - 12) / 2;

const dedupeProducts = (items: Product[]): Product[] => {
  const productMap = new Map<number, Product>();

  items.forEach((item) => {
    productMap.set(item.id, item);
  });

  return Array.from(productMap.values());
};

const getCategoryLoadError = (): string => {
  return "Không thể tải danh mục. Vui lòng thử lại.";
};

const extractProductsFromCategory = (category: Category | null): Product[] => {
  if (!category) {
    return [];
  }

  const products: Product[] = [...(Array.isArray(category.products) ? category.products : [])];

  if (Array.isArray(category.children) && category.children.length > 0) {
    category.children.forEach((childCategory) => {
      products.push(...extractProductsFromCategory(childCategory));
    });
  }

  return dedupeProducts(products);
};

const includesKeyword = (
  value: string | number | null | undefined,
  keyword: string,
): boolean => {
  return String(value || "").toLowerCase().includes(keyword);
};

const getProductEffectivePrice = (product: Product): number => {
  const rawPrice = product.discount_price ?? product.price;
  const parsedPrice = Number(rawPrice);
  return Number.isFinite(parsedPrice) ? parsedPrice : 0;
};

const applyProductFilters = (
  products: Product[],
  keyword: string,
  filters: ProductSearchFilters,
): Product[] => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  let nextProducts = [...(Array.isArray(products) ? products : [])];

  if (normalizedKeyword) {
    nextProducts = nextProducts.filter((product) => {
      return (
        includesKeyword(product.name, normalizedKeyword) ||
        includesKeyword(product.description, normalizedKeyword) ||
        includesKeyword(product.category_name, normalizedKeyword)
      );
    });
  }

  if (typeof filters.min_price === "number") {
    nextProducts = nextProducts.filter(
      (product) => getProductEffectivePrice(product) >= filters.min_price!,
    );
  }

  if (typeof filters.max_price === "number") {
    nextProducts = nextProducts.filter(
      (product) => getProductEffectivePrice(product) <= filters.max_price!,
    );
  }

  if (filters.ordering === "price") {
    nextProducts.sort(
      (firstProduct, secondProduct) =>
        getProductEffectivePrice(firstProduct) - getProductEffectivePrice(secondProduct),
    );
  } else if (filters.ordering === "-price") {
    nextProducts.sort(
      (firstProduct, secondProduct) =>
        getProductEffectivePrice(secondProduct) - getProductEffectivePrice(firstProduct),
    );
  } else if (filters.ordering === "-rating") {
    nextProducts.sort(
      (firstProduct, secondProduct) =>
        Number(secondProduct.rating || 0) - Number(firstProduct.rating || 0),
    );
  }

  return nextProducts;
};

export default function CategoryProductsScreen() {
  const { id, level2Id, subId } = useLocalSearchParams<{
    id: string;
    level2Id?: string;
    subId?: string;
  }>();
  const router = useRouter();

  const [parentCategory, setParentCategory] = useState<Category | null>(null);
  const [activeLevel2Id, setActiveLevel2Id] = useState<number | null>(null);
  const [activeLevel3Id, setActiveLevel3Id] = useState<number | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);

  const filters = useSearchStore((state) => state.categoryFilters);
  const setFilters = useSearchStore((state) => state.setCategoryFilters);
  const resetFilters = useSearchStore((state) => state.resetCategoryFilters);
  const activeFilterCount = getActiveProductFilterCount(filters);
  const addToCart = useCartStore((state) => state.addToCart);
  const checkBeforeAddToCart = useCartStore((state) => state.checkBeforeAddToCart);

  useEffect(() => {
    resetFilters();
  }, [id, resetFilters]);

  useEffect(() => {
    const fetchCategoryTree = async () => {
      if (!id) {
        setParentCategory(null);
        setTreeLoading(false);
        setScreenError(getCategoryLoadError());
        return;
      }

      try {
        setTreeLoading(true);
        setScreenError(null);

        const fullParent = await categoryService.getById(Number(id));
        setParentCategory(fullParent);

        let nextLevel2Id = level2Id ? Number(level2Id) : null;
        let nextLevel3Id = subId ? Number(subId) : null;

        if (!nextLevel2Id && Array.isArray(fullParent.children) && fullParent.children.length > 0) {
          nextLevel2Id = fullParent.children[0].id;
        }

        if (nextLevel2Id) {
          const level2Category = fullParent.children?.find((item) => item.id === nextLevel2Id);

          if (
            !nextLevel3Id &&
            Array.isArray(level2Category?.children) &&
            level2Category.children.length > 0
          ) {
            nextLevel3Id = level2Category.children[0].id;
          }
        }

        setActiveLevel2Id(nextLevel2Id);
        setActiveLevel3Id(nextLevel3Id);
      } catch (error) {
        console.error("[Category Screen] failed to load category tree:", error);
        setParentCategory(null);
        setScreenError(getCategoryLoadError());
      } finally {
        setTreeLoading(false);
      }
    };

    void fetchCategoryTree();
  }, [id, level2Id, subId]);

  const level2Categories = useMemo(() => {
    return parentCategory?.children || [];
  }, [parentCategory]);

  const level3Categories = useMemo(() => {
    const level2Category = level2Categories.find((item) => item.id === activeLevel2Id);
    return level2Category?.children || [];
  }, [level2Categories, activeLevel2Id]);

  const activeCategory = useMemo(() => {
    if (!parentCategory) {
      return null;
    }

    if (activeLevel3Id && activeLevel2Id) {
      const level2Category = parentCategory.children?.find((item) => item.id === activeLevel2Id);
      const level3Category = level2Category?.children?.find((item) => item.id === activeLevel3Id);

      if (level3Category) {
        return level3Category;
      }
    }

    if (activeLevel2Id) {
      const level2Category = parentCategory.children?.find((item) => item.id === activeLevel2Id);

      if (level2Category) {
        return level2Category;
      }
    }

    return parentCategory;
  }, [activeLevel2Id, activeLevel3Id, parentCategory]);

  const handleAddProductToCart = async (product: Product) => {
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

      const cartItem: CartItem = {
        id: productId,
        name: product.name,
        price: Number(product.discount_price || product.price),
        image: product.image,
        unit: product.unit,
        quantity: 1,
      };

      await addToCart(cartItem);
      Alert.alert("Thành công", `Đã thêm ${product.name} vào giỏ hàng`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        showLoginRequireAlert();
        return;
      }

      Alert.alert(
        "Thông báo",
        getAddToCartErrorMessage(error, "Không thể thêm vào giỏ hàng. Vui lòng thử lại!"),
      );
    } finally {
      setAddingProductId((currentId) => (currentId === productId ? null : currentId));
    }
  };

  const categoryProducts = useMemo(() => {
    return extractProductsFromCategory(activeCategory);
  }, [activeCategory]);

  const visibleProducts = useMemo(() => {
    return applyProductFilters(categoryProducts, searchQuery, filters);
  }, [categoryProducts, filters, searchQuery]);

  const handleSelectL2 = (category: Category) => {
    setActiveLevel2Id(category.id);

    if (Array.isArray(category.children) && category.children.length > 0) {
      setActiveLevel3Id(category.children[0].id);
      return;
    }

    setActiveLevel3Id(null);
  };

  const handleApplyFilters = (nextFilters: ProductSearchFilters) => {
    setFilters(nextFilters);
    setIsFilterVisible(false);
  };

  const renderEmptyState = () => {
    if (treeLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (screenError) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="warning-outline" size={48} color={Colors.error} />
          <Text style={styles.emptyText}>{screenError}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="basket-outline" size={50} color={Colors.border} />
        <Text style={styles.emptyText}>Không tìm thấy sản phẩm phù hợp trong danh mục này.</Text>
      </View>
    );
  };

  if (treeLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.headerBtnLeft} onPress={() => router.back()}>
            <Ionicons name="menu" size={28} color={Colors.white} />
            <Text style={styles.headerBtnMenuText}>MENU</Text>
          </TouchableOpacity>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textLight} />
            <TextInput
              style={styles.searchInput}
              placeholder="Bạn tìm gì?"
              placeholderTextColor={Colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.filterMultiRowContainer}>
        {level2Categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.l2Scroll}
          >
            {level2Categories.map((sub) => {
              const isActive = activeLevel2Id === sub.id;

              return (
                <TouchableOpacity
                  key={sub.id}
                  style={[styles.l2Item, isActive && styles.l2ItemActive]}
                  onPress={() => handleSelectL2(sub)}
                >
                  <View style={[styles.l2ImageBox, isActive && styles.l2ImageBoxActive]}>
                    <Image
                      source={{ uri: getImageUrl(sub.image) }}
                      style={styles.l2Image}
                      resizeMode="contain"
                    />
                  </View>
                  <Text
                    style={[styles.l2Text, isActive && styles.l2TextActive]}
                    numberOfLines={2}
                  >
                    {sub.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.l3ContainerWrapper}>
          {level3Categories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.l3Scroll}
            >
              {level3Categories.map((sub) => {
                const isActive = activeLevel3Id === sub.id;

                return (
                  <TouchableOpacity
                    key={sub.id}
                    style={[styles.l3Item, isActive && styles.l3ItemActive]}
                    onPress={() => setActiveLevel3Id(sub.id)}
                  >
                    <Image
                      source={{ uri: getImageUrl(sub.image) }}
                      style={styles.l3Image}
                      resizeMode="contain"
                    />
                    <Text
                      style={[styles.l3Text, isActive && styles.l3TextActive]}
                      numberOfLines={1}
                    >
                      {sub.name}
                    </Text>
                    {isActive ? (
                      <View style={styles.l3CheckBadge}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.l3Placeholder} />
          )}

          <ProductFilterAction
            activeCount={activeFilterCount}
            onPress={() => setIsFilterVisible(true)}
            style={styles.filterFixedBtn}
          />
        </View>
      </View>

      <View style={styles.bannerRow}>
        <View style={styles.bannerTextWrap}>
          <Image
            source={{
              uri: "https://cdn.haitrieu.com/wp-content/uploads/2022/01/Logo-Bach-Hoa-Xanh-BHX.png",
            }}
            style={styles.bannerImage}
            resizeMode="contain"
          />
          <Text style={styles.bannerTrustText}>
            {activeCategory?.name || parentCategory?.name || "Danh mục"} • {visibleProducts.length} sản phẩm
          </Text>
        </View>
      </View>

      <FlatList
        data={visibleProducts || []}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.listContainer}
        columnWrapperStyle={styles.rowStyle}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        renderItem={({ item }) => (
          <View style={styles.productCard}>
            <TouchableOpacity
              style={styles.productCardTouch}
              onPress={() => router.push(`/product/${item.id}` as never)}
              activeOpacity={0.8}
            >
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: getImageUrl(item.image) }}
                  style={styles.productImage}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={2}>
                  {item.name}
                </Text>

                <View style={styles.priceRow}>
                  <Text style={styles.productPrice}>
                    {formatCurrency(Number(item.discount_price || item.price))}
                  </Text>
                  <Text style={styles.unitText}>/ {item.unit || "kg"}</Text>
                </View>

                {item.discount_price ? (
                  <View style={styles.discountRow}>
                    <Text style={styles.originalPrice}>
                      {formatCurrency(Number(item.price))}
                    </Text>
                    <View style={styles.discountBadgeFixed}>
                      <Ionicons name="flash" size={8} color="#fff" />
                      <Text style={styles.discountBadgeFixedText}>
                        -
                        {Math.round(
                          (1 - Number(item.discount_price) / Number(item.price)) * 100,
                        )}
                        %
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.stockStatus}>
                  <Text
                    style={[
                      styles.stockStatusText,
                      (item.stock_quantity ?? 0) <= 0 && styles.stockStatusTextEmpty,
                    ]}
                  >
                    {(item.stock_quantity ?? 0) <= 0
                      ? "Hết hàng"
                      : `Còn ${item.stock_quantity} suất`}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.buyBtn,
                ((item.stock_quantity ?? 0) <= 0 || addingProductId === Number(item.id)) &&
                  styles.buyBtnDisabled,
              ]}
              disabled={(item.stock_quantity ?? 0) <= 0 || addingProductId === Number(item.id)}
              onPress={() => {
                void handleAddProductToCart(item);
              }}
            >
              <Text
                style={[
                  styles.buyBtnText,
                  ((item.stock_quantity ?? 0) <= 0 || addingProductId === Number(item.id)) &&
                    styles.buyBtnTextDisabled,
                ]}
              >
                {(item.stock_quantity ?? 0) <= 0
                  ? "Hết hàng"
                  : addingProductId === Number(item.id)
                    ? "Đang thêm..."
                    : "MUA"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <FilterModal
        visible={isFilterVisible}
        value={filters}
        productCount={visibleProducts.length}
        onClose={() => setIsFilterVisible(false)}
        onApply={handleApplyFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContent: {
    justifyContent: "center",
  },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 50,
    paddingBottom: Spacing.sm,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    gap: 12,
  },
  headerBtnLeft: {
    alignItems: "center",
    justifyContent: "center",
    width: 50,
  },
  headerBtnMenuText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: "700",
    marginTop: -2,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  filterMultiRowContainer: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  l2Scroll: {
    paddingHorizontal: Spacing.sm,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  l2Item: {
    alignItems: "center",
    justifyContent: "flex-start",
    width: 70,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    padding: 4,
  },
  l2ItemActive: {
    borderColor: Colors.primary,
  },
  l2ImageBox: {
    width: 48,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  l2ImageBoxActive: {
    backgroundColor: "#E8F5E9",
  },
  l2Image: {
    width: 38,
    height: 38,
  },
  l2Text: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  l2TextActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  l3ContainerWrapper: {
    position: "relative",
    minHeight: 96,
    backgroundColor: "#F9F9F9",
  },
  l3Scroll: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    gap: 12,
    paddingRight: 88,
  },
  l3Placeholder: {
    minHeight: 96,
  },
  l3Item: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: 65,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    position: "relative",
  },
  l3ItemActive: {
    borderColor: Colors.primary,
    backgroundColor: "#fff",
  },
  l3Image: {
    width: 36,
    height: 36,
    marginBottom: 4,
  },
  l3Text: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  l3TextActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
  l3CheckBadge: {
    position: "absolute",
    top: -1,
    right: -1,
    backgroundColor: Colors.primary,
    width: 14,
    height: 14,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: Radius.sm - 1,
    justifyContent: "center",
    alignItems: "center",
  },
  filterFixedBtn: {
    position: "absolute",
    right: 0,
    top: 4,
  },
  bannerRow: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    backgroundColor: "#fff",
    borderBottomWidth: 4,
    borderBottomColor: "#F0F0F0",
  },
  bannerTextWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bannerImage: {
    width: 20,
    height: 20,
  },
  bannerTrustText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: "600",
    textAlign: "center",
  },
  listContainer: {
    padding: Spacing.base,
    paddingBottom: 40,
    flexGrow: 1,
  },
  rowStyle: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  productCard: {
    width: CARD_W,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  productCardTouch: {
    flex: 1,
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: Colors.white,
    justifyContent: "center",
    alignItems: "center",
  },
  productImage: {
    width: "90%",
    height: "90%",
  },
  productInfo: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    flex: 1,
  },
  productName: {
    fontSize: 13,
    fontWeight: "400",
    color: Colors.textPrimary,
    lineHeight: 18,
    height: 38,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  unitText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  discountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  originalPrice: {
    fontSize: 11,
    color: Colors.textLight,
    textDecorationLine: "line-through",
    marginRight: 6,
  },
  discountBadgeFixed: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.error,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  discountBadgeFixedText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: "700",
    marginLeft: 2,
  },
  stockStatus: {
    marginTop: 6,
    backgroundColor: "#FFF8E1",
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  stockStatusText: {
    fontSize: 10,
    color: "#F57F17",
    fontWeight: "600",
  },
  stockStatusTextEmpty: {
    color: Colors.error,
  },
  buyBtn: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    backgroundColor: "#FAFFFA",
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  buyBtnDisabled: {
    backgroundColor: "#F0F0F0",
  },
  buyBtnText: {
    color: Colors.primary,
    fontWeight: "700",
    fontSize: 14,
  },
  buyBtnTextDisabled: {
    color: Colors.textLight,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 80,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
