import type { Category as AppCategory } from "./category.type";
import type { Product as AppProduct } from "./product.type";

export type Product = AppProduct;
export type SearchProduct = Product;

export type Category = AppCategory & {
  parent: number | null;
  depth: number;
  rootParentId: number;
  rootParentName: string;
};
export type SearchParentCategory = Category;
export type SearchChildCategory = Category;

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface SearchAllResponse {
  keyword: string;
  products: Product[];
  totalProducts: number;
  hasMore: boolean;
  next: string | null;
  previous: string | null;
  categories: Category[];
}

export type SearchProductsResponse = PaginatedResponse<Product>;

export interface SearchSuggestionItem {
  id: string;
  name: string;
  image?: string | null;
  type: "category";
  categoryId: number;
}

export type ProductOrderingValue = "price" | "-price" | "-rating";

export type ProductPriceRangeKey =
  | "UNDER_50K"
  | "FROM_50K_TO_150K"
  | "FROM_150K_TO_300K"
  | "ABOVE_300K";

export interface ProductPriceRangeValues {
  min_price: number | null;
  max_price: number | null;
}

export interface ProductSearchFilters {
  ordering: ProductOrderingValue | null;
  priceRange: ProductPriceRangeKey | null;
  min_price: number | null;
  max_price: number | null;
}

export interface ProductFilterOption<T extends string> {
  label: string;
  value: T;
}

export interface ProductSearchQuery {
  keyword?: string;
  page?: number;
  categoryId?: number | null;
  filters?: ProductSearchFilters;
}

export const PRODUCT_PRICE_RANGE_MAP: Record<
  ProductPriceRangeKey,
  ProductPriceRangeValues
> = {
  UNDER_50K: {
    min_price: 0,
    max_price: 50000,
  },
  FROM_50K_TO_150K: {
    min_price: 50000,
    max_price: 150000,
  },
  FROM_150K_TO_300K: {
    min_price: 150000,
    max_price: 300000,
  },
  ABOVE_300K: {
    min_price: 300000,
    max_price: null,
  },
};

export const SORT_FILTER_OPTIONS: ProductFilterOption<ProductOrderingValue>[] = [
  { label: "Giá thấp đến cao", value: "price" },
  { label: "Giá cao đến thấp", value: "-price" },
  { label: "Đánh giá cao", value: "-rating" },
];

export const PRICE_FILTER_OPTIONS: ProductFilterOption<ProductPriceRangeKey>[] = [
  { label: "Dưới 50k", value: "UNDER_50K" },
  { label: "50k - 150k", value: "FROM_50K_TO_150K" },
  { label: "150k - 300k", value: "FROM_150K_TO_300K" },
  { label: "Trên 300k", value: "ABOVE_300K" },
];

export const DEFAULT_PRODUCT_SEARCH_FILTERS: ProductSearchFilters = {
  ordering: null,
  priceRange: null,
  min_price: null,
  max_price: null,
};

export const createProductSearchFilters = (
  partial?: Partial<ProductSearchFilters> | null,
): ProductSearchFilters => {
  const ordering = partial?.ordering ?? null;
  const nextPriceRange = partial?.priceRange ?? null;
  const mappedPriceRange = nextPriceRange
    ? PRODUCT_PRICE_RANGE_MAP[nextPriceRange]
    : null;

  return {
    ordering,
    priceRange: nextPriceRange,
    min_price:
      mappedPriceRange?.min_price ??
      (typeof partial?.min_price === "number" ? partial.min_price : null),
    max_price:
      mappedPriceRange?.max_price ??
      (typeof partial?.max_price === "number" ? partial.max_price : null),
  };
};

export const getActiveProductFilterCount = (
  filters?: ProductSearchFilters | null,
): number => {
  if (!filters) {
    return 0;
  }

  let count = 0;

  if (filters.ordering) {
    count += 1;
  }

  if (filters.priceRange) {
    count += 1;
  }

  return count;
};

export const hasActiveProductFilters = (
  filters?: ProductSearchFilters | null,
): boolean => {
  return getActiveProductFilterCount(filters) > 0;
};
