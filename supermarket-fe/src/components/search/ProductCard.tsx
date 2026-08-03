import { memo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../constants";
import type { Product } from "../../types/search";
import { formatCurrency, getImageUrl } from "../../utils";

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onBuy: () => void;
  isAdding?: boolean;
}

function ProductCardComponent({
  product,
  onPress,
  onBuy,
  isAdding = false,
}: ProductCardProps) {
  const currentPrice = Number(product.discount_price || product.price);
  const isOutOfStock = (product.stock_quantity ?? 0) <= 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageBox}>
        <Image
          source={{ uri: getImageUrl(product.image) }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatCurrency(currentPrice)}</Text>
          <Text style={styles.unit}>{product.unit ? `/${product.unit}` : ""}</Text>
        </View>

        <Text style={[styles.status, isOutOfStock && styles.statusOut]}>
          {isOutOfStock
            ? "Hết hàng"
            : product.stock_quantity
              ? `Còn ${product.stock_quantity} suất`
              : "Còn hàng"}
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.buyButton,
          (isOutOfStock || isAdding) && styles.buyButtonDisabled,
        ]}
        activeOpacity={0.82}
        disabled={isOutOfStock || isAdding}
        onPress={onBuy}
      >
        <Text
          style={[
            styles.buyButtonText,
            (isOutOfStock || isAdding) && styles.buyButtonTextDisabled,
          ]}
        >
          {isOutOfStock ? "Hết hàng" : isAdding ? "Đang thêm..." : "MUA"}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export const ProductCard = memo(ProductCardComponent);

const styles = StyleSheet.create({
  card: {
    width: "48.5%",
    marginBottom: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#EBEFE6",
    backgroundColor: Colors.white,
    overflow: "hidden",
    ...Shadow.small,
  },
  imageBox: {
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBFCFA",
    padding: Spacing.base,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  name: {
    minHeight: 38,
    color: Colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Spacing.sm,
  },
  price: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  unit: {
    marginLeft: 2,
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  status: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderRadius: Radius.full,
    backgroundColor: "#FFF4D9",
    paddingHorizontal: 7,
    paddingVertical: 3,
    color: "#D17C00",
    fontSize: 10,
    fontWeight: "600",
  },
  statusOut: {
    backgroundColor: "#FFF0EF",
    color: Colors.error,
  },
  buyButton: {
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "#EEF3E9",
    backgroundColor: "#F3FBF5",
  },
  buyButtonDisabled: {
    backgroundColor: "#F2F2F2",
  },
  buyButtonText: {
    color: "#22c55e",
    fontSize: 14,
    fontWeight: "700",
  },
  buyButtonTextDisabled: {
    color: Colors.textLight,
  },
});
