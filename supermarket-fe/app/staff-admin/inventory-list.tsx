import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { categoryService } from "../../src/services/category.service";
import { productService } from "../../src/services/product.service";
import { useAuthStore } from "../../src/store/auth.store";
import type { Category, Product } from "../../src/types";
import { formatCurrency, getImageUrl } from "../../src/utils";
import {
    getInventoryBadges,
    getInventoryHeadline,
    getProductStock,
    isStoppedProduct,
    LOW_STOCK_THRESHOLD,
    matchesInventoryFilter,
    type InventoryFilter,
} from "../../src/utils/inventory";

type ProfileRole = "customer" | "staff" | "admin";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

const FILTER_META: Record<
  string,
  { title: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  ALL: { title: "Tất cả sản phẩm", icon: "albums-outline", color: "#2563EB" },
  ACTIVE: {
    title: "Sản phẩm đang bán",
    icon: "checkmark-circle-outline",
    color: "#16A34A",
  },
  LOW: {
    title: "Sản phẩm tồn thấp",
    icon: "warning-outline",
    color: "#D97706",
  },
  OUT: {
    title: "Sản phẩm hết hàng",
    icon: "close-circle-outline",
    color: "#DC2626",
  },
};

const getRole = ({
  authRole,
  isStaff,
  isSuperuser,
  user,
}: {
  authRole: ProfileRole | null;
  isStaff: boolean;
  isSuperuser: boolean;
  user: { is_staff?: boolean; is_superuser?: boolean } | null;
}): ProfileRole =>
  isSuperuser || user?.is_superuser
    ? "admin"
    : isStaff || user?.is_staff
      ? "staff"
      : authRole || "customer";

const collectCategoryIds = (item: Category): number[] => [
  item.id,
  ...(Array.isArray(item.children)
    ? item.children.flatMap((child) => collectCategoryIds(child))
    : []),
];

const collectProducts = (item: Category): Product[] => {
  const productMap = new Map<number, Product>();
  const visit = (category: Category) => {
    (category.products || []).forEach((p) => productMap.set(p.id, p));
    (category.children || []).forEach(visit);
  };
  visit(item);
  return Array.from(productMap.values());
};

const fetchTargetProducts = async (
  filter: InventoryFilter,
): Promise<Product[]> => {
  if (filter === "LOW" || filter === "OUT") {
    const res = await productService.getLowStock();
    return res.results.map((product) => ({
      ...product,
      image: getImageUrl(product.image),
    }));
  }

  const productMap = new Map<number, Product>();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await productService.getAll({ page, limit: PAGE_SIZE });

    response.results.forEach((product) => {
      productMap.set(product.id, {
        ...product,
        image: getImageUrl(product.image),
      });
    });

    if (!response.next || response.results.length === 0) {
      break;
    }
  }

  return Array.from(productMap.values());
};

export default function InventoryListScreen() {
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const initialFilter = (
    ["ALL", "ACTIVE", "LOW", "OUT"].includes(filterParam || "")
      ? filterParam
      : "ALL"
  ) as InventoryFilter;

  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authRole = useAuthStore((state) => state.role);
  const isStaff = useAuthStore((state) => state.isStaff);
  const isSuperuser = useAuthStore((state) => state.isSuperuser);

  const role = getRole({ authRole, isStaff, isSuperuser, user });
  const canAccess = role === "staff" || role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [activeFilter, setActiveFilter] =
    useState<InventoryFilter>(initialFilter);
  const [selectedRootId, setSelectedRootId] = useState<number | "ALL">("ALL");

  const fetchInventory = useCallback(
    async (showRefresh = false) => {
      if (!canAccess) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const [categoryTree, allProducts] = await Promise.all([
          categoryService.getTree(showRefresh),
          fetchTargetProducts(activeFilter),
        ]);

        setCategories(categoryTree);
        setProducts(allProducts);
      } catch (err: any) {
        setError(
          err?.response?.data?.detail ??
            err?.message ??
            "Không thể tải dữ liệu hàng hóa.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canAccess, activeFilter],
  );

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
      return undefined;
    }, [fetchInventory]),
  );

  const filteredProductsByStatus = useMemo(
    () =>
      products.filter((product) =>
        matchesInventoryFilter(product, activeFilter),
      ),
    [products, activeFilter],
  );

  const rootOptions = useMemo(() => {
    return categories
      .map((item) => {
        const catIds = new Set<number>(collectCategoryIds(item));
        const matchingCount = filteredProductsByStatus.filter((p) =>
          catIds.has(p.category),
        ).length;

        return {
          id: item.id,
          name: item.name,
          categoryIds: catIds,
          totalProducts: matchingCount,
        };
      })
      .filter((item) => item.totalProducts > 0);
  }, [categories, filteredProductsByStatus]);

  const visibleProducts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const selectedRoot = rootOptions.find((item) => item.id === selectedRootId);

    return filteredProductsByStatus
      .filter(
        (product) =>
          !selectedRoot || selectedRoot.categoryIds.has(product.category),
      )
      .filter((product) => {
        if (!normalizedKeyword) return true;
        return (
          String(product.name || "")
            .toLowerCase()
            .includes(normalizedKeyword) ||
          String(product.category_name || "")
            .toLowerCase()
            .includes(normalizedKeyword) ||
          String(product.description || "")
            .toLowerCase()
            .includes(normalizedKeyword)
        );
      })
      .sort((a, b) => {
        const scoreA = isStoppedProduct(a)
          ? 0
          : getProductStock(a) <= LOW_STOCK_THRESHOLD
            ? 1
            : 2;
        const scoreB = isStoppedProduct(b)
          ? 0
          : getProductStock(b) <= LOW_STOCK_THRESHOLD
            ? 1
            : 2;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return getProductStock(a) - getProductStock(b);
      });
  }, [filteredProductsByStatus, keyword, rootOptions, selectedRootId]);

  const meta = FILTER_META[activeFilter] || FILTER_META.ALL;

  // ───── Không có quyền ─────
  if (!canAccess) {
    return (
      <View style={styles.container}>
        <AppHeader title="Danh sách hàng hóa" showBack />
        <View style={styles.centerWrap}>
          <Text style={styles.blockTitle}>Bạn không có quyền truy cập</Text>
        </View>
      </View>
    );
  }

  // ───── Giao diện chính ─────
  return (
    <View style={styles.container}>
      <AppHeader title={meta.title} showBack />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchInventory(true)}
            tintColor={Colors.primary}
          />
        }
      >
        {/* ── Filter header ── */}
        <View
          style={[styles.filterHeader, { backgroundColor: meta.color + "12" }]}
        >
          <Ionicons name={meta.icon} size={20} color={meta.color} />
          <Text style={[styles.filterHeaderText, { color: meta.color }]}>
            {meta.title}
          </Text>
          {!loading && (
            <View style={[styles.countBadge, { backgroundColor: meta.color }]}>
              <Text style={styles.countBadgeText}>
                {visibleProducts.length}
              </Text>
            </View>
          )}
        </View>

        {/* ── Bộ lọc & Tìm kiếm ── */}
        <View style={styles.panelCard}>
          <View style={styles.searchBox}>
            <Ionicons
              name="search-outline"
              size={18}
              color={Colors.textSecondary}
            />
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="Tìm theo tên sản phẩm hoặc danh mục..."
              placeholderTextColor={Colors.textLight}
              style={styles.searchInput}
            />
            {keyword ? (
              <TouchableOpacity
                onPress={() => setKeyword("")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={Colors.textLight}
                />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <TouchableOpacity
              style={[
                styles.softChip,
                selectedRootId === "ALL" && styles.softChipActive,
              ]}
              onPress={() => setSelectedRootId("ALL")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.softChipText,
                  selectedRootId === "ALL" && styles.softChipTextActive,
                ]}
              >
                Tất cả danh mục
              </Text>
            </TouchableOpacity>

            {rootOptions.map((item) => {
              const isActive = selectedRootId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.softChip, isActive && styles.softChipActive]}
                  onPress={() => setSelectedRootId(item.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.softChipText,
                      isActive && styles.softChipTextActive,
                    ]}
                  >
                    {item.name} ({item.totalProducts})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Content ── */}
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.stateText}>Đang tải dữ liệu hàng hóa...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={22} color="#B91C1C" />
            <Text style={styles.errorTitle}>Không tải được dữ liệu</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => fetchInventory()}
              activeOpacity={0.85}
            >
              <Text style={styles.retryText}>Tải lại</Text>
            </TouchableOpacity>
          </View>
        ) : visibleProducts.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="cube-outline" size={34} color="#94A3B8" />
            <Text style={styles.stateText}>Không có sản phẩm phù hợp.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {visibleProducts.map((product) => {
              const badges = getInventoryBadges(product);
              const headline = getInventoryHeadline(product);
              const stock = getProductStock(product);
              const stopped = isStoppedProduct(product);

              return (
                <TouchableOpacity
                  key={product.id}
                  style={[
                    styles.productCard,
                    stopped && styles.productCardStopped,
                  ]}
                  onPress={() =>
                    router.push(
                      `/staff-admin/inventory-product/${product.id}` as any,
                    )
                  }
                  activeOpacity={0.88}
                >
                  <Image
                    source={{ uri: getImageUrl(product.image) }}
                    style={[
                      styles.productImage,
                      stopped && styles.productImageStopped,
                    ]}
                  />

                  <View style={styles.productBody}>
                    <Text style={styles.productName} numberOfLines={2}>
                      {product.name}
                    </Text>
                    <Text style={styles.productCategory}>
                      {product.category_name}
                    </Text>

                    {badges.length > 0 && (
                      <View style={styles.badgeRow}>
                        {badges.map((badge) => (
                          <View
                            key={`${product.id}-${badge.label}`}
                            style={[
                              styles.badge,
                              { backgroundColor: badge.bg },
                            ]}
                          >
                            <Text
                              style={[styles.badgeText, { color: badge.color }]}
                            >
                              {badge.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <Text style={styles.headlineText} numberOfLines={1}>
                      {headline}
                    </Text>

                    <View style={styles.productInfoRow}>
                      <View style={styles.productInfoItem}>
                        <Ionicons
                          name="cube-outline"
                          size={14}
                          color={
                            stock <= LOW_STOCK_THRESHOLD && stock > 0
                              ? "#D97706"
                              : stock <= 0
                                ? "#DC2626"
                                : "#16A34A"
                          }
                        />
                        <Text
                          style={[
                            styles.productInfoText,
                            stock <= LOW_STOCK_THRESHOLD &&
                              stock > 0 && { color: "#D97706" },
                            stock <= 0 && { color: "#DC2626" },
                          ]}
                        >
                          Tồn: {stock} {product.unit || "sp"}
                        </Text>
                      </View>

                      <View style={styles.productInfoItem}>
                        <Ionicons
                          name="pricetag-outline"
                          size={14}
                          color="#64748B"
                        />
                        <Text style={styles.productInfoText}>
                          {formatCurrency(
                            Number(
                              product.discount_price || product.price || 0,
                            ),
                          )}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color="#94A3B8"
                    style={styles.productArrow}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEF3F9",
  },
  content: {
    padding: Spacing.base,
    paddingBottom: 42,
    gap: Spacing.base,
  },
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  blockTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
  },

  /* ── Filter Header ── */
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.lg,
  },
  filterHeaderText: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: "800",
  },
  countBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.white,
  },

  /* ── Panel ── */
  panelCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    gap: Spacing.md,
    ...Shadow.small,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    paddingVertical: 12,
  },
  chipRow: {
    gap: 8,
    paddingRight: 8,
  },

  softChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: "#EFF6FF",
  },
  softChipActive: {
    backgroundColor: "#0EA5E9",
  },
  softChipText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  softChipTextActive: {
    color: Colors.white,
  },

  /* ── States ── */
  stateCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    ...Shadow.small,
  },
  stateText: {
    fontSize: FontSize.base,
    color: "#64748B",
    textAlign: "center",
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: Spacing.sm,
  },
  errorTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: "#991B1B",
  },
  errorText: {
    fontSize: FontSize.base,
    lineHeight: 20,
    color: "#7F1D1D",
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: Colors.error,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },

  /* ── Product list ── */
  list: {
    gap: Spacing.md,
  },
  productCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: Spacing.base,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    ...Shadow.small,
  },
  productCardStopped: {
    opacity: 0.6,
    backgroundColor: "#FAFAFA",
  },
  productImage: {
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
  },
  productImageStopped: {
    opacity: 0.5,
  },
  productBody: {
    flex: 1,
    gap: 5,
  },
  productName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  productCategory: {
    fontSize: FontSize.xs,
    color: "#94A3B8",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  headlineText: {
    fontSize: FontSize.xs,
    lineHeight: 17,
    color: "#475569",
  },
  productInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  productInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  productInfoText: {
    fontSize: FontSize.xs,
    fontWeight: "600",
    color: "#475569",
  },
  productArrow: {
    alignSelf: "center",
  },
});
