import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants";
import type { Product } from "../../types";
import { calculateDiscount, formatCurrency, getImageUrl } from "../../utils";

const CARD_W = (Dimensions.get("window").width - Spacing.base * 2 - 12) / 2;

interface ProductCardBadge {
  key: string;
  label: string;
  tone: "emerald" | "amber" | "violet";
}

type ProductCardStockDisplayMode = "strict" | "optimistic";

interface Props {
  product: Product;
  onPress: () => void;
  onAddToCart: () => void;
  isAdding?: boolean;
  badges?: ProductCardBadge[];
  stockDisplayMode?: ProductCardStockDisplayMode;
}

export default function ProductCard({
  product,
  onPress,
  onAddToCart,
  isAdding = false,
  badges = [],
  stockDisplayMode = "strict",
}: Props) {
  const discount = calculateDiscount(
    Number(product.price),
    Number(product.discount_price),
  );
  const normalizedStockQuantity = Number(product.stock_quantity);
  const hasStockInfo = Number.isFinite(normalizedStockQuantity);
  const isInactive = product.is_active === false;
  const isOutOfStock =
    isInactive ||
    (stockDisplayMode === "strict" &&
      hasStockInfo &&
      normalizedStockQuantity <= 0);
  const soldCount =
    typeof product.total_sold === "number"
      ? product.total_sold
      : Math.floor(
          (Number(product.rating) || 4.5) * 60 + Number(product.id) * 3,
        );

  return (
    <TouchableOpacity
      style={styles.outerShell}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <View style={styles.innerCore}>
        <Image
          source={{ uri: getImageUrl(product.image) }}
          style={styles.image}
          resizeMode="cover"
        />
        {discount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>-{discount}%</Text>
          </View>
        )}
        {badges.length > 0 ? (
          <View style={styles.recommendationBadgeColumn}>
            {badges.slice(0, 3).map((badgeItem) => (
              <View
                key={badgeItem.key}
                style={[
                  styles.recommendationBadge,
                  badgeItem.tone === "amber"
                    ? styles.recommendationBadgeAmber
                    : badgeItem.tone === "violet"
                      ? styles.recommendationBadgeViolet
                      : styles.recommendationBadgeEmerald,
                ]}
              >
                <Text style={styles.recommendationBadgeText}>
                  {badgeItem.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {isOutOfStock && (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>Hết hàng</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.unit}>{product.unit}</Text>

          <View style={styles.stockRow}>
            <Text
              style={[styles.stockText, isOutOfStock && styles.stockTextOut]}
            >
              {isInactive
                ? "Tạm ngưng bán"
                : isOutOfStock
                  ? "Hết hàng"
                  : hasStockInfo && normalizedStockQuantity > 0
                    ? `Còn ${normalizedStockQuantity} ${product.unit || "sp"}`
                    : stockDisplayMode === "optimistic"
                      ? "Kiểm tra tồn khi thêm giỏ"
                      : "Sẵn sàng phục vụ"}
            </Text>

            <Text style={styles.soldText}>Đã bán {soldCount}</Text>
          </View>

          <View style={styles.bottom}>
            <View style={styles.priceRow}>
              <Text style={styles.price}>
                {formatCurrency(
                  Number(product.discount_price || product.price),
                )}
              </Text>
              {product.discount_price && (
                <Text style={styles.original}>
                  {formatCurrency(Number(product.price))}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.addBtn,
                (isOutOfStock || isAdding) && styles.addBtnDisabled,
              ]}
              disabled={isOutOfStock || isAdding}
              onPress={(e) => {
                e.stopPropagation();
                onAddToCart();
              }}
              activeOpacity={0.65}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons
                  name="add"
                  size={18}
                  color={isOutOfStock ? "#9CA3AF" : Colors.white}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  outerShell: {
    width: CARD_W,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 28,
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.03)",
  },
  innerCore: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#050505",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 4,
  },
  image: {
    width: "100%",
    height: CARD_W * 0.85,
    backgroundColor: "#FDFBF7",
  },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#EF4444",
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  recommendationBadgeColumn: {
    position: "absolute",
    top: 10,
    right: 10,
    alignItems: "flex-end",
    gap: 6,
  },
  recommendationBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recommendationBadgeEmerald: {
    backgroundColor: "#065F46",
  },
  recommendationBadgeAmber: {
    backgroundColor: "#B45309",
  },
  recommendationBadgeViolet: {
    backgroundColor: "#6D28D9",
  },
  recommendationBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.white,
    letterSpacing: 0.3,
  },
  info: { padding: Spacing.md },
  name: {
    fontSize: FontSize.base,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: "#111827",
    lineHeight: 22,
    height: 44,
  },
  unit: { fontSize: FontSize.sm, color: "#6B7280", marginTop: 4 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  price: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: "#064E3B",
    letterSpacing: -0.5,
  },
  original: {
    fontSize: FontSize.xs,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    marginLeft: Spacing.sm,
  },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  addBtn: {
    backgroundColor: "#064E3B",
    borderRadius: Radius.full,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#064E3B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  addBtnDisabled: {
    backgroundColor: "#F3F4F6",
    shadowOpacity: 0,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  stockText: {
    fontSize: 10,
    color: "#059669",
    fontWeight: "600",
  },
  soldText: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "500",
  },
  stockTextOut: {
    color: "#EF4444",
  },
  outOfStockOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: CARD_W * 0.85,
    backgroundColor: "rgba(255,255,255,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    backdropFilter: "blur(4px)",
  },
  outOfStockText: {
    color: "#111827",
    fontSize: FontSize.base,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
