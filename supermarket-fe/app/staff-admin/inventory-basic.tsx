import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { categoryService } from "../../src/services/category.service";
import { productService } from "../../src/services/product.service";
import { useAuthStore } from "../../src/store/auth.store";
import type { Category, Product } from "../../src/types";
import { getImageUrl } from "../../src/utils";
import {
    getProductStock,
    isStoppedProduct,
    LOW_STOCK_THRESHOLD,
} from "../../src/utils/inventory";

type ProfileRole = "customer" | "staff" | "admin";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

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

const flattenCategories = (items: Category[]): Category[] =>
  items.flatMap((item) => [
    item,
    ...(Array.isArray(item.children) ? flattenCategories(item.children) : []),
  ]);

const fetchAllProducts = async (): Promise<Product[]> => {
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

export default function InventoryBasicScreen() {
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
          fetchAllProducts(),
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
    [canAccess],
  );

  useFocusEffect(
    useCallback(() => {
      fetchInventory();
      return undefined;
    }, [fetchInventory]),
  );

  const flatCats = useMemo(() => flattenCategories(categories), [categories]);

  const summary = useMemo(
    () =>
      products.reduce(
        (acc, product) => {
          const stock = getProductStock(product);

          acc.total += 1;
          if (!isStoppedProduct(product)) {
            acc.active += 1;
          }

          if (stock <= 0) {
            acc.out += 1;
          } else if (stock <= LOW_STOCK_THRESHOLD) {
            acc.low += 1;
          }

          return acc;
        },
        { total: 0, active: 0, low: 0, out: 0 },
      ),
    [products],
  );

  const navigateToList = (filter: string) => {
    router.push(`/staff-admin/inventory-list?filter=${filter}` as any);
  };

  // ───── Không có quyền ─────
  if (!canAccess) {
    return (
      <View style={styles.container}>
        <AppHeader title="Quản lý hàng hóa" showBack />
        <View style={styles.centerWrap}>
          <View style={styles.blockedIconBox}>
            <Ionicons name="cube-outline" size={40} color="#0EA5E9" />
          </View>
          <Text style={styles.blockTitle}>Bạn không có quyền truy cập</Text>
          <Text style={styles.blockText}>
            Màn hình này chỉ dành cho nhân viên hoặc quản trị viên để kiểm tra
            tồn kho và quản lý sản phẩm.
          </Text>
        </View>
      </View>
    );
  }

  // ───── Giao diện dashboard ─────
  return (
    <View style={styles.container}>
      <AppHeader title="Quản lý hàng hóa" showBack />

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
        {/* ── Hero Card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>QUẢN LÝ KHO HÀNG</Text>
          <Text style={styles.title}>Quản lý hàng hóa cơ bản</Text>
          <Text style={styles.description}>
            Rà soát tồn kho, nhận diện sản phẩm dừng bán và đi vào trang chi
            tiết quản lý của từng sản phẩm.
          </Text>

          <View style={styles.metaRow}>
            <MetaPill
              icon="git-branch-outline"
              text={`${flatCats.length} danh mục`}
            />
            <MetaPill
              icon={
                role === "admin"
                  ? "shield-checkmark-outline"
                  : "briefcase-outline"
              }
              text={role === "admin" ? "Admin" : "Staff"}
            />
          </View>
        </View>

        {/* ── Loading ── */}
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
        ) : (
          <>
            {/* ── Stat Cards ── */}
            <Text style={styles.sectionLabel}>Bấm vào ô để xem chi tiết</Text>

            <View style={styles.statsGrid}>
              <StatCard
                label="Tổng sản phẩm"
                value={String(summary.total)}
                accent="#2563EB"
                icon="albums-outline"
                onPress={() => navigateToList("ALL")}
              />
              <StatCard
                label="Đang bán"
                value={String(summary.active)}
                accent="#16A34A"
                icon="checkmark-circle-outline"
                onPress={() => navigateToList("ACTIVE")}
              />
              <StatCard
                label="Tồn thấp"
                value={String(summary.low)}
                accent="#D97706"
                icon="warning-outline"
                onPress={() => navigateToList("LOW")}
              />
              <StatCard
                label="Hết hàng"
                value={String(summary.out)}
                accent="#DC2626"
                icon="close-circle-outline"
                onPress={() => navigateToList("OUT")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  accent,
  icon,
  onPress,
}: {
  label: string;
  value: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.statCard}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.statIconBox, { backgroundColor: accent + "18" }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statArrow}>
        <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
      </View>
    </TouchableOpacity>
  );
}

function MetaPill({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.metaPill}>
      <Ionicons name={icon} size={13} color="#64748B" />
      <Text style={styles.metaText}>{text}</Text>
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

  /* ── Blocked ── */
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  blockedIconBox: {
    width: 86,
    height: 86,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E0F2FE",
  },
  blockTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  blockText: {
    fontSize: FontSize.base,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  /* ── Hero ── */
  heroCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: Spacing.lg,
    ...Shadow.medium,
  },
  heroGlow: {
    position: "absolute",
    top: -30,
    right: -24,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(14, 165, 233, 0.08)",
  },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: "#0EA5E9",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  description: {
    fontSize: FontSize.base,
    lineHeight: 22,
    color: "#475569",
  },

  /* ── Meta Row ── */
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: Spacing.lg,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metaText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: "#475569",
  },

  /* ── Section Label ── */
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "center",
  },

  /* ── Stats Grid ── */
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statCard: {
    position: "relative",
    width: "47.5%",
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: Spacing.base,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    ...Shadow.small,
  },
  statIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: FontSize.sm,
    color: "#64748B",
    fontWeight: "600",
  },
  statArrow: {
    position: "absolute",
    top: 16,
    right: 14,
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
});
