/**
 * ============================
 * CART ERROR CLASSES
 * ============================
 * Tách riêng để tránh Require Cycle giữa store và utils.
 */

export class AuthRequiredError extends Error {
  constructor() {
    super("AUTH_REQUIRED");
    this.name = "AuthRequiredError";
  }
}

export class OutOfStockError extends Error {
  constructor(message = "Sản phẩm đã hết hàng hoặc vượt quá số lượng tồn kho") {
    super(message);
    this.name = "OutOfStockError";
  }
}

export class InactiveProductError extends Error {
  constructor(message = "Sản phẩm này hiện đang ngừng kinh doanh") {
    super(message);
    this.name = "InactiveProductError";
  }
}
