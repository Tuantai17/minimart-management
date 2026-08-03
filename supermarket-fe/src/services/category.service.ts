import type { Category } from "../types";
import type {
    Product,
    ProductSearchFilters,
    SearchProductsResponse,
} from "../types/search";
import { getImageUrl } from "../utils";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";
import { searchService } from "./search.service";

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

const CATEGORY_TREE_CACHE_TTL = 60 * 1000;
const CATEGORY_TREE_TIMEOUT = 25000;

const isPaginatedResponse = <T>(
  data: unknown,
): data is PaginatedResponse<T> => {
  return Boolean(
    data &&
    typeof data === "object" &&
    "results" in data &&
    Array.isArray((data as PaginatedResponse<T>).results),
  );
};

const normalizeProducts = (products: Product[] | undefined): Product[] => {
  if (!Array.isArray(products)) {
    return [];
  }

  const productMap = new Map<number, Product>();

  products.forEach((product) => {
    productMap.set(product.id, {
      ...product,
      image: getImageUrl(product.image),
    });
  });

  return Array.from(productMap.values());
};

const collectCategoryNodes = (
  categories: Category[],
  categoryMap: Map<number, Category>,
  orderedIds: number[],
) => {
  categories.forEach((category) => {
    const existing = categoryMap.get(category.id);

    if (!existing) {
      orderedIds.push(category.id);
    }

    categoryMap.set(category.id, {
      id: category.id,
      name: category.name,
      image: getImageUrl(category.image),
      icon: category.icon ?? existing?.icon ?? null,
      color: category.color ?? existing?.color ?? null,
      parent:
        typeof category.parent === "number" || category.parent === null
          ? category.parent
          : (existing?.parent ?? null),
      children: [],
      products: normalizeProducts([
        ...(existing?.products ?? []),
        ...(Array.isArray(category.products) ? category.products : []),
      ]),
    });

    if (Array.isArray(category.children) && category.children.length > 0) {
      collectCategoryNodes(category.children, categoryMap, orderedIds);
    }
  });
};

const buildCategoryTree = (categories: Category[]): Category[] => {
  const categoryMap = new Map<number, Category>();
  const orderedIds: number[] = [];

  collectCategoryNodes(categories, categoryMap, orderedIds);

  const orderIndex = new Map<number, number>(
    orderedIds.map((id, index) => [id, index]),
  );

  const normalizedMap = new Map<number, Category>();

  orderedIds.forEach((id) => {
    const category = categoryMap.get(id);

    if (!category) {
      return;
    }

    normalizedMap.set(id, {
      ...category,
      children: [],
      products: normalizeProducts(category.products),
    });
  });

  const roots: Category[] = [];

  orderedIds.forEach((id) => {
    const category = normalizedMap.get(id);

    if (!category) {
      return;
    }

    if (typeof category.parent === "number") {
      const parent = normalizedMap.get(category.parent);

      if (parent) {
        parent.children = [...(parent.children ?? []), category];
        parent.children.sort(
          (first, second) =>
            (orderIndex.get(first.id) ?? 0) - (orderIndex.get(second.id) ?? 0),
        );
        return;
      }
    }

    roots.push(category);
  });

  return roots;
};

const cloneCategoryTree = (categories: Category[]): Category[] => {
  return categories.map((category) => ({
    ...category,
    products: Array.isArray(category.products)
      ? category.products.map((product) => ({ ...product }))
      : [],
    children: cloneCategoryTree(category.children ?? []),
  }));
};

const fetchAllCategoryPages = async (): Promise<Category[]> => {
  const collected: Category[] = [];
  let nextUrl: string | null = Endpoints.CATEGORIES;

  while (nextUrl) {
    const response = await client.get<unknown>(nextUrl, {
      timeout: CATEGORY_TREE_TIMEOUT,
    });

    if (Array.isArray(response.data)) {
      collected.push(...(response.data as Category[]));
      break;
    }

    if (isPaginatedResponse<Category>(response.data)) {
      collected.push(...(response.data.results ?? []));
      nextUrl = response.data.next;
      continue;
    }

    nextUrl = null;
  }

  return collected;
};

const findCategoryInTree = (
  categories: Category[],
  targetId: number,
): Category | null => {
  for (const category of categories) {
    if (category.id === targetId) {
      return category;
    }

    const childMatch = findCategoryInTree(category.children ?? [], targetId);

    if (childMatch) {
      return childMatch;
    }
  }

  return null;
};

let categoryTreeCache: Category[] | null = null;
let categoryTreeCacheAt = 0;
let categoryTreeRequest: Promise<Category[]> | null = null;

const getCachedCategoryTree = (): Category[] | null => {
  const isCacheValid =
    categoryTreeCache &&
    Date.now() - categoryTreeCacheAt < CATEGORY_TREE_CACHE_TTL;

  if (!isCacheValid || !categoryTreeCache) {
    return null;
  }

  return cloneCategoryTree(categoryTreeCache);
};

const loadCategoryTree = async (forceRefresh = false): Promise<Category[]> => {
  if (!forceRefresh) {
    const cachedTree = getCachedCategoryTree();

    if (cachedTree) {
      return cachedTree;
    }

    if (categoryTreeRequest) {
      return categoryTreeRequest.then(cloneCategoryTree);
    }
  }

  categoryTreeRequest = fetchAllCategoryPages()
    .then((allCategories) => {
      const tree = buildCategoryTree(allCategories);
      categoryTreeCache = cloneCategoryTree(tree);
      categoryTreeCacheAt = Date.now();
      return cloneCategoryTree(tree);
    })
    .finally(() => {
      categoryTreeRequest = null;
    });

  return categoryTreeRequest;
};

export const categoryService = {
  getTree: async (forceRefresh = false): Promise<Category[]> => {
    try {
      return await loadCategoryTree(forceRefresh);
    } catch (error) {
      console.error("[Category Service] failed to load category tree:", error);
      throw error;
    }
  },

  getAll: async (forceRefresh = false): Promise<Category[]> => {
    return categoryService.getTree(forceRefresh);
  },

  getById: async (id: number): Promise<Category> => {
    try {
      const response = await client.get<Category>(
        Endpoints.CATEGORY_DETAIL(id),
      );
      const normalizedTree = buildCategoryTree([response.data]);
      const category =
        findCategoryInTree(normalizedTree, id) ?? normalizedTree[0];

      if (!category) {
        throw new Error(`Category ${id} not found`);
      }

      return category;
    } catch (error) {
      console.warn(
        `[Category Service] detail endpoint failed for ${id}, fallback to tree.`,
        error,
      );

      const treeCategories = await categoryService.getTree();
      const category = findCategoryInTree(treeCategories, id);

      if (!category) {
        console.error(`[Category Service] category ${id} not found in tree.`);
        throw error;
      }

      return category;
    }
  },

  getProductsByCategory: async ({
    categoryId,
    keyword = "",
    page = 1,
    filters,
  }: {
    categoryId: number;
    keyword?: string;
    page?: number;
    filters?: ProductSearchFilters;
  }): Promise<SearchProductsResponse> => {
    try {
      return await searchService.searchProducts({
        categoryId,
        keyword,
        page,
        filters,
      });
    } catch (error) {
      console.error(
        `[Category Service] failed to load products for category ${categoryId}:`,
        error,
      );
      throw error;
    }
  },
};
