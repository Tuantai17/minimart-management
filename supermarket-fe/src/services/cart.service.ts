import type {
  AddToCartPayload,
  CartResponse,
  CartItemAPI,
  UpdateCartItemPayload,
} from "../types/cart.type";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

export const cartService = {
  /**
   * Lấy giỏ hàng của user hiện tại
   * GET /api/carts/me/
   */
  getMyCart: async (): Promise<CartResponse> => {
    const response = await client.get<CartResponse>(Endpoints.CART_ME);
    return response.data;
  },

  /**
   * Thêm sản phẩm vào giỏ
   * POST /api/cart-items/
   */
  addItem: async (payload: AddToCartPayload): Promise<CartItemAPI> => {
    const response = await client.post<CartItemAPI>(Endpoints.CART_ADD, payload);
    return response.data;
  },

  /**
   * Cập nhật số lượng item
   * PATCH /api/cart-items/<id>/
   */
  updateItem: async (
    itemId: number,
    payload: UpdateCartItemPayload
  ): Promise<CartItemAPI> => {
    const response = await client.patch<CartItemAPI>(
      Endpoints.CART_UPDATE(itemId),
      payload
    );
    return response.data;
  },

  /**
   * Xóa item khỏi giỏ
   * DELETE /api/cart-items/<id>/
   */
  removeItem: async (itemId: number): Promise<void> => {
    await client.delete(Endpoints.CART_REMOVE(itemId));
  },
};
