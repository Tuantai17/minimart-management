import type { Category as ApiCategory } from "../types/category.type";
import type {
  Category,
  PaginatedResponse,
  Product,
  ProductSearchFilters,
  ProductSearchQuery,
  SearchAllResponse,
  SearchProductsResponse,
  SearchSuggestionItem,
} from "../types/search";
import { createProductSearchFilters, DEFAULT_PRODUCT_SEARCH_FILTERS } from "../types/search";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

type QueryParams = Record<string, string | number>;

const normalizeArrayResponse = <T>(data: unknown): T[] => {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (data && typeof data === "object") {
    const objectData = data as { results?: unknown; data?: unknown };

    if (Array.isArray(objectData.results)) {
      return objectData.results as T[];
    }

    if (Array.isArray(objectData.data)) {
      return objectData.data as T[];
    }
  }

  return [];
};

export const normalizePaginatedResponse = <T>(data: unknown): PaginatedResponse<T> => {
  if (data && typeof data === "object" && "results" in data) {
    const objectData = data as Partial<PaginatedResponse<T>>;
    const results = Array.isArray(objectData.results) ? objectData.results : [];

    return {
      count:
        typeof objectData.count === "number"
          ? objectData.count
          : Array.isArray(results)
            ? results.length
            : 0,
      next: typeof objectData.next === "string" ? objectData.next : null,
      previous: typeof objectData.previous === "string" ? objectData.previous : null,
      results,
    };
  }

  const items = normalizeArrayResponse<T>(data);

  return {
    count: items.length,
    next: null,
    previous: null,
    results: items,
  };
};

export const dedupeById = <T extends { id: number | string }>(items: T[]): T[] => {
  const itemMap = new Map<number | string, T>();

  items.forEach((item) => {
    itemMap.set(item.id, item);
  });

  return Array.from(itemMap.values());
};

export const normalizeText = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
};

export const flattenCategories = (
  categories: ApiCategory[],
  parentId: number | null = null,
  rootParentId?: number,
  rootParentName?: string,
  depth: number = 0,
): Category[] => {
  if (!Array.isArray(categories)) {
    return [];
  }

  return categories.flatMap((category) => {
    const nextParentId =
      typeof category.parent === "number" ? category.parent : parentId;
    const nextRootParentId = depth === 0 ? category.id : rootParentId ?? category.id;
    const nextRootParentName = depth === 0 ? category.name : rootParentName ?? category.name;
    const children = Array.isArray(category.children) ? category.children : [];

    const normalizedCategory: Category = {
      ...category,
      parent: nextParentId,
      depth,
      rootParentId: nextRootParentId,
      rootParentName: nextRootParentName,
      children,
    };

    return [
      normalizedCategory,
      ...flattenCategories(
        children,
        category.id,
        nextRootParentId,
        nextRootParentName,
        depth + 1,
      ),
    ];
  });
};

export const getDescendantIds = (
  categoryId: number,
  allCategories: Category[],
): number[] => {
  if (!categoryId || !Array.isArray(allCategories) || allCategories.length === 0) {
    return [];
  }

  const descendants = new Set<number>([categoryId]);
  const queue: number[] = [categoryId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (typeof currentId !== "number") {
      continue;
    }

    allCategories.forEach((category) => {
      if (category.parent === currentId && !descendants.has(category.id)) {
        descendants.add(category.id);
        queue.push(category.id);
      }
    });
  }

  return Array.from(descendants);
};

const mapSuggestionItems = (categories: Category[]): SearchSuggestionItem[] => {
  return dedupeById(categories).map((category) => ({
    id: `category-${category.id}`,
    name: category.name,
    image: category.image,
    type: "category",
    categoryId: category.id,
  }));
};

const filterCategoriesByKeyword = (categories: Category[], keyword: string): Category[] => {
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword) {
    return [];
  }

  const matchedCategories = categories
    .filter((category) => normalizeText(category.name).includes(normalizedKeyword))
    .sort((first, second) => {
      if (first.depth !== second.depth) {
        return first.depth - second.depth;
      }

      return first.name.localeCompare(second.name);
    });

  const rootParentIds = new Set<number>(matchedCategories.map((category) => category.rootParentId));
  const relatedParentCategories = categories.filter((category) => rootParentIds.has(category.id));

  return dedupeById([...relatedParentCategories, ...matchedCategories]);
};

export const buildProductQueryParams = (
  query: ProductSearchQuery = {},
): QueryParams => {
  const params: QueryParams = {};
  const normalizedFilters = createProductSearchFilters(
    query.filters ?? DEFAULT_PRODUCT_SEARCH_FILTERS,
  );
  const trimmedKeyword = (query.keyword ?? "").trim();
  const nextPage =
    typeof query.page === "number" && Number.isFinite(query.page) && query.page > 0
      ? query.page
      : 1;

  params.page = nextPage;

  if (trimmedKeyword) {
    params.search = trimmedKeyword;
  }

  if (typeof query.categoryId === "number" && Number.isFinite(query.categoryId)) {
    params.category_id = query.categoryId;
  }

  if (normalizedFilters.ordering) {
    params.ordering = normalizedFilters.ordering;
  }

  if (
    typeof normalizedFilters.min_price === "number" &&
    Number.isFinite(normalizedFilters.min_price)
  ) {
    params.min_price = normalizedFilters.min_price;
  }

  if (
    typeof normalizedFilters.max_price === "number" &&
    Number.isFinite(normalizedFilters.max_price)
  ) {
    params.max_price = normalizedFilters.max_price;
  }

  return params;
};

export const searchService = {
  searchProducts: async ({
    keyword = "",
    page = 1,
    categoryId,
    filters = DEFAULT_PRODUCT_SEARCH_FILTERS,
  }: ProductSearchQuery): Promise<SearchProductsResponse> => {
    const trimmedKeyword = keyword.trim();
    const normalizedFilters = createProductSearchFilters(filters);
    const hasFilterParams = Boolean(
      normalizedFilters.ordering ||
        normalizedFilters.priceRange ||
        typeof normalizedFilters.min_price === "number" ||
        typeof normalizedFilters.max_price === "number",
    );

    if (!trimmedKeyword && !categoryId && !hasFilterParams) {
      return {
        count: 0,
        next: null,
        previous: null,
        results: [],
      };
    }

    const response = await client.get<unknown>(Endpoints.PRODUCTS, {
      params: buildProductQueryParams({
        keyword: trimmedKeyword,
        page,
        categoryId,
        filters: normalizedFilters,
      }),
    });

    const normalizedResponse = normalizePaginatedResponse<Product>(response.data);

    return {
      ...normalizedResponse,
      count:
        typeof normalizedResponse.count === "number"
          ? normalizedResponse.count
          : normalizedResponse.results.length,
      results: dedupeById(normalizedResponse.results ?? []),
    };
  },

  searchCategories: async (keyword: string): Promise<Category[]> => {
    const trimmedKeyword = keyword.trim();

    if (!trimmedKeyword) {
      return [];
    }

    const response = await client.get<unknown>(Endpoints.CATEGORIES);
    const rootCategories = normalizeArrayResponse<ApiCategory>(response.data);
    const flattenedCategories = flattenCategories(rootCategories);

    return dedupeById(filterCategoriesByKeyword(flattenedCategories, trimmedKeyword)).slice(0, 12);
  },

  searchSuggestions: async (keyword: string): Promise<SearchSuggestionItem[]> => {
    const categories = await searchService.searchCategories(keyword);
    return mapSuggestionItems(categories);
  },

  searchAll: async (
    keyword: string,
    page: number = 1,
    filters: ProductSearchFilters = DEFAULT_PRODUCT_SEARCH_FILTERS,
  ): Promise<SearchAllResponse> => {
    const trimmedKeyword = keyword.trim();

    if (!trimmedKeyword) {
      return {
        keyword: "",
        products: [],
        totalProducts: 0,
        hasMore: false,
        next: null,
        previous: null,
        categories: [],
      };
    }

    const [productsResponse, categories] = await Promise.all([
      searchService.searchProducts({
        keyword: trimmedKeyword,
        page,
        filters,
      }),
      searchService.searchCategories(trimmedKeyword),
    ]);

    return {
      keyword: trimmedKeyword,
      products: dedupeById(productsResponse.results ?? []),
      totalProducts: productsResponse.count ?? 0,
      hasMore: Boolean(productsResponse.next),
      next: productsResponse.next ?? null,
      previous: productsResponse.previous ?? null,
      categories: dedupeById(categories ?? []),
    };
  },
};
