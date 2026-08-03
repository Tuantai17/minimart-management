import type {
    BestSellingProduct,
    BestSellingProductFilter,
    Product,
    ProductFilter,
} from "../types";

import client from "./api/client";
import { Endpoints } from "./api/endpoints";

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 20;
const PRODUCTS_LIST_TIMEOUT = 20000;
const BEST_SELLING_TIMEOUT = 20000;
const PRODUCT_DETAIL_TIMEOUT = 12000;

type BestSellingRequestOptions = BestSellingProductFilter & {
  hydrateDetails?: boolean;
};

const mapBestSellingProductToProduct = (
  product: BestSellingProduct,
): Product => ({
  id: product.product_id,
  category: product.category_id,
  category_id: product.category_id,
  category_name: product.category_name,
  name: product.name,
  price: product.price,
  discount_price: product.discount_price ?? null,
  stock_quantity: Number.NaN,
  unit: product.unit,
  description: "",
  image: product.image,
  is_active: product.is_active,
  total_sold: product.total_sold,
  order_count: product.order_count,
  revenue: product.revenue,
  rank: product.rank,
});

const buildBestSellingParams = (
  params?: BestSellingProductFilter,
): Record<string, string | number | boolean> | undefined => {
  if (!params) {
    return undefined;
  }

  const normalizedStatuses =
    Array.isArray(params.statuses) && params.statuses.length > 0
      ? params.statuses
          .map((status) => status.trim())
          .filter(Boolean)
          .join(",")
      : undefined;

  return {
    ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
    ...(params.start_date ? { start_date: params.start_date } : {}),
    ...(params.end_date ? { end_date: params.end_date } : {}),
    ...(typeof params.category_id === "number"
      ? { category_id: params.category_id }
      : {}),
    ...(normalizedStatuses ? { statuses: normalizedStatuses } : {}),
    ...(typeof params.include_inactive === "boolean"
      ? { include_inactive: params.include_inactive }
      : {}),
  };
};

const normalizeBestSellingResponse = (
  data: any,
): PaginatedResponse<Product> => {
  const results = Array.isArray(data?.results)
    ? data.results.map(mapBestSellingProductToProduct)
    : [];

  return {
    count: typeof data?.count === "number" ? data.count : results.length,
    next: null,
    previous: null,
    results,
  };
};

const normalizeProductResponse = (data: any): PaginatedResponse<Product> => {
  if (data && data.results !== undefined) {
    return {
      count: typeof data.count === "number" ? data.count : data.results.length,
      next: data.next ?? null,
      previous: data.previous ?? null,
      results: Array.isArray(data.results) ? data.results : [],
    };
  }

  const dataArray = Array.isArray(data) ? data : data?.data || [];
  return {
    count: dataArray.length,
    next: null,
    previous: null,
    results: dataArray,
  };
};

const fetchProducts = async (
  params?: ProductFilter,
): Promise<PaginatedResponse<Product>> => {
  const normalizedParams = params
    ? {
        ...params,
        ...(params.category_id == null &&
        typeof params.category === "number" &&
        Number.isFinite(params.category)
          ? { category_id: params.category }
          : {}),
      }
    : undefined;
  const response = await client.get<any>(Endpoints.PRODUCTS, {
    params: normalizedParams,
    timeout: PRODUCTS_LIST_TIMEOUT,
  });
  return normalizeProductResponse(response.data);
};

const fetchProductById = async (id: number): Promise<Product> => {
  const response = await client.get<Product>(Endpoints.PRODUCT_DETAIL(id), {
    timeout: PRODUCT_DETAIL_TIMEOUT,
  });
  return response.data;
};

const hydrateBestSellingProducts = async (
  products: Product[],
): Promise<Product[]> => {
  return Promise.all(
    products.map(async (product) => {
      try {
        const detail = await fetchProductById(product.id);

        return {
          ...product,
          stock_quantity: Number(detail.stock_quantity),
          is_active: detail.is_active,
          description: detail.description || product.description,
          image: detail.image || product.image,
          unit: detail.unit || product.unit,
        };
      } catch (error) {
        console.warn(
          `[Product Service] Khong the dong bo ton kho cho san pham ban chay ${product.id}.`,
          error,
        );
        return product;
      }
    }),
  );
};

const includesKeyword = (
  value: string | number | null | undefined,
  keyword: string,
): boolean =>
  String(value || "")
    .toLocaleLowerCase()
    .includes(keyword);

const filterProductsByKeyword = (
  products: Product[],
  keyword: string,
): Product[] => {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();

  return products.filter((product) => {
    return (
      includesKeyword(product.name, normalizedKeyword) ||
      includesKeyword(product.category_name, normalizedKeyword) ||
      includesKeyword(product.description, normalizedKeyword)
    );
  });
};

const fetchAllProductsForSearch = async (): Promise<Product[]> => {
  const mergedProducts: Product[] = [];
  let page = 1;

  while (page <= SEARCH_MAX_PAGES) {
    const response = await fetchProducts({ page, limit: SEARCH_PAGE_SIZE });
    mergedProducts.push(...response.results);

    if (!response.next || response.results.length === 0) {
      break;
    }

    page += 1;
  }

  const uniqueProducts = new Map<number, Product>();
  mergedProducts.forEach((product) => uniqueProducts.set(product.id, product));

  return Array.from(uniqueProducts.values());
};

const fallbackSearchProducts = async (keyword: string): Promise<Product[]> => {
  const allProducts = await fetchAllProductsForSearch();
  return filterProductsByKeyword(allProducts, keyword);
};

export const productService = {
  getAll: async (
    params?: ProductFilter,
  ): Promise<PaginatedResponse<Product>> => {
    try {
      return await fetchProducts(params);
    } catch (error) {
      console.error("[Product Service] Loi khi lay danh sach san pham:", error);
      throw error;
    }
  },

  getLowStock: async (): Promise<PaginatedResponse<Product>> => {
    try {
      const response = await client.get<any>(Endpoints.PRODUCTS_LOW_STOCK);
      return normalizeProductResponse(response.data);
    } catch (error) {
      console.error(
        "[Product Service] Loi khi lay danh sach san pham ton thap:",
        error,
      );
      throw error;
    }
  },

  getById: async (id: number): Promise<Product> => {
    try {
      return await fetchProductById(id);
    } catch (error) {
      console.error(
        `[Product Service] Loi khi lay chi tiet san pham ${id}:`,
        error,
      );
      throw error;
    }
  },

  searchProducts: async (keyword: string): Promise<Product[]> => {
    const normalizedKeyword = keyword.trim();

    if (!normalizedKeyword) {
      return [];
    }

    try {
      const response = await client.get<any>(Endpoints.PRODUCTS, {
        params: { search: normalizedKeyword },
      });

      const products = normalizeProductResponse(response.data).results;
      const filteredProducts = filterProductsByKeyword(
        products,
        normalizedKeyword,
      );

      if (filteredProducts.length > 0 || products.length === 0) {
        return filteredProducts;
      }

      return await fallbackSearchProducts(normalizedKeyword);
    } catch (error) {
      console.warn(
        `[Product Service] Search endpoint loi hoac khong ho tro, fallback frontend filter voi tu khoa '${normalizedKeyword}'.`,
        error,
      );
      return fallbackSearchProducts(normalizedKeyword);
    }
  },

  search: async (query: string): Promise<Product[]> => {
    try {
      return await productService.searchProducts(query);
    } catch (error) {
      console.error(
        `[Product Service] Loi khi tim kiem san pham voi tu khoa '${query}':`,
        error,
      );
      throw error;
    }
  },

  getBestSelling: async (
    params?: BestSellingRequestOptions,
  ): Promise<PaginatedResponse<Product>> => {
    try {
      const { hydrateDetails = true, ...requestParams } = params ?? {};
      const response = await client.get<any>(Endpoints.PRODUCTS_BEST_SELLING, {
        params: buildBestSellingParams(requestParams),
        timeout: BEST_SELLING_TIMEOUT,
      });
      const normalizedResponse = normalizeBestSellingResponse(response.data);

      if (!hydrateDetails || normalizedResponse.results.length === 0) {
        return normalizedResponse;
      }

      const hydratedResults = await hydrateBestSellingProducts(
        normalizedResponse.results,
      );

      return {
        ...normalizedResponse,
        results: hydratedResults,
      };
    } catch (error: any) {
      const statusCode = error?.response?.status;

      if (statusCode === 401 || statusCode === 403) {
        console.warn(
          "[Product Service] Best-selling API dang bi backend chan quyen truy cap (401/403). Tam fallback ve danh sach rong.",
        );
        return {
          count: 0,
          next: null,
          previous: null,
          results: [],
        };
      }

      console.error(
        "[Product Service] Loi khi lay danh sach san pham ban chay:",
        error,
      );
      throw error;
    }
  },
};
