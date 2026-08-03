import { create } from "zustand";
import {
    AuthRequiredError,
    InactiveProductError,
    OutOfStockError,
} from "../errors";
import { cartService } from "../services/cart.service";
import { productService } from "../services/product.service";
import type { Product } from "../types";
import type {
    AddToCartPayload,
    CartItem,
    CartItemAPI,
    CartResponse,
} from "../types/cart.type";
import { storage } from "../utils/storage";
import { useAuthStore } from "./auth.store";

export { AuthRequiredError, InactiveProductError, OutOfStockError };

const LOCAL_CART_KEY = "localCart";

const isUnauthorized = (error: unknown): boolean => {
  const status = (error as any)?.response?.status || (error as any)?.status;
  return (
    status === 401 || String((error as any)?.message || "").includes("401")
  );
};

const shouldRecoverByServerSnapshot = (error: unknown): boolean => {
  const status = (error as any)?.response?.status || (error as any)?.status;
  return status === 500 || status === 409 || status === 400;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCartItem = (item: Partial<CartItemAPI>): CartItemAPI => {
  const quantity = Math.max(1, toNumber(item.quantity) || 1);
  const unitPrice = toNumber(item.unit_price ?? item.product_details?.price);
  const fallbackSubtotal = quantity * unitPrice;

  return {
    id: toNumber(item.id),
    product: toNumber(item.product ?? item.product_details?.id),
    product_details: {
      id: toNumber(item.product_details?.id ?? item.product),
      name: item.product_details?.name?.trim() || "Sản phẩm",
      image: item.product_details?.image ?? null,
      price: String(
        item.product_details?.price ?? item.unit_price ?? unitPrice,
      ),
    },
    quantity,
    unit_price: String(item.unit_price ?? unitPrice),
    subtotal: toNumber(item.subtotal) || fallbackSubtotal,
  };
};

const normalizeCartItems = (items: unknown): CartItemAPI[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => normalizeCartItem(item as Partial<CartItemAPI>));
};

const calculateTotalPrice = (items: CartItemAPI[]): number => {
  return items.reduce((sum, item) => {
    const subtotal = toNumber(item.subtotal);

    if (subtotal > 0) {
      return sum + subtotal;
    }

    return sum + item.quantity * toNumber(item.unit_price);
  }, 0);
};

const filterSelectedIds = (selectedIds: number[], items: CartItemAPI[]) => {
  const itemIds = items.map((item) => item.id);
  return selectedIds.filter((id) => itemIds.includes(id));
};

const getLocalCart = async (): Promise<CartItemAPI[]> => {
  const storedItems =
    (await storage.getJSON<CartItemAPI[]>(LOCAL_CART_KEY)) || [];
  return normalizeCartItems(storedItems);
};

const saveLocalCart = async (items: CartItemAPI[]) => {
  await storage.setJSON(LOCAL_CART_KEY, items);
};

const getServerCartSnapshot = async (): Promise<{
  cartId: number;
  items: CartItemAPI[];
  totalPrice: number;
}> => {
  const data: CartResponse = await cartService.getMyCart();

  return {
    cartId: toNumber(data?.id),
    items: normalizeCartItems(data?.items),
    totalPrice: toNumber(data?.total_price),
  };
};

const buildLocalCartItem = (product: CartItem): CartItemAPI => {
  const quantity = Math.max(1, product.quantity || 1);
  const unitPrice = toNumber(product.price);

  return {
    id: product.id,
    product: product.id,
    product_details: {
      id: product.id,
      name: product.name,
      image: product.image || null,
      price: String(unitPrice),
    },
    quantity,
    unit_price: String(unitPrice),
    subtotal: quantity * unitPrice,
  };
};

const fetchLatestProductForCart = async (
  productId: number,
): Promise<Product> => {
  const product = await productService.getById(productId);

  if (!product?.id) {
    throw new Error("Không thể tải thông tin sản phẩm mới nhất");
  }

  if (product.is_active === false) {
    throw new InactiveProductError(
      "Sản phẩm này hiện đang tạm ngừng kinh doanh",
    );
  }

  return product;
};

const getAvailableStock = (product: Product): number => {
  return Math.max(0, toNumber(product?.stock_quantity));
};

const getExistingQuantityByProduct = (
  items: CartItemAPI[],
  productId: number,
): number => {
  const matchedItem = items.find((item) => item.product === productId);
  return matchedItem ? Math.max(0, toNumber(matchedItem.quantity)) : 0;
};

const validateAddToCartRequest = async (
  items: CartItemAPI[],
  productId: number,
  quantityToAdd: number,
): Promise<{
  product: Product;
  availableStock: number;
  existingQuantity: number;
  nextQuantity: number;
}> => {
  const product = await fetchLatestProductForCart(productId);
  const availableStock = getAvailableStock(product);
  const existingQuantity = getExistingQuantityByProduct(items, productId);
  const nextQuantity = existingQuantity + quantityToAdd;

  if (availableStock <= 0) {
    throw new OutOfStockError("Sản phẩm hiện đã hết hàng");
  }

  if (nextQuantity > availableStock) {
    throw new OutOfStockError(`Chỉ còn ${availableStock} sản phẩm trong kho`);
  }

  return {
    product,
    availableStock,
    existingQuantity,
    nextQuantity,
  };
};

interface CartInventoryAdjustment {
  cartItemId: number;
  productId: number;
  productName: string;
  previousQuantity: number;
  nextQuantity: number;
  availableStock: number;
  removed: boolean;
}

interface CartState {
  items: CartItemAPI[];
  totalPrice: number;
  loading: boolean;
  error: string | null;
  selectedIds: number[];
  fetchCart: () => Promise<void>;
  checkBeforeAddToCart: (
    productId: number,
    quantityToAdd?: number,
  ) => Promise<Product>;
  addToCart: (product: CartItem) => Promise<void>;
  increaseQty: (cartItemId: number, currentQty: number) => Promise<void>;
  decreaseQty: (cartItemId: number, currentQty: number) => Promise<void>;
  removeFromCart: (cartItemId: number) => Promise<void>;
  removeSelectedFromCart: (ids: number[]) => Promise<void>;
  clearCart: () => Promise<void>;
  restoreCartSnapshot: (items: CartItemAPI[]) => Promise<void>;
  syncLocalCart: () => Promise<void>;
  reconcileCartInventory: () => Promise<CartInventoryAdjustment[]>;
  toggleSelectCartItem: (cartItemId: number) => void;
  selectAllCartItems: () => void;
  unselectAllCartItems: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  totalPrice: 0,
  loading: false,
  error: null,
  selectedIds: [],

  fetchCart: async () => {
    set({ loading: true, error: null });

    const applyItems = (items: CartItemAPI[], totalPrice?: number) => {
      set((state) => ({
        items,
        totalPrice:
          typeof totalPrice === "number" && totalPrice >= 0
            ? totalPrice
            : calculateTotalPrice(items),
        loading: false,
        error: null,
        selectedIds: filterSelectedIds(state.selectedIds, items),
      }));
    };

    try {
      if (useAuthStore.getState().isLoggedIn) {
        const snapshot = await getServerCartSnapshot();
        applyItems(snapshot.items, snapshot.totalPrice);
        return;
      }

      const localItems = await getLocalCart();
      applyItems(localItems);
    } catch (error) {
      if (isUnauthorized(error)) {
        const localItems = await getLocalCart();
        applyItems(localItems);
        return;
      }

      const currentItems = get().items;
      set((state) => ({
        items: currentItems,
        totalPrice: calculateTotalPrice(currentItems),
        loading: false,
        error: "Không thể tải giỏ hàng. Vui lòng thử lại.",
        selectedIds: filterSelectedIds(state.selectedIds, currentItems),
      }));

      console.log(
        "[Cart Store] fetchCart failed:",
        (error as any)?.message || error,
      );
    }
  },

  checkBeforeAddToCart: async (productId: number, quantityToAdd = 1) => {
    set({ error: null });

    const normalizedProductId = toNumber(productId);
    const normalizedQuantity = Math.max(1, toNumber(quantityToAdd) || 1);

    if (!normalizedProductId || normalizedProductId <= 0) {
      throw new Error("Sản phẩm không hợp lệ");
    }

    const currentItems = get().items;
    const validation = await validateAddToCartRequest(
      currentItems,
      normalizedProductId,
      normalizedQuantity,
    );

    return validation.product;
  },

  addToCart: async (product: CartItem) => {
    try {
      set({ error: null });
      const quantityToAdd = Math.max(1, product.quantity || 1);

      // Validate product.id trước khi gọi API
      const productId = toNumber(product.id);
      if (!productId || productId <= 0) {
        console.error("[Cart Store] addToCart: product.id không hợp lệ", {
          productId: product.id,
          product,
        });
        set({ error: "Sản phẩm không hợp lệ" });
        return;
      }

      const currentItems = get().items;
      const validation = await validateAddToCartRequest(
        currentItems,
        productId,
        quantityToAdd,
      );
      const nextQuantity = validation.nextQuantity;

      if (useAuthStore.getState().isLoggedIn) {
        const addPayload: AddToCartPayload = {
          product: productId,
          quantity: quantityToAdd,
        };

        try {
          console.log("[Cart Store] addItem payload:", addPayload);
          await cartService.addItem(addPayload);
        } catch (error: any) {
          console.error(
            "[Cart Store] addToCart API failed:",
            error.response?.data || error.message,
          );
          if (isUnauthorized(error)) {
            throw new AuthRequiredError();
          }
          throw error; // Quăng ra để catch tổng của addToCart nắm bắt và hiển thị lỗi.
        }

        await get().fetchCart();
        return;
      }

      const localItems = await getLocalCart();
      const existingIndex = localItems.findIndex(
        (item) => item.product === product.id,
      );

      if (existingIndex >= 0) {
        localItems[existingIndex] = normalizeCartItem({
          ...localItems[existingIndex],
          quantity: nextQuantity,
          subtotal:
            nextQuantity * toNumber(localItems[existingIndex].unit_price),
        });
      } else {
        localItems.push(buildLocalCartItem(product));
      }

      await saveLocalCart(localItems);
      set((state) => ({
        items: localItems,
        totalPrice: calculateTotalPrice(localItems),
        error: null,
        loading: false,
        selectedIds: filterSelectedIds(state.selectedIds, localItems),
      }));
    } catch (error) {
      if (isUnauthorized(error)) {
        throw new AuthRequiredError();
      }

      if (
        error instanceof OutOfStockError ||
        error instanceof InactiveProductError
      ) {
        set({ error: error.message });
        throw error;
      }

      // Log chi tiết để debug
      const axiosError = error as any;
      console.error("[Cart Store] addToCart failed:", {
        message: axiosError?.message,
        status: axiosError?.response?.status,
        responseBody: axiosError?.response?.data,
        requestPayload: axiosError?.config?.data,
      });

      const serverMessage =
        axiosError?.response?.data?.detail ||
        axiosError?.response?.data?.message ||
        (typeof axiosError?.response?.data === "string"
          ? axiosError.response.data
          : null);

      set({
        error:
          serverMessage || "Không thể thêm vào giỏ hàng. Vui lòng thử lại.",
      });
      throw error;
    }
  },

  increaseQty: async (cartItemId: number, currentQty: number) => {
    try {
      set({ error: null });

      const targetItem = get().items.find((item) => item.id === cartItemId);
      const productId = toNumber(targetItem?.product);
      const quantityToAdd = 1;
      const currentItems = get().items;

      if (productId <= 0) {
        throw new Error("Sản phẩm không hợp lệ");
      }

      const currentProductQuantity = getExistingQuantityByProduct(
        currentItems,
        productId,
      );
      const quantityDelta = Math.max(0, currentQty - currentProductQuantity);

      const validation = await validateAddToCartRequest(
        currentItems,
        productId,
        quantityToAdd + quantityDelta,
      );

      const nextQuantity = validation.nextQuantity;

      if (useAuthStore.getState().isLoggedIn) {
        await cartService.updateItem(cartItemId, { quantity: nextQuantity });
        await get().fetchCart();
        return;
      }

      const localItems = await getLocalCart();
      const item = localItems.find((entry) => entry.id === cartItemId);

      if (!item) {
        return;
      }

      item.quantity = nextQuantity;
      item.subtotal = item.quantity * toNumber(item.unit_price);
      await saveLocalCart(localItems);
      set((state) => ({
        items: localItems,
        totalPrice: calculateTotalPrice(localItems),
        error: null,
        loading: false,
        selectedIds: filterSelectedIds(state.selectedIds, localItems),
      }));
    } catch (error) {
      if (isUnauthorized(error)) {
        throw new AuthRequiredError();
      }

      if (
        error instanceof OutOfStockError ||
        error instanceof InactiveProductError
      ) {
        set({ error: error.message });
        throw error;
      }

      console.log(
        "[Cart Store] increaseQty failed:",
        (error as any)?.message || error,
      );
      set({ error: "Không thể cập nhật số lượng" });
    }
  },

  decreaseQty: async (cartItemId: number, currentQty: number) => {
    try {
      set({ error: null });

      if (useAuthStore.getState().isLoggedIn) {
        if (currentQty <= 1) {
          await cartService.removeItem(cartItemId);
        } else {
          await cartService.updateItem(cartItemId, {
            quantity: currentQty - 1,
          });
        }

        await get().fetchCart();
        return;
      }

      let localItems = await getLocalCart();

      if (currentQty <= 1) {
        localItems = localItems.filter((item) => item.id !== cartItemId);
      } else {
        const item = localItems.find((entry) => entry.id === cartItemId);
        if (!item) {
          return;
        }

        item.quantity -= 1;
        item.subtotal = item.quantity * toNumber(item.unit_price);
      }

      await saveLocalCart(localItems);
      set((state) => ({
        items: localItems,
        totalPrice: calculateTotalPrice(localItems),
        error: null,
        loading: false,
        selectedIds: filterSelectedIds(state.selectedIds, localItems),
      }));
    } catch (error) {
      if (isUnauthorized(error)) {
        throw new AuthRequiredError();
      }

      console.log(
        "[Cart Store] decreaseQty failed:",
        (error as any)?.message || error,
      );
      set({ error: "Không thể cập nhật số lượng" });
    }
  },

  removeFromCart: async (cartItemId: number) => {
    try {
      set({ error: null });

      if (useAuthStore.getState().isLoggedIn) {
        await cartService.removeItem(cartItemId);
        await get().fetchCart();
      } else {
        const localItems = (await getLocalCart()).filter(
          (item) => item.id !== cartItemId,
        );
        await saveLocalCart(localItems);
        set((state) => ({
          items: localItems,
          totalPrice: calculateTotalPrice(localItems),
          error: null,
          loading: false,
          selectedIds: filterSelectedIds(state.selectedIds, localItems),
        }));
      }

      set((state) => ({
        selectedIds: state.selectedIds.filter((id) => id !== cartItemId),
      }));
    } catch (error) {
      if (isUnauthorized(error)) {
        throw new AuthRequiredError();
      }

      console.log(
        "[Cart Store] removeFromCart failed:",
        (error as any)?.message || error,
      );
      set({ error: "Không thể xóa sản phẩm" });
      throw error;
    }
  },

  removeSelectedFromCart: async (ids: number[]) => {
    try {
      set({ error: null });

      if (useAuthStore.getState().isLoggedIn) {
        for (const id of ids) {
          await cartService.removeItem(id);
        }

        await get().fetchCart();
      } else {
        const localItems = (await getLocalCart()).filter(
          (item) => !ids.includes(item.id),
        );
        await saveLocalCart(localItems);
        set({
          items: localItems,
          totalPrice: calculateTotalPrice(localItems),
          error: null,
          loading: false,
          selectedIds: [],
        });
      }

      set({ selectedIds: [] });
    } catch (error) {
      if (isUnauthorized(error)) {
        throw new AuthRequiredError();
      }

      console.log(
        "[Cart Store] removeSelectedFromCart failed:",
        (error as any)?.message || error,
      );
      set({ error: "Không thể xóa sản phẩm đã chọn" });
      throw error;
    }
  },

  clearCart: async () => {
    try {
      set({ error: null });

      if (useAuthStore.getState().isLoggedIn) {
        const currentItems = get().items;
        for (const item of currentItems) {
          await cartService.removeItem(item.id);
        }
      } else {
        await storage.remove(LOCAL_CART_KEY);
      }

      set({
        items: [],
        totalPrice: 0,
        selectedIds: [],
        error: null,
        loading: false,
      });
    } catch (error) {
      if (isUnauthorized(error)) {
        throw new AuthRequiredError();
      }

      console.log(
        "[Cart Store] clearCart failed:",
        (error as any)?.message || error,
      );
      set({ error: "Không thể xóa giỏ hàng" });
      throw error;
    }
  },

  restoreCartSnapshot: async (items) => {
    const normalizedItems = normalizeCartItems(items);

    try {
      set({ loading: true, error: null });

      if (useAuthStore.getState().isLoggedIn) {
        const serverSnapshot = await getServerCartSnapshot();

        for (const item of serverSnapshot.items) {
          await cartService.removeItem(item.id);
        }

        for (const item of normalizedItems) {
          await cartService.addItem({
            product: item.product,
            quantity: item.quantity,
          });
        }

        await get().fetchCart();
        return;
      }

      await saveLocalCart(normalizedItems);
      set({
        items: normalizedItems,
        totalPrice: calculateTotalPrice(normalizedItems),
        error: null,
        loading: false,
        selectedIds: normalizedItems.map((item) => item.id),
      });
    } catch (error) {
      if (isUnauthorized(error)) {
        set({ loading: false, error: null });
        throw new AuthRequiredError();
      }

      console.log(
        "[Cart Store] restoreCartSnapshot failed:",
        (error as any)?.message || error,
      );
      set({ loading: false, error: "Không thể khôi phục giỏ hàng" });
      throw error;
    }
  },

  syncLocalCart: async () => {
    try {
      const localItems = await getLocalCart();
      if (localItems.length === 0) {
        return;
      }

      for (const localItem of localItems) {
        await cartService.addItem({
          product: localItem.product,
          quantity: localItem.quantity,
        });
      }

      await storage.remove(LOCAL_CART_KEY);
      await get().fetchCart();
    } catch (error) {
      console.log(
        "[Cart Store] syncLocalCart failed:",
        (error as any)?.message || error,
      );
    }
  },

  reconcileCartInventory: async () => {
    const currentItems = get().items;

    if (currentItems.length === 0) {
      return [];
    }

    set({ loading: true, error: null });

    try {
      const adjustments: CartInventoryAdjustment[] = [];
      const authState = useAuthStore.getState();
      const nextLocalItems = [...currentItems];

      for (const item of currentItems) {
        const previousQuantity = Math.max(0, toNumber(item.quantity));

        if (previousQuantity <= 0) {
          continue;
        }

        try {
          const latestProduct = await fetchLatestProductForCart(item.product);
          const availableStock = getAvailableStock(latestProduct);
          const nextQuantity = Math.min(previousQuantity, availableStock);

          if (nextQuantity === previousQuantity) {
            continue;
          }

          const adjustment: CartInventoryAdjustment = {
            cartItemId: item.id,
            productId: item.product,
            productName:
              item.product_details?.name || latestProduct.name || "Sản phẩm",
            previousQuantity,
            nextQuantity,
            availableStock,
            removed: nextQuantity <= 0,
          };

          adjustments.push(adjustment);

          if (authState.isLoggedIn) {
            if (nextQuantity <= 0) {
              await cartService.removeItem(item.id);
            } else {
              await cartService.updateItem(item.id, { quantity: nextQuantity });
            }
          } else {
            const localItemIndex = nextLocalItems.findIndex(
              (entry) => entry.id === item.id,
            );

            if (localItemIndex < 0) {
              continue;
            }

            if (nextQuantity <= 0) {
              nextLocalItems.splice(localItemIndex, 1);
            } else {
              nextLocalItems[localItemIndex] = normalizeCartItem({
                ...nextLocalItems[localItemIndex],
                quantity: nextQuantity,
                subtotal:
                  nextQuantity *
                  toNumber(nextLocalItems[localItemIndex].unit_price),
              });
            }
          }
        } catch (error) {
          if (error instanceof InactiveProductError) {
            const adjustment: CartInventoryAdjustment = {
              cartItemId: item.id,
              productId: item.product,
              productName: item.product_details?.name || "Sản phẩm",
              previousQuantity,
              nextQuantity: 0,
              availableStock: 0,
              removed: true,
            };

            adjustments.push(adjustment);

            if (authState.isLoggedIn) {
              await cartService.removeItem(item.id);
            } else {
              const localItemIndex = nextLocalItems.findIndex(
                (entry) => entry.id === item.id,
              );
              if (localItemIndex >= 0) {
                nextLocalItems.splice(localItemIndex, 1);
              }
            }

            continue;
          }

          throw error;
        }
      }

      if (authState.isLoggedIn) {
        await get().fetchCart();
      } else {
        await saveLocalCart(nextLocalItems);
        set((state) => ({
          items: nextLocalItems,
          totalPrice: calculateTotalPrice(nextLocalItems),
          error: null,
          loading: false,
          selectedIds: filterSelectedIds(state.selectedIds, nextLocalItems),
        }));
      }

      if (adjustments.length === 0) {
        set({ loading: false, error: null });
      }

      return adjustments;
    } catch (error) {
      if (isUnauthorized(error)) {
        set({ loading: false, error: null });
        throw new AuthRequiredError();
      }

      console.log(
        "[Cart Store] reconcileCartInventory failed:",
        (error as any)?.message || error,
      );
      set({ loading: false, error: "Không thể đồng bộ lại giỏ hàng" });
      throw error;
    }
  },

  toggleSelectCartItem: (cartItemId: number) => {
    set((state) => {
      const isSelected = state.selectedIds.includes(cartItemId);
      return {
        selectedIds: isSelected
          ? state.selectedIds.filter((id) => id !== cartItemId)
          : [...state.selectedIds, cartItemId],
      };
    });
  },

  selectAllCartItems: () => {
    set((state) => ({
      selectedIds: state.items.map((item) => item.id),
    }));
  },

  unselectAllCartItems: () => {
    set({ selectedIds: [] });
  },

  getTotalItems: () =>
    get().items.reduce((total, item) => total + item.quantity, 0),
  getTotalPrice: () => calculateTotalPrice(get().items),
}));
