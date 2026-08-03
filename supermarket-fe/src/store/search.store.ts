import { create } from "zustand";
import { searchService } from "../services/search.service";
import type { Category, Product, ProductSearchFilters } from "../types/search";
import { createProductSearchFilters, DEFAULT_PRODUCT_SEARCH_FILTERS } from "../types/search";
import { storage } from "../utils";

interface SearchState {
  keyword: string;
  parentCategories: Category[];
  childCategories: Category[];
  categories: Category[];
  products: Product[];
  searchFilters: ProductSearchFilters;
  categoryFilters: ProductSearchFilters;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  hasSearched: boolean;
  currentPage: number;
  totalProducts: number;
  selectedCategoryId: number | null;
  selectedSubCategoryId: number | null;
  searchHistory: string[];
  historyLoaded: boolean;
  setKeyword: (keyword: string) => void;
  setSearchFilters: (filters: Partial<ProductSearchFilters> | ProductSearchFilters) => void;
  resetSearchFilters: () => void;
  setCategoryFilters: (filters: Partial<ProductSearchFilters> | ProductSearchFilters) => void;
  resetCategoryFilters: () => void;
  loadSearchHistory: () => Promise<void>;
  addSearchHistory: (keyword: string) => Promise<void>;
  removeSearchHistory: (keyword: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
  searchByKeyword: (keyword?: string) => Promise<void>;
  selectParentCategory: (categoryId: number) => void;
  selectSubCategory: (categoryId: number) => Promise<void>;
  loadMoreProducts: () => Promise<void>;
  clearSearch: () => void;
}

const SEARCH_HISTORY_STORAGE_KEY = "searchHistory";
const MAX_HISTORY_ITEMS = 10;

let latestSearchRequest = 0;
let latestLoadMoreRequest = 0;

const initialSearchState = {
  keyword: "",
  parentCategories: [] as Category[],
  childCategories: [] as Category[],
  categories: [] as Category[],
  products: [] as Product[],
  searchFilters: DEFAULT_PRODUCT_SEARCH_FILTERS,
  categoryFilters: DEFAULT_PRODUCT_SEARCH_FILTERS,
  loading: false,
  error: null as string | null,
  hasMore: false,
  hasSearched: false,
  currentPage: 1,
  totalProducts: 0,
  selectedCategoryId: null as number | null,
  selectedSubCategoryId: null as number | null,
};

const getSearchErrorMessage = (error: unknown): string => {
  console.error("[Search Store] request failed:", error);
  return "Không thể tải kết quả tìm kiếm. Vui lòng thử lại.";
};

const dedupeProducts = (products: Product[]): Product[] => {
  const productMap = new Map<number, Product>();

  products.forEach((product) => {
    productMap.set(product.id, product);
  });

  return Array.from(productMap.values());
};

const dedupeCategories = (categories: Category[]): Category[] => {
  const categoryMap = new Map<number, Category>();

  categories.forEach((category) => {
    categoryMap.set(category.id, category);
  });

  return Array.from(categoryMap.values());
};

const buildParentCategories = (categories: Category[]): Category[] => {
  return dedupeCategories(
    categories.filter(
      (category) => category.id === category.rootParentId || category.depth === 0,
    ),
  );
};

const buildChildCategories = (
  categories: Category[],
  selectedCategoryId: number | null,
): Category[] => {
  if (!selectedCategoryId) {
    return [];
  }

  return dedupeCategories(
    categories.filter(
      (category) =>
        category.rootParentId === selectedCategoryId &&
        category.id !== selectedCategoryId &&
        category.depth > 0,
    ),
  );
};

const normalizeHistoryKeyword = (keyword: string): string => keyword.trim();

const buildSearchHistory = (nextKeyword: string, currentHistory: string[]): string[] => {
  const trimmedKeyword = normalizeHistoryKeyword(nextKeyword);

  if (!trimmedKeyword) {
    return currentHistory;
  }

  const normalizedKeyword = trimmedKeyword.toLowerCase();
  const dedupedHistory = currentHistory.filter(
    (item) => normalizeHistoryKeyword(item).toLowerCase() !== normalizedKeyword,
  );

  return [trimmedKeyword, ...dedupedHistory].slice(0, MAX_HISTORY_ITEMS);
};

export const useSearchStore = create<SearchState>((set, get) => ({
  ...initialSearchState,
  searchHistory: [],
  historyLoaded: false,

  setKeyword: (keyword) => {
    set({ keyword: typeof keyword === "string" ? keyword : "" });
  },

  setSearchFilters: (filters) => {
    set((state) => ({
      searchFilters: createProductSearchFilters({
        ...state.searchFilters,
        ...filters,
      }),
    }));
  },

  resetSearchFilters: () => {
    set({
      searchFilters: DEFAULT_PRODUCT_SEARCH_FILTERS,
    });
  },

  setCategoryFilters: (filters) => {
    set((state) => ({
      categoryFilters: createProductSearchFilters({
        ...state.categoryFilters,
        ...filters,
      }),
    }));
  },

  resetCategoryFilters: () => {
    set({
      categoryFilters: DEFAULT_PRODUCT_SEARCH_FILTERS,
    });
  },

  loadSearchHistory: async () => {
    try {
      const storedHistory = await storage.getJSON<string[]>(SEARCH_HISTORY_STORAGE_KEY);
      set({
        searchHistory: Array.isArray(storedHistory) ? storedHistory : [],
        historyLoaded: true,
      });
    } catch (error) {
      console.error("[Search Store] load history failed:", error);
      set({
        searchHistory: [],
        historyLoaded: true,
      });
    }
  },

  addSearchHistory: async (keyword) => {
    const nextHistory = buildSearchHistory(keyword, get().searchHistory);

    set({
      searchHistory: nextHistory,
      historyLoaded: true,
    });

    await storage.setJSON(SEARCH_HISTORY_STORAGE_KEY, nextHistory);
  },

  removeSearchHistory: async (keyword) => {
    const normalizedKeyword = normalizeHistoryKeyword(keyword).toLowerCase();
    const nextHistory = get().searchHistory.filter(
      (item) => normalizeHistoryKeyword(item).toLowerCase() !== normalizedKeyword,
    );

    set({
      searchHistory: nextHistory,
      historyLoaded: true,
    });

    await storage.setJSON(SEARCH_HISTORY_STORAGE_KEY, nextHistory);
  },

  clearSearchHistory: async () => {
    set({
      searchHistory: [],
      historyLoaded: true,
    });

    await storage.remove(SEARCH_HISTORY_STORAGE_KEY);
  },

  searchByKeyword: async (keyword) => {
    const nextKeyword = (keyword ?? get().keyword ?? "").trim();
    const requestId = ++latestSearchRequest;
    latestLoadMoreRequest += 1;

    if (!nextKeyword) {
      set((state) => ({
        ...initialSearchState,
        searchFilters: state.searchFilters,
        categoryFilters: state.categoryFilters,
        searchHistory: state.searchHistory,
        historyLoaded: state.historyLoaded,
        hasSearched: false,
      }));
      return;
    }

    const currentFilters = get().searchFilters;

    set((state) => ({
      keyword: nextKeyword,
      parentCategories: [],
      childCategories: [],
      categories: [],
      products: [],
      loading: true,
      error: null,
      hasMore: false,
      hasSearched: true,
      currentPage: 1,
      totalProducts: 0,
      selectedCategoryId: null,
      selectedSubCategoryId: null,
      searchFilters: state.searchFilters,
      categoryFilters: state.categoryFilters,
      searchHistory: state.searchHistory,
      historyLoaded: state.historyLoaded,
    }));

    try {
      const response = await searchService.searchAll(nextKeyword, 1, currentFilters);

      if (requestId !== latestSearchRequest) {
        return;
      }

      const safeCategories = dedupeCategories(
        Array.isArray(response.categories) ? response.categories : [],
      );
      const parentCategories = buildParentCategories(safeCategories);
      const selectedCategoryId =
        parentCategories.length > 0 ? parentCategories[0].id : null;
      const childCategories = buildChildCategories(safeCategories, selectedCategoryId);

      set((state) => ({
        keyword: response.keyword ?? nextKeyword,
        parentCategories,
        childCategories,
        categories: safeCategories,
        products: dedupeProducts(Array.isArray(response.products) ? response.products : []),
        loading: false,
        error: null,
        hasMore: Boolean(response.hasMore),
        hasSearched: true,
        currentPage: 1,
        totalProducts:
          typeof response.totalProducts === "number" ? response.totalProducts : 0,
        selectedCategoryId,
        selectedSubCategoryId: null,
        searchFilters: state.searchFilters,
        categoryFilters: state.categoryFilters,
        searchHistory: state.searchHistory,
        historyLoaded: state.historyLoaded,
      }));
    } catch (error) {
      if (requestId !== latestSearchRequest) {
        return;
      }

      set((state) => ({
        keyword: nextKeyword,
        parentCategories: [],
        childCategories: [],
        categories: [],
        products: [],
        loading: false,
        error: getSearchErrorMessage(error),
        hasMore: false,
        hasSearched: true,
        currentPage: 1,
        totalProducts: 0,
        selectedCategoryId: null,
        selectedSubCategoryId: null,
        searchFilters: state.searchFilters,
        categoryFilters: state.categoryFilters,
        searchHistory: state.searchHistory,
        historyLoaded: state.historyLoaded,
      }));
    }
  },

  selectParentCategory: (categoryId) => {
    const { categories } = get();
    const nextCategoryId = typeof categoryId === "number" ? categoryId : null;

    set({
      selectedCategoryId: nextCategoryId,
      selectedSubCategoryId: null,
      childCategories: buildChildCategories(categories, nextCategoryId),
    });
  },

  selectSubCategory: async (categoryId) => {
    const nextCategoryId = typeof categoryId === "number" ? categoryId : null;

    if (!nextCategoryId) {
      return;
    }

    const requestId = ++latestSearchRequest;
    const currentFilters = get().searchFilters;
    const keyword = (get().keyword ?? "").trim();

    set({
      loading: true,
      error: null,
      hasSearched: true,
      selectedSubCategoryId: nextCategoryId,
      currentPage: 1,
    });

    try {
      const response = await searchService.searchProducts({
        categoryId: nextCategoryId,
        keyword,
        page: 1,
        filters: currentFilters,
      });

      if (requestId !== latestSearchRequest) {
        return;
      }

      set({
        products: dedupeProducts(Array.isArray(response.results) ? response.results : []),
        loading: false,
        error: null,
        hasMore: Boolean(response.next),
        currentPage: 1,
        totalProducts: typeof response.count === "number" ? response.count : 0,
      });
    } catch (error) {
      if (requestId !== latestSearchRequest) {
        return;
      }

      set({
        loading: false,
        error: getSearchErrorMessage(error),
        products: [],
        hasMore: false,
        totalProducts: 0,
      });
    }
  },

  loadMoreProducts: async () => {
    const {
      keyword,
      currentPage,
      hasMore,
      loading,
      products,
      selectedSubCategoryId,
      searchFilters,
    } = get();
    const nextKeyword = (keyword ?? "").trim();

    if ((!nextKeyword && !selectedSubCategoryId) || !hasMore || loading) {
      return;
    }

    const requestId = ++latestLoadMoreRequest;

    set({
      loading: true,
      error: null,
    });

    try {
      const response = await searchService.searchProducts({
        keyword: nextKeyword,
        page: currentPage + 1,
        categoryId: selectedSubCategoryId,
        filters: searchFilters,
      });

      if (requestId !== latestLoadMoreRequest) {
        return;
      }

      set({
        products: dedupeProducts([
          ...(Array.isArray(products) ? products : []),
          ...(Array.isArray(response.results) ? response.results : []),
        ]),
        loading: false,
        error: null,
        hasMore: Boolean(response.next),
        currentPage: currentPage + 1,
        totalProducts: typeof response.count === "number" ? response.count : 0,
      });
    } catch (error) {
      if (requestId !== latestLoadMoreRequest) {
        return;
      }

      set({
        loading: false,
        error: getSearchErrorMessage(error),
      });
    }
  },

  clearSearch: () => {
    latestSearchRequest += 1;
    latestLoadMoreRequest += 1;
    set((state) => ({
      ...initialSearchState,
      searchFilters: state.searchFilters,
      categoryFilters: state.categoryFilters,
      searchHistory: state.searchHistory,
      historyLoaded: state.historyLoaded,
      hasSearched: false,
    }));
  },
}));
