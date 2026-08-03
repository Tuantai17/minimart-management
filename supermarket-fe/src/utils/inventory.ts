import type { Product } from "../types";

export type InventoryFilter = "ALL" | "LOW" | "OUT" | "ACTIVE";

export type InventoryBadge = {
  label: string;
  color: string;
  bg: string;
};

export const LOW_STOCK_THRESHOLD = 10;

export const getProductStock = (product: Product | null | undefined): number => {
  const stock = Number(product?.stock_quantity ?? 0);
  return Number.isFinite(stock) ? stock : 0;
};

export const isOutOfStockProduct = (product: Product | null | undefined): boolean => {
  return getProductStock(product) <= 0;
};

export const isStoppedProduct = (product: Product | null | undefined): boolean => {
  if (!product) {
    return true;
  }

  return product.is_active === false || isOutOfStockProduct(product);
};

export const getInventoryBadges = (
  product: Product | null | undefined,
): InventoryBadge[] => {
  if (!product) {
    return [];
  }

  const stock = getProductStock(product);
  const badges: InventoryBadge[] = [];

  if (product.is_active === false || stock <= 0) {
    badges.push({
      label: "Ngừng bán",
      color: "#7C3AED",
      bg: "#F3E8FF",
    });
  }

  if (stock <= 0) {
    badges.push({
      label: "Hết hàng",
      color: "#DC2626",
      bg: "#FEE2E2",
    });
  } else if (product.is_active !== false && stock <= LOW_STOCK_THRESHOLD) {
    badges.push({
      label: "Tồn thấp",
      color: "#B45309",
      bg: "#FEF3C7",
    });
  }

  if (badges.length === 0) {
    badges.push({
      label: "Ổn định",
      color: "#047857",
      bg: "#DCFCE7",
    });
  }

  return badges;
};

export const getInventoryHeadline = (
  product: Product | null | undefined,
): string => {
  if (!product) {
    return "Không có dữ liệu tồn kho";
  }

  const stock = getProductStock(product);

  if (stock <= 0) {
    return "Ngừng bán do hết hàng";
  }

  if (product.is_active === false) {
    return "Ngừng bán theo cấu hình backend";
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return `Tồn thấp: còn ${stock} ${product.unit || "sp"}`;
  }

  return `Đang bán: còn ${stock} ${product.unit || "sp"}`;
};

export const matchesInventoryFilter = (
  product: Product,
  filter: InventoryFilter,
): boolean => {
  const stock = getProductStock(product);

  if (filter === "LOW") {
    return !isStoppedProduct(product) && stock > 0 && stock <= LOW_STOCK_THRESHOLD;
  }

  if (filter === "OUT") {
    return stock <= 0;
  }


  if (filter === "ACTIVE") {
    return !isStoppedProduct(product);
  }

  return true;
};
