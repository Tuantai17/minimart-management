import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DeliveryAddressSelector from "../../src/components/address/DeliveryAddressSelector";
import BannerSlider from "../../src/components/home/BannerSlider";
import ProductCard from "../../src/components/home/ProductCard";
import { Colors, FontSize, Radius, Spacing } from "../../src/constants";
import { bannerService } from "../../src/services/banner.service";
import { categoryService } from "../../src/services/category.service";
import { productService } from "../../src/services/product.service";
import {
  useAddressStore,
  useAuthStore,
  useCartStore,
  useNotificationStore,
} from "../../src/store";

import type {
  Address,
  Banner,
  CartItem,
  Category,
  Product,
} from "../../src/types";
import {
  formatAddressShort,
  formatCurrency,
  getAddToCartErrorMessage,
  getImageUrl,
  getSelectedOrDefaultAddress,
  showLoginRequireAlert,
} from "../../src/utils";

const TOAST_HIDE_DELAY = 1800;

const getNumericPrice = (value: string | number | null | undefined): number => {
  const normalizedValue = Number(value ?? 0);
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
};

const prioritizeSuggestedProducts = (
  products: Product[],
  bestSellerProducts: Product[],
): Product[] => {
  const bestSellerIds = new Set(
    bestSellerProducts.map((product) => product.id),
  );

  return [...products].sort((first, second) => {
    const firstPrice = getNumericPrice(first.price);
    const secondPrice = getNumericPrice(second.price);
    const firstDiscountPrice = getNumericPrice(first.discount_price);
    const secondDiscountPrice = getNumericPrice(second.discount_price);
    const firstHasDiscount =
      firstDiscountPrice > 0 && firstDiscountPrice < firstPrice;
    const secondHasDiscount =
      secondDiscountPrice > 0 && secondDiscountPrice < secondPrice;

    const scoreProduct = (product: Product, hasDiscount: boolean) => {
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

      if (!bestSellerIds.has(product.id)) {
        score += 12;
      }

      score += Math.min(Math.max(product.stock_quantity ?? 0, 0), 20);

      return score;
    };

    const firstScore = scoreProduct(first, firstHasDiscount);
    const secondScore = scoreProduct(second, secondHasDiscount);

    if (firstScore !== secondScore) {
      return secondScore - firstScore;
    }

    return second.id - first.id;
  });
};

export default function HomeScreen() {
  const router = useRouter();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [showAddressSelector, setShowAddressSelector] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(16)).current;
  const hideToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const user = useAuthStore((state) => state.user);
  const addToCart = useCartStore((state) => state.addToCart);
  const checkBeforeAddToCart = useCartStore(
    (state) => state.checkBeforeAddToCart,
  );
  const totalCartItems = useCartStore((state) => state.getTotalItems());
  const fetchCart = useCartStore((state) => state.fetchCart);
  const addresses = useAddressStore((state) => state.addresses);
  const selectedDeliveryAddressId = useAddressStore(
    (state) => state.selectedDeliveryAddressId,
  );
  const isLoadingAddresses = useAddressStore(
    (state) => state.isLoadingAddresses,
  );
  const addressError = useAddressStore((state) => state.addressError);
  const fetchAddresses = useAddressStore((state) => state.fetchAddresses);
  const setSelectedDeliveryAddress = useAddressStore(
    (state) => state.setSelectedDeliveryAddress,
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification,
  );
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  const [categories, setCategories] = useState<Category[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [pageProducts, setPageProducts] = useState<Product[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingBestSellers, setLoadingBestSellers] = useState(true);
  const [bestSellerError, setBestSellerError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);

  const currentDeliveryAddress = useMemo(
    () => getSelectedOrDefaultAddress(addresses, selectedDeliveryAddressId),
    [addresses, selectedDeliveryAddressId],
  );

  const displayedProducts = useMemo(
    () => prioritizeSuggestedProducts(pageProducts, bestSellers),
    [pageProducts, bestSellers],
  );

  const visiblePaginationItems = useMemo<(number | string)[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages: (number | string)[] = [1];
    const startPage = Math.max(2, currentPage - 1);
    const endPage = Math.min(totalPages - 1, currentPage + 1);

    if (startPage > 2) {
      pages.push("ellipsis-start");
    }

    for (let page = startPage; page <= endPage; page += 1) {
      pages.push(page);
    }

    if (endPage < totalPages - 1) {
      pages.push("ellipsis-end");
    }

    pages.push(totalPages);

    return pages;
  }, [currentPage, totalPages]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoadingInitial(true);
        setLoadingBestSellers(true);
        setBestSellerError(null);

        const [cats, prodsRes] = await Promise.all([
          categoryService.getAll(),
          productService.getAll({ page: 1 }),
        ]);

        setCategories(cats);
        setPageProducts(prodsRes.results || []);

        const serverPageSize = prodsRes.results?.length || 10;
        setTotalPages(Math.ceil((prodsRes.count || 0) / serverPageSize) || 1);

        void Promise.allSettled([
          productService.getBestSelling({ limit: 4, hydrateDetails: false }),
          fetchCart(),
        ]).then((results) => {
          const bestSellerResult = results[0];

          if (bestSellerResult.status === "fulfilled") {
            setBestSellers(bestSellerResult.value.results || []);
            setBestSellerError(null);
          } else {
            console.log(
              "[HomeScreen] Loi tai best-seller:",
              bestSellerResult.reason,
            );
            setBestSellers([]);
            setBestSellerError(
              "Top bán chạy đang tải chậm. Bạn vẫn có thể mua sắm bình thường.",
            );
          }

          setLoadingBestSellers(false);

          const cartResult = results[1];

          if (cartResult.status === "rejected") {
            console.log("[HomeScreen] Loi tai gio hang:", cartResult.reason);
          }
        });
      } catch (error) {
        console.log("Loi tai du lieu HomeScreen:", error);
      } finally {
        setLoadingInitial(false);
      }
    };

    void fetchInitialData();
  }, [fetchCart]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) {
        return;
      }

      void fetchAddresses().catch(() => {
        showHomeToast("Khong the tai dia chi giao hang");
      });
    }, [fetchAddresses, user?.id]),
  );

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        setLoadingBanners(true);
        const bannerData = await bannerService.getAll();
        setBanners(bannerData);
      } catch (error) {
        console.log("[HomeScreen] Loi tai banner:", error);
        setBanners([]);
      } finally {
        setLoadingBanners(false);
      }
    };

    void fetchBanners();
  }, []);

  useEffect(() => {
    return () => {
      if (hideToastTimeoutRef.current) {
        clearTimeout(hideToastTimeoutRef.current);
        hideToastTimeoutRef.current = null;
      }
      toastOpacity.stopAnimation();
      toastTranslateY.stopAnimation();
    };
  }, [toastOpacity, toastTranslateY]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const fetchPageData = async () => {
      try {
        setLoadingPage(true);
        const res = await productService.getAll({ page: currentPage });
        setPageProducts(res.results || []);
      } catch (error) {
        console.log("Loi tai du lieu page HomeScreen:", error);
      } finally {
        setLoadingPage(false);
      }
    };

    void fetchPageData();
  }, [currentPage]);

  const handlePressBanner = async (banner: Banner) => {
    if (!banner.link) {
      return;
    }

    try {
      await Linking.openURL(banner.link);
    } catch (error) {
      console.log(
        "[HomeScreen] Khong mo duoc banner link:",
        banner.link,
        error,
      );
      Alert.alert("Thong bao", "Khong the mo noi dung banner luc nay.");
    }
  };

  const showHomeToast = (message: string) => {
    if (hideToastTimeoutRef.current) {
      clearTimeout(hideToastTimeoutRef.current);
      hideToastTimeoutRef.current = null;
    }

    setToastMessage(message);
    setToastVisible(true);

    toastOpacity.stopAnimation();
    toastTranslateY.stopAnimation();

    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(toastTranslateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();

    hideToastTimeoutRef.current = setTimeout(() => {
      hideToastTimeoutRef.current = null;

      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: false,
        }),
        Animated.timing(toastTranslateY, {
          toValue: 16,
          duration: 180,
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setToastVisible(false);
        }
      });
    }, TOAST_HIDE_DELAY);
  };

  const openAddressSelector = async () => {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }

    try {
      const nextAddresses =
        addresses.length > 0 ? addresses : await fetchAddresses();

      if (nextAddresses.length === 0) {
        showHomeToast("Ban chua co dia chi giao hang");
        router.push("/profile/addresses");
        return;
      }

      setShowAddressSelector(true);
    } catch {
      showHomeToast("Khong the tai dia chi giao hang");
    }
  };

  const handleSelectDeliveryAddress = async (address: Address) => {
    await setSelectedDeliveryAddress(address.id);
    setShowAddressSelector(false);
    showHomeToast("Da cap nhat dia chi giao den");
    addNotification({
      title: "Thong bao",
      message: "Da cap nhat dia chi giao den",
      type: "success",
    });
  };

  const handleManageAddresses = () => {
    setShowAddressSelector(false);
    router.push("/profile/addresses");
  };

  const handleAddAddress = () => {
    setShowAddressSelector(false);
    router.push("/profile/address-form");
  };

  const handleAddProductToCart = async (product: Product) => {
    const productId = Number(product.id);

    if (!productId || addingProductId === productId) {
      return;
    }

    const hasStockInfo = Number.isFinite(product.stock_quantity);

    if (hasStockInfo && (product.stock_quantity ?? 0) <= 0) {
      showHomeToast("Sản phẩm hiện đã hết hàng");
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
      showHomeToast(`Da them ${product.name} vao gio hang`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        showLoginRequireAlert();
        return;
      }

      const displayMessage = getAddToCartErrorMessage(
        error,
        "Khong the them vao gio hang. Vui long thu lai!",
      );

      showHomeToast(displayMessage);

      if (!displayMessage) {
        Alert.alert(
          "Thong bao",
          "Khong the them vao gio hang. Vui long thu lai!",
        );
      }
    } finally {
      setAddingProductId((currentId) =>
        currentId === productId ? null : currentId,
      );
    }
  };

  if (loadingInitial) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const safeCategories = Array.isArray(categories) ? categories : [];
  const locationAddressText = user
    ? currentDeliveryAddress
      ? formatAddressShort(currentDeliveryAddress)
      : isLoadingAddresses
        ? "Dang tai dia chi..."
        : "Them dia chi giao hang"
    : "Dang nhap de them dia chi";

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        <LinearGradient
          colors={["#022C22", "#054030", "#064E3B"]}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.locationRow}
              activeOpacity={0.85}
              onPress={() => void openAddressSelector()}
            >
              <Ionicons name="location" size={18} color={Colors.textWhite} />
              <View style={styles.locationTextCol}>
                <Text style={styles.locationLabel}>Giao đến</Text>
                <Text
                  style={styles.locationAddress}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {locationAddressText}
                </Text>
              </View>
              <Ionicons
                name="chevron-down"
                size={16}
                color={Colors.textWhite}
              />
            </TouchableOpacity>
            <View style={styles.headerIcons}>
              <TouchableOpacity
                style={styles.notifBtn}
                onPress={() => router.push("/profile/notifications" as never)}
              >
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color={Colors.textWhite}
                />
                {unreadCount > 0 ? (
                  <View style={styles.notifDot}>
                    <Text style={styles.notifDotText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.notifBtn}
                onPress={() => router.push("/cart" as never)}
              >
                <Ionicons
                  name="cart-outline"
                  size={22}
                  color={Colors.textWhite}
                />
                {totalCartItems > 0 ? (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>
                      {totalCartItems > 99 ? "99+" : totalCartItems}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>

          {addressError && addresses.length === 0 ? (
            <Text style={styles.locationHintError}>
              Khong the tai dia chi giao hang
            </Text>
          ) : null}
        </LinearGradient>

        <View style={styles.searchContainerIOS}>
          <TouchableOpacity
            style={styles.searchBar}
            onPress={() => router.push("/search" as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="search-outline" size={20} color="#9CA3AF" />
            <Text style={styles.searchPlaceholder}>
              Tìm kiếm thực phẩm, đồ gia dụng...
            </Text>
          </TouchableOpacity>
        </View>

        {loadingBanners || banners.length > 0 ? (
          <View style={styles.bannerSection}>
            {loadingBanners ? (
              <View style={styles.bannerLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : (
              <BannerSlider
                banners={banners}
                onPressBanner={handlePressBanner}
              />
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader
            title="Danh mục"
            onSeeAll={() => router.push("/(tabs)/category" as never)}
          />
          <FlatList
            data={safeCategories}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: Spacing.base }}
            ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={styles.categoryItem}
                onPress={() => router.push(`/category/${cat.id}` as never)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryImageWrapper}>
                  <Image
                    source={{ uri: getImageUrl(cat.image) }}
                    style={styles.apiCategoryImage}
                    resizeMode="cover"
                  />
                </View>
                <Text style={styles.categoryName} numberOfLines={2}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id.toString()}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Bán chạy nhất"
            icon="flame"
            iconColor="#F59E0B"
            onSeeAll={() =>
              router.push("/product?list_type=best_seller" as never)
            }
          />
          {loadingBestSellers ? (
            <View style={styles.bestSellerFallbackWrap}>
              {[0, 1].map((item) => (
                <View
                  key={`best-seller-skeleton-${item}`}
                  style={styles.bestSellerSkeletonCard}
                >
                  <View style={styles.bestSellerSkeletonImage} />
                  <View style={styles.bestSellerSkeletonBody}>
                    <View style={styles.bestSellerSkeletonChip} />
                    <View style={styles.bestSellerSkeletonTitle} />
                    <View style={styles.bestSellerSkeletonMeta} />
                    <View style={styles.bestSellerSkeletonPrice} />
                  </View>
                </View>
              ))}
            </View>
          ) : bestSellers.length > 0 ? (
            <FlatList
              data={bestSellers}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
              ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
              snapToInterval={Dimensions.get("window").width * 0.85 + 16}
              decelerationRate="fast"
              renderItem={({ item: product }) => {
                const hasStockInfo = Number.isFinite(product.stock_quantity);
                const isOutOfStock =
                  hasStockInfo && product.stock_quantity <= 0;
                const isAdding = addingProductId === Number(product.id);
                const soldCount = product.total_sold ?? 0;

                return (
                  <TouchableOpacity
                    style={[
                      styles.bestSellerOuter,
                      {
                        width: Dimensions.get("window").width * 0.85,
                        marginHorizontal: 0,
                      },
                    ]}
                    onPress={() =>
                      router.push(`/product/${product.id}` as never)
                    }
                    activeOpacity={0.65}
                  >
                    <View style={styles.bestSellerInner}>
                      <View style={styles.bsImagePlaceholder}>
                        <Image
                          source={{ uri: getImageUrl(product.image) }}
                          style={styles.bestSellerImage}
                          resizeMode="cover"
                        />
                        {isOutOfStock && (
                          <View style={styles.bsOutOfStockOverlay}>
                            <Text style={styles.bsOutOfStockText}>
                              Hết hàng
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.bsInfo}>
                        <View style={styles.bsMetaRow}>
                          <View style={styles.bsRankChip}>
                            <Text style={styles.bsRankText}>
                              Top #{product.rank ?? "-"}
                            </Text>
                          </View>
                          <Text style={styles.bsSoldText}>
                            Đã bán {soldCount}
                          </Text>
                        </View>
                        <Text style={styles.bsName} numberOfLines={1}>
                          {product.name}
                        </Text>
                        <Text style={styles.bsUnit}>{product.unit}</Text>
                        <Text style={styles.bsPrice}>
                          {formatCurrency(
                            Number(product.discount_price || product.price),
                          )}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.addBtnCircle,
                          isOutOfStock || isAdding
                            ? styles.addBtnCircleDisabled
                            : null,
                        ]}
                        disabled={isOutOfStock || isAdding}
                        onPress={(event) => {
                          event.stopPropagation();
                          void handleAddProductToCart(product);
                        }}
                        activeOpacity={0.65}
                      >
                        {isAdding ? (
                          <ActivityIndicator
                            size="small"
                            color={Colors.white}
                          />
                        ) : (
                          <Ionicons
                            name="add"
                            size={20}
                            color={isOutOfStock ? "#9CA3AF" : Colors.white}
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              }}
              keyExtractor={(item) => item.id.toString()}
            />
          ) : (
            <View style={styles.bestSellerEmptyCard}>
              <View style={styles.bestSellerEmptyIconWrap}>
                <Ionicons name="flash-outline" size={22} color="#B45309" />
              </View>
              <View style={styles.bestSellerEmptyContent}>
                <Text style={styles.bestSellerEmptyTitle}>
                  Bảng xếp hạng bán chạy đang được cập nhật
                </Text>
                <Text style={styles.bestSellerEmptyText}>
                  {bestSellerError ||
                    "Dữ liệu bán chạy chưa sẵn sàng. Bạn có thể xem toàn bộ sản phẩm trong lúc chờ tải."}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.bestSellerEmptyButton}
                onPress={() => router.push("/product" as never)}
                activeOpacity={0.85}
              >
                <Text style={styles.bestSellerEmptyButtonText}>
                  Xem sản phẩm
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Gợi ý cho bạn"
            onSeeAll={() => router.push("/product" as never)}
          />
          <View style={styles.productsGrid}>
            {loadingPage ? (
              <View style={styles.pageLoadingContainer}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : (
              (displayedProducts || []).map((product) => (
                <ProductCard
                  key={`suggest-${product.id}`}
                  product={product as never}
                  isAdding={addingProductId === Number(product.id)}
                  onPress={() => router.push(`/product/${product.id}` as never)}
                  onAddToCart={() => void handleAddProductToCart(product)}
                />
              ))
            )}
          </View>

          {totalPages > 1 ? (
            <View style={styles.paginationContainer}>
              <TouchableOpacity
                style={[
                  styles.pageButton,
                  currentPage === 1 ? styles.pageButtonDisabled : null,
                ]}
                disabled={currentPage === 1}
                onPress={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={currentPage === 1 ? Colors.border : Colors.primary}
                />
              </TouchableOpacity>

              <View style={styles.pageNumbersRow}>
                {visiblePaginationItems.map((item, index) => {
                  if (typeof item !== "number") {
                    return (
                      <View
                        key={`${item}-${index}`}
                        style={styles.paginationEllipsis}
                      >
                        <Text style={styles.paginationEllipsisText}>...</Text>
                      </View>
                    );
                  }

                  const isActive = currentPage === item;

                  return (
                    <TouchableOpacity
                      key={`page-${item}`}
                      style={[
                        styles.pageNumber,
                        isActive ? styles.pageNumberActive : null,
                      ]}
                      onPress={() => setCurrentPage(item)}
                    >
                      <Text
                        style={[
                          styles.pageNumberText,
                          isActive ? styles.pageNumberTextActive : null,
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[
                  styles.pageButton,
                  currentPage === totalPages ? styles.pageButtonDisabled : null,
                ]}
                disabled={currentPage === totalPages}
                onPress={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={
                    currentPage === totalPages ? Colors.border : Colors.primary
                  }
                />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>

      <DeliveryAddressSelector
        visible={showAddressSelector}
        addresses={addresses}
        selectedAddressId={currentDeliveryAddress?.id || null}
        isLoading={isLoadingAddresses}
        onClose={() => setShowAddressSelector(false)}
        onSelect={(address) => void handleSelectDeliveryAddress(address)}
        onManageAddresses={handleManageAddresses}
        onAddAddress={handleAddAddress}
      />

      {toastVisible ? (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              pointerEvents: "none",
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <Text style={styles.toastText} numberOfLines={2}>
            {toastMessage}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function SectionHeader({
  title,
  icon,
  iconColor,
  onSeeAll,
}: {
  title: string;
  icon?: string;
  iconColor?: string;
  onSeeAll: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        {icon ? (
          <Ionicons
            name={icon as never}
            size={22}
            color={iconColor || "#064E3B"}
            style={{ marginRight: 6 }}
          />
        ) : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <TouchableOpacity onPress={onSeeAll} activeOpacity={0.65}>
        <Text style={styles.seeAll}>Xem tất cả</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FDFBF7" },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  header: {
    paddingTop: 64, // extended padding
    paddingBottom: 48, // space for overlapping search bar
    paddingHorizontal: Spacing.lg,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: Spacing.sm,
  },
  locationTextCol: { marginLeft: Spacing.sm, flex: 1, marginRight: Spacing.xs },
  locationLabel: {
    fontSize: FontSize.xs,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  locationAddress: {
    fontSize: FontSize.base,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: Colors.white,
    marginTop: 2,
  },
  locationHintError: {
    marginTop: Spacing.sm,
    color: "#FCA5A5",
    fontSize: FontSize.sm,
  },
  headerIcons: { flexDirection: "row", gap: 12 },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  notifDot: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#EF4444",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
  },
  notifDotText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  cartBadge: {
    position: "absolute",
    top: 6,
    right: 4,
    backgroundColor: "#EF4444",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  searchContainerIOS: {
    marginTop: -28,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 32,
    paddingHorizontal: Spacing.lg,
    height: 56,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 16px 32px rgba(5, 5, 5, 0.05)",
        }
      : {
          shadowColor: "#050505",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.05,
          shadowRadius: 32,
          elevation: 8,
        }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: FontSize.base,
    color: "#9CA3AF",
    fontWeight: "500",
    marginLeft: Spacing.sm,
  },
  bannerSection: {
    marginTop: Spacing.md,
  },
  bannerLoading: {
    height: 180,
    marginHorizontal: Spacing.lg,
    borderRadius: 28,
    backgroundColor: Colors.white,
    justifyContent: "center",
    alignItems: "center",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 16px 24px rgba(5, 5, 5, 0.04)",
        }
      : {
          shadowColor: "#050505",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.04,
          shadowRadius: 24,
          elevation: 4,
        }),
  },
  section: { marginTop: 40 }, // macro whitespace
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center" },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#111827",
  },
  seeAll: {
    fontSize: FontSize.sm,
    color: "#064E3B",
    fontWeight: "700",
    marginBottom: 2,
  },
  categoryItem: { alignItems: "center", width: 80 },
  categoryImageWrapper: {
    width: 64,
    height: 64,
    borderRadius: 24, // squircle architecture
    overflow: "hidden",
    backgroundColor: Colors.white,
    marginBottom: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.03)",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 8px 16px rgba(5, 5, 5, 0.03)",
        }
      : {
          shadowColor: "#050505",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.03,
          shadowRadius: 16,
          elevation: 4,
        }),
  },
  apiCategoryImage: { width: "100%", height: "100%" },
  categoryName: {
    fontSize: FontSize.xs,
    color: "#4B5563",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 16,
  },
  bestSellerOuter: {
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.02)",
    marginHorizontal: Spacing.lg,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.03)",
  },
  bestSellerInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 26,
    padding: Spacing.lg,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 12px 20px rgba(5, 5, 5, 0.04)",
        }
      : {
          shadowColor: "#050505",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.04,
          shadowRadius: 20,
          elevation: 5,
        }),
  },
  bsImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#FDFBF7",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  bestSellerImage: { width: 80, height: 80, borderRadius: 20 },
  bsOutOfStockOverlay: {
    position: "absolute",
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  bsOutOfStockText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  bsInfo: { flex: 1, marginLeft: Spacing.md },
  bsMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: Spacing.sm,
  },
  bsRankChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: "#FEF3C7",
  },
  bsRankText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B45309",
    letterSpacing: 0.2,
  },
  bsSoldText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  bsName: {
    fontSize: FontSize.md,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: "#111827",
  },
  bsUnit: { fontSize: FontSize.sm, color: "#6B7280", marginTop: 4 },
  bsPrice: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#064E3B",
    marginTop: 6,
  },
  bestSellerFallbackWrap: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  bestSellerSkeletonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 26,
    padding: Spacing.lg,
    ...((Platform.OS === "web"
      ? {
          boxShadow: "0px 12px 20px rgba(5, 5, 5, 0.04)",
        }
      : {
          shadowColor: "#050505",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.04,
          shadowRadius: 20,
          elevation: 5,
        }) as object),
  },
  bestSellerSkeletonImage: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
  },
  bestSellerSkeletonBody: {
    flex: 1,
    marginLeft: Spacing.md,
    gap: 10,
  },
  bestSellerSkeletonChip: {
    width: 72,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: "#FEF3C7",
  },
  bestSellerSkeletonTitle: {
    width: "82%",
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  bestSellerSkeletonMeta: {
    width: "48%",
    height: 12,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
  },
  bestSellerSkeletonPrice: {
    width: "34%",
    height: 18,
    borderRadius: 8,
    backgroundColor: "#D1FAE5",
  },
  bestSellerEmptyCard: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: 26,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  bestSellerEmptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  bestSellerEmptyContent: {
    flex: 1,
    gap: 4,
  },
  bestSellerEmptyTitle: {
    fontSize: FontSize.base,
    fontWeight: "800",
    color: "#9A3412",
  },
  bestSellerEmptyText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: "#C2410C",
  },
  bestSellerEmptyButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: "#EA580C",
  },
  bestSellerEmptyButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.white,
  },
  addBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#064E3B",
    justifyContent: "center",
    alignItems: "center",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 8px rgba(6, 78, 59, 0.2)",
        }
      : {
          shadowColor: "#064E3B",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        }),
    marginLeft: Spacing.sm,
  },
  addBtnCircleDisabled: { backgroundColor: "#F3F4F6", shadowOpacity: 0 },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.base,
    justifyContent: "space-between",
  },
  pageLoadingContainer: {
    width: "100%",
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  toastContainer: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: 100,
    backgroundColor: "#064E3B",
    borderRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 8px 16px rgba(6, 78, 59, 0.2)",
        }
      : {
          shadowColor: "#064E3B",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.2,
          shadowRadius: 16,
          elevation: 6,
        }),
  },
  toastText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 32,
    marginBottom: 40,
    paddingHorizontal: Spacing.base,
  },
  pageNumbersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
  },
  pageButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 8,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 12px rgba(5, 5, 5, 0.04)",
        }
      : {
          shadowColor: "#050505",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.04,
          shadowRadius: 12,
          elevation: 2,
        }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
  },
  pageButtonDisabled: {
    backgroundColor: "rgba(0,0,0,0.02)",
    shadowOpacity: 0,
    elevation: 0,
  },
  pageNumber: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
    paddingHorizontal: 10,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 4px 12px rgba(5, 5, 5, 0.04)",
        }
      : {
          shadowColor: "#050505",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.04,
          shadowRadius: 12,
          elevation: 2,
        }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
  },
  paginationEllipsis: {
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
  },
  paginationEllipsisText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 1,
  },
  pageNumberActive: {
    backgroundColor: "#064E3B",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0px 8px 16px rgba(6, 78, 59, 0.2)",
        }
      : {
          shadowColor: "#064E3B",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.2,
          shadowRadius: 16,
          elevation: 6,
        }),
    borderColor: "#064E3B",
  },
  pageNumberText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: "#4B5563",
  },
  pageNumberTextActive: { color: Colors.white },
});
