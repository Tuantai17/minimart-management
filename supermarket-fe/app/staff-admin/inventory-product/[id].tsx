import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AppHeader from "../../../src/components/common/AppHeader";
import { Colors, Config, FontSize, Radius, Shadow, Spacing } from "../../../src/constants";
import { productService } from "../../../src/services/product.service";
import { useAuthStore } from "../../../src/store/auth.store";
import type { Product } from "../../../src/types";
import {
  getInventoryBadges,
  getInventoryHeadline,
  getProductStock,
  isOutOfStockProduct,
  isStoppedProduct,
} from "../../../src/utils/inventory";
import { formatCurrency, getImageUrl } from "../../../src/utils";

type ProfileRole = "customer" | "staff" | "admin";

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

const openUrlSafely = async (url: string, fallbackMessage: string) => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert("Thông báo", fallbackMessage);
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    console.log("[InventoryProductDetail] openURL failed:", url, error);
    Alert.alert("Thông báo", fallbackMessage);
  }
};

export default function InventoryProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const authRole = useAuthStore((state) => state.role);
  const isStaff = useAuthStore((state) => state.isStaff);
  const isSuperuser = useAuthStore((state) => state.isSuperuser);

  const role = getRole({ authRole, isStaff, isSuperuser, user });
  const canAccess = role === "staff" || role === "admin";

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProduct = useCallback(async () => {
    if (!id || !canAccess) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await productService.getById(Number(id));
      setProduct({ ...data, image: getImageUrl(data.image) });
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ??
          err?.message ??
          "Không thể tải chi tiết quản lý sản phẩm.",
      );
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [canAccess, id]);

  useEffect(() => {
    void fetchProduct();
  }, [fetchProduct]);

  const badges = useMemo(() => getInventoryBadges(product), [product]);
  const inventoryHeadline = useMemo(() => getInventoryHeadline(product), [product]);
  const adminChangeUrl = useMemo(() => {
    if (!product) {
      return "";
    }
    const baseUrl = Config.API_BASE_URL.replace(/\/api\/?$/, "");
    return `${baseUrl}/admin/store/product/${product.id}/change/`;
  }, [product]);

  // ───── Không có quyền ─────
  if (!canAccess) {
    return (
      <View style={styles.container}>
        <AppHeader title="Chi tiết quản lý sản phẩm" showBack />
        <View style={styles.centerWrap}>
          <View style={styles.blockedIconBox}>
            <Ionicons name="shield-checkmark-outline" size={42} color="#0EA5E9" />
          </View>
          <Text style={styles.blockTitle}>Bạn không có quyền truy cập</Text>
          <Text style={styles.blockText}>
            Màn hình này chỉ dành cho nhân viên hoặc quản trị viên để kiểm tra sản phẩm trong phần
            quản lý.
          </Text>
        </View>
      </View>
    );
  }

  // ───── Loading ─────
  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Chi tiết quản lý sản phẩm" showBack />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.blockText}>Đang tải dữ liệu sản phẩm...</Text>
        </View>
      </View>
    );
  }

  // ───── Error ─────
  if (error || !product) {
    return (
      <View style={styles.container}>
        <AppHeader title="Chi tiết quản lý sản phẩm" showBack />
        <View style={styles.centerWrap}>
          <View style={styles.blockedIconBox}>
            <Ionicons name="alert-circle-outline" size={42} color={Colors.error} />
          </View>
          <Text style={styles.blockTitle}>Không tải được sản phẩm</Text>
          <Text style={styles.blockText}>{error || "Sản phẩm không tồn tại."}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => void fetchProduct()}>
            <Text style={styles.primaryButtonText}>Tải lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ───── Giao diện chính ─────
  return (
    <View style={styles.container}>
      <AppHeader title="Chi tiết quản lý sản phẩm" showBack />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Hero Card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Image source={{ uri: getImageUrl(product.image) }} style={styles.productImage} />

          <View style={styles.heroBody}>
            <Text style={styles.eyebrow}>QUẢN LÝ SẢN PHẨM</Text>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productCategory}>{product.category_name}</Text>

            <View style={styles.badgeWrap}>
              {badges.map((badge) => (
                <View key={badge.label} style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.inventoryHeadline}>{inventoryHeadline}</Text>
          </View>
        </View>

        {/* ── Thông số tổng quan ── */}
        <View style={styles.grid}>
          <MetricCard label="ID sản phẩm" value={String(product.id)} icon="finger-print-outline" />
          <MetricCard
            label="Giá gốc"
            value={formatCurrency(Number(product.price || 0))}
            icon="pricetag-outline"
          />
          <MetricCard
            label="Giá hiển thị"
            value={formatCurrency(Number(product.discount_price || product.price || 0))}
            icon="cash-outline"
          />
          <MetricCard
            label="Tồn kho"
            value={`${getProductStock(product)} ${product.unit || "sp"}`}
            icon="cube-outline"
          />
        </View>

        {/* ── Trạng thái vận hành ── */}
        <View style={styles.detailCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="pulse-outline" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Trạng thái vận hành</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Trạng thái FE</Text>
            <View style={styles.infoValueRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: isStoppedProduct(product) ? "#DC2626" : "#16A34A",
                  },
                ]}
              />
              <Text style={styles.infoValue}>
                {isStoppedProduct(product) ? "Ngừng bán" : "Đang bán"}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>is_active (backend)</Text>
            <Text style={styles.infoValue}>
              {product.is_active === false ? "false" : "true"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hết hàng</Text>
            <Text style={styles.infoValue}>
              {isOutOfStockProduct(product) ? "Có" : "Không"}
            </Text>
          </View>

          {isOutOfStockProduct(product) ? (
            <View style={styles.noticeCard}>
              <Ionicons name="information-circle-outline" size={18} color="#7C3AED" />
              <Text style={styles.noticeText}>
                Sản phẩm tồn kho bằng 0 nên FE xem là ngừng bán kèm hết hàng, kể cả khi backend
                vẫn đang để is_active=true.
              </Text>
            </View>
          ) : product.is_active === false ? (
            <View style={styles.noticeCard}>
              <Ionicons name="pause-circle-outline" size={18} color="#7C3AED" />
              <Text style={styles.noticeText}>
                Sản phẩm vẫn còn tồn nhưng backend đã tắt is_active, nên FE đánh dấu là ngừng bán.
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Thông tin sản phẩm ── */}
        <View style={styles.detailCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Thông tin sản phẩm</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Danh mục</Text>
            <Text style={styles.infoValue}>{product.category_name}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Đơn vị</Text>
            <Text style={styles.infoValue}>{product.unit || "---"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Mô tả</Text>
            <Text style={styles.infoValueLong}>
              {product.description || "Chưa có mô tả."}
            </Text>
          </View>
        </View>

        {/* ── Hành động ── */}
        <View style={styles.actionCard}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push(`/product/${product.id}` as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="storefront-outline" size={16} color="#1D4ED8" />
            <Text style={styles.secondaryButtonText}>Xem trang khách hàng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push(`/category/${product.category}` as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="folder-open-outline" size={16} color="#1D4ED8" />
            <Text style={styles.secondaryButtonText}>Xem danh mục</Text>
          </TouchableOpacity>

          {role === "admin" ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() =>
                void openUrlSafely(
                  adminChangeUrl,
                  "Không mở được trang Django Admin cho sản phẩm này.",
                )
              }
              activeOpacity={0.85}
            >
              <Ionicons name="settings-outline" size={16} color={Colors.white} />
              <Text style={styles.primaryButtonText}>Mở Django Admin</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

// ────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.metricCard}>
      <Ionicons name={icon} size={16} color="#94A3B8" style={{ marginBottom: 8 }} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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

  /* ── Blocked / Center ── */
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
    top: -28,
    right: -16,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(124, 58, 237, 0.08)",
  },
  productImage: {
    width: "100%",
    height: 220,
    borderRadius: 24,
    backgroundColor: "#F8FAFC",
    marginBottom: Spacing.lg,
  },
  heroBody: {
    gap: 8,
  },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: "#0EA5E9",
    letterSpacing: 1.2,
  },
  productName: {
    fontSize: FontSize.xxl,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  productCategory: {
    fontSize: FontSize.base,
    color: "#64748B",
  },
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
  },
  inventoryHeadline: {
    fontSize: FontSize.base,
    lineHeight: 22,
    color: "#475569",
    marginTop: 2,
  },

  /* ── Grid ── */
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  metricCard: {
    width: "47.5%",
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Shadow.small,
  },
  metricLabel: {
    fontSize: FontSize.xs,
    color: "#94A3B8",
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.textPrimary,
  },

  /* ── Detail Card ── */
  detailCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.small,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  infoRow: {
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  infoLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  infoValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  infoValueLong: {
    fontSize: FontSize.base,
    lineHeight: 22,
    color: Colors.textPrimary,
  },

  /* ── Notice ── */
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#E9E5FF",
  },
  noticeText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: "#5B21B6",
  },

  /* ── Actions ── */
  actionCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: Spacing.base,
    gap: Spacing.sm,
    ...Shadow.small,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: Radius.lg,
    paddingVertical: 13,
    backgroundColor: "#EFF6FF",
  },
  secondaryButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: Radius.lg,
    paddingVertical: 13,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },
});
