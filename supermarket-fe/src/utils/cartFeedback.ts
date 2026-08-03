import { AuthRequiredError, InactiveProductError, OutOfStockError } from "../errors";

const extractServerMessage = (error: unknown): string | null => {
  const responseData = (error as any)?.response?.data;

  if (typeof responseData === "string" && responseData.trim()) {
    return responseData.trim();
  }

  if (responseData && typeof responseData === "object") {
    const errorMessage =
      typeof responseData.error === "string" ? responseData.error.trim() : "";
    const detail =
      typeof responseData.detail === "string" ? responseData.detail.trim() : "";
    const message =
      typeof responseData.message === "string" ? responseData.message.trim() : "";

    return errorMessage || detail || message || null;
  }

  return null;
};

export const getAddToCartErrorMessage = (
  error: unknown,
  fallbackMessage = "Không thể thêm sản phẩm vào giỏ hàng. Vui lòng thử lại.",
): string => {
  if (error instanceof AuthRequiredError) {
    return "Vui lòng đăng nhập để tiếp tục mua hàng.";
  }

  if (error instanceof InactiveProductError || error instanceof OutOfStockError) {
    return error.message;
  }

  const serverMessage = extractServerMessage(error);
  if (serverMessage) {
    return serverMessage;
  }

  const errorMessage = String((error as any)?.message || "").trim();
  if (errorMessage.toLowerCase().includes("network error")) {
    return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  }

  return fallbackMessage;
};
