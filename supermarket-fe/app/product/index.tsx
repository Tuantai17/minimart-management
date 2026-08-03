import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import ProductCard from "../../src/components/home/ProductCard";
import { Colors, FontSize, Spacing } from "../../src/constants";
import { productService } from "../../src/services/product.service";
import { useCartStore } from "../../src/store";
import type { CartItem, Product } from "../../src/types";
import {
    getAddToCartErrorMessage,
    showLoginRequireAlert,
} from "../../src/utils";

const PAGE_SIZE = 20;
const BEST_SELLER_LIMIT = 20;

const getNumericPrice = (value: string | number | null | undefined): number => {
  const normalizedValue = Number(value ?? 0);
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
};

const scoreSuggestedProduct = (product: Product): number => {
  const originalPrice = getNumericPrice(product.price);
  const discountPrice = getNumericPrice(product.discount_price);
  const hasDiscount = discountPrice > 0 && discountPrice < originalPrice;

  let score = 0;

  if (product.is_active) {
    score += 40;
  }

  if ((product.stock_quantity ?? 0) > 0) {
    score += 30;
  }

  if (hasDiscount) {
    score += 25;
  }

  score += Math.min(Math.max(product.stock_quantity ?? 0, 0), 20);

  return score;
};

const diversifySuggestedProducts = (products: Product[]): Product[] => {
  const groupedProducts = new Map<string, Product[]>();

  [...products]
    .sort((first, second) => {
      const scoreDiff =
        scoreSuggestedProduct(second) - scoreSuggestedProduct(first);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return second.id - first.id;
    })
    .forEach((product) => {
      const categoryKey = String(
        product.category_id ?? product.category ?? "unknown",
      );
      const currentGroup = groupedProducts.get(categoryKey) ?? [];
      currentGroup.push(product);
      groupedProducts.set(categoryKey, currentGroup);
    });

  const diversifiedProducts: Product[] = [];
  let lastCategoryKey: string | null = null;

  while (groupedProducts.size > 0) {
    const nextEntry =
      Array.from(groupedProducts.entries())
        .filter(([categoryKey, categoryProducts]) => {
          return categoryProducts.length > 0 && categoryKey !== lastCategoryKey;
        })
        .sort(([, firstProducts], [, secondProducts]) => {
          const firstTopScore = scoreSuggestedProduct(firstProducts[0]);
          const secondTopScore = scoreSuggestedProduct(secondProducts[0]);

          if (firstTopScore !== secondTopScore) {
            return secondTopScore - firstTopScore;
          }

          return secondProducts[0].id - firstProducts[0].id;
        })[0] ?? Array.from(groupedProducts.entries())[0];

    const [categoryKey, categoryProducts] = nextEntry;
    const nextProduct = categoryProducts.shift();

    if (!nextProduct) {
      groupedProducts.delete(categoryKey);
      continue;
    }

    diversifiedProducts.push(nextProduct);
    lastCategoryKey = categoryKey;

    if (categoryProducts.length === 0) {
      groupedProducts.delete(categoryKey);
    } else {
      groupedProducts.set(categoryKey, categoryProducts);
    }
  }

  for (let index = 1; index < diversifiedProducts.length; index += 2) {
    const previousProduct = diversifiedProducts[index - 1];
    const currentProduct = diversifiedProducts[index];
    const previousCategoryKey = String(
      previousProduct.category_id ?? previousProduct.category ?? "unknown",
    );
    const currentCategoryKey = String(
      currentProduct.category_id ?? currentProduct.category ?? "unknown",
    );

    if (previousCategoryKey !== currentCategoryKey) {
      continue;
    }

    const swapIndex = diversifiedProducts.findIndex(
      (candidateProduct, candidateIndex) => {
        if (candidateIndex <= index) {
          return false;
        }

        const candidateCategoryKey = String(
          candidateProduct.category_id ??
            candidateProduct.category ??
            "unknown",
        );
        const nextRowLeftProduct =
          candidateIndex % 2 === 0
            ? diversifiedProducts[candidateIndex + 1]
            : undefined;
        const nextRowLeftCategoryKey = nextRowLeftProduct
          ? String(
              nextRowLeftProduct.category_id ??
                nextRowLeftProduct.category ??
                "unknown",
            )
          : null;

        return (
          candidateCategoryKey !== previousCategoryKey &&
          candidateCategoryKey !== nextRowLeftCategoryKey
        );
      },
    );

    if (swapIndex !== -1) {
      const swappedProduct = diversifiedProducts[swapIndex];
      diversifiedProducts[swapIndex] = currentProduct;
      diversifiedProducts[index] = swappedProduct;
    }
  }

  return diversifiedProducts;
};

export default function ProductIndex() {
  const router = useRouter();
  const { list_type } = useLocalSearchParams<{ list_type: string }>();
  const isBestSellerList = list_type === "best_seller";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);

  const displayedProducts = useMemo(
    () => (isBestSellerList ? products : diversifySuggestedProducts(products)),
    [isBestSellerList, products],
  );

  const addToCart = useCartStore((state) => state.addToCart);
  const checkBeforeAddToCart = useCartStore(
    (state) => state.checkBeforeAddToCart,
  );

  const fetchProducts = useCallback(
    async (pageNumber: number, isRefresh: boolean = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        }

        const response = isBestSellerList
          ? await productService.getBestSelling({ limit: BEST_SELLER_LIMIT })
          : await productService.getAll({ page: pageNumber, limit: PAGE_SIZE });
        const newProducts = response.results || [];

        setProducts((currentProducts) => {
          const mergedProducts =
            isRefresh || pageNumber === 1 || isBestSellerList
              ? newProducts
              : [...currentProducts, ...newProducts];

          const uniqueProducts = new Map<number, Product>();
          mergedProducts.forEach((product) => {
            uniqueProducts.set(product.id, product);
          });

          return Array.from(uniqueProducts.values());
        });

        if (isBestSellerList) {
          setHasMore(false);
          setPage(1);
        } else {
          setHasMore(!!response.next && newProducts.length > 0);
        }
      } catch (error) {
        console.log("[ProductIndex] Lỗi khi tải danh sách sản phẩm:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isBestSellerList],
  );

  useEffect(() => {
    setProducts([]);
    setPage(1);
    setHasMore(true);
    setLoading(true);
    void fetchProducts(1, true);
  }, [fetchProducts]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    void fetchProducts(1, true);
  }, [fetchProducts]);

  const loadMore = useCallback(() => {
    if (isBestSellerList || loading || refreshing || !hasMore) {
      return;
    }

    setPage((prev) => {
      const nextPage = prev + 1;
      void fetchProducts(nextPage);
      return nextPage;
    });
  }, [fetchProducts, hasMore, isBestSellerList, loading, refreshing]);

  const handleAddProductToCart = async (product: Product) => {
    const productId = Number(product.id);

    if (!productId || addingProductId === productId) {
      return;
    }

    const isInactive = product.is_active === false;

    if (isInactive) {
      Alert.alert("Thông báo", "Sản phẩm hiện đang tạm ngưng bán");
      return;
    }

    try {
      setAddingProductId(productId);
      await checkBeforeAddToCart(productId, 1);

      const itemToAdd: CartItem = {
        id: productId,
        name: product.name,
        price: Number(product.discount_price || product.price),
        image: product.image,
        unit: product.unit,
        quantity: 1,
      };

      await addToCart(itemToAdd);
      Alert.alert("Thành công", `Đã thêm ${product.name} vào giỏ !`);
    } catch (error: any) {
      if (error.message === "AUTH_REQUIRED") {
        showLoginRequireAlert();
        return;
      }

      Alert.alert(
        "Lỗi",
        getAddToCartErrorMessage(error, "Không thể thêm vào giỏ hàng."),
      );
    } finally {
      setAddingProductId((currentId) =>
        currentId === productId ? null : currentId,
      );
    }
  };

  const buildProductBadges = useCallback(
    (product: Product) => {
      if (isBestSellerList) {
        return [];
      }

      const badges: {
        key: string;
        label: string;
        tone: "emerald" | "amber" | "violet";
      }[] = [];
      const originalPrice = getNumericPrice(product.price);
      const discountPrice = getNumericPrice(product.discount_price);
      const hasDiscount = discountPrice > 0 && discountPrice < originalPrice;
      const stockQuantity = Number.isFinite(product.stock_quantity)
        ? product.stock_quantity
        : 0;

      badges.push({
        key: `suggested-${product.id}`,
        label: "Đề xuất",
        tone: "violet",
      });

      if (hasDiscount) {
        badges.push({
          key: `discount-${product.id}`,
          label: "Giảm giá",
          tone: "amber",
        });
      }

      if (stockQuantity >= 20) {
        badges.push({
          key: `stock-${product.id}`,
          label: "Còn nhiều hàng",
          tone: "emerald",
        });
      }

      return badges.slice(0, 3);
    },
    [isBestSellerList],
  );

  const renderFooter = () => {
    if (!hasMore && products.length > 0) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isBestSellerList
              ? "Đây là danh sách bán chạy nổi bật hiện tại"
              : "Danh sách đã được trộn đa dạng danh mục để bạn khám phá tự nhiên hơn"}
          </Text>
        </View>
      );
    }

    if (loading && products.length > 0) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      );
    }

    return <View style={{ height: Spacing.xl }} />;
  };

  if (loading && products.length === 0) {
    return (
      <View style={styles.container}>
        <AppHeader
          title={isBestSellerList ? "Sản phẩm bán chạy" : "Chợ tươi hôm nay"}
          showBack
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang dọn hàng ra kệ...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={isBestSellerList ? "Sản phẩm bán chạy" : "Chợ tươi hôm nay"}
        showBack
      />

      <FlatList
        data={displayedProducts}
        numColumns={2}
        keyExtractor={(item, index) => `product-${item.id}-${index}`}
        contentContainerStyle={styles.listContainer}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        renderItem={({ item }) => (
          <View style={styles.cardWrapper}>
            <ProductCard
              product={item as never}
              badges={buildProductBadges(item)}
              stockDisplayMode={isBestSellerList ? "strict" : "optimistic"}
              isAdding={addingProductId === Number(item.id)}
              onPress={() => router.push(`/product/${item.id}` as never)}
              onAddToCart={() => void handleAddProductToCart(item)}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDFBF7",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: FontSize.base,
  },
  listContainer: {
    padding: Spacing.base,
    paddingBottom: Spacing.xxl,
  },
  columnWrapper: {
    justifyContent: "space-between",
    marginBottom: Spacing.base,
  },
  cardWrapper: {
    width: "48%",
  },
  footer: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    fontSize: FontSize.sm,
    color: Colors.textLight,
  },
});
