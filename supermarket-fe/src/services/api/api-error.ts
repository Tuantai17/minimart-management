import axios from "axios";

type ApiRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ApiRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Bảng dịch lỗi phổ biến từ Backend (tiếng Anh) → tiếng Việt.
 * Khi match, trả về chuỗi tiếng Việt hoàn chỉnh (không mix).
 */
const BE_ERROR_TRANSLATIONS: Array<
  [RegExp, string | ((match: RegExpMatchArray) => string)]
> = [
  [
    /no more than (\d+) digits/i,
    (m) => `Số điện thoại không được quá ${m[1]} chữ số.`,
  ],
  [
    /ensure this field has no more than (\d+) characters/i,
    (m) => `Trường này tối đa ${m[1]} ký tự.`,
  ],
  [
    /ensure.+no more than (\d+)/i,
    (m) => `Giá trị không được vượt quá ${m[1]} ký tự.`,
  ],
  [/this field is required/i, "Trường này là bắt buộc."],
  [/this field may not be blank/i, "Trường này không được để trống."],
  [/a valid number is required/i, "Vui lòng nhập một số hợp lệ."],
  [/a valid integer is required/i, "Vui lòng nhập một số nguyên hợp lệ."],
  [/not a valid string/i, "Giá trị không hợp lệ."],
  [/invalid phone/i, "Số điện thoại không hợp lệ."],
];

const translateBeMessage = (message: string): string => {
  for (const [pattern, replacement] of BE_ERROR_TRANSLATIONS) {
    const match = message.match(pattern);
    if (match) {
      // Trả về chuỗi tiếng Việt hoàn chỉnh, không mix
      return typeof replacement === "function"
        ? replacement(match)
        : replacement;
    }
  }
  return message;
};

const pickFirstMessage = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    return translateBeMessage(value.trim());
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = pickFirstMessage(item);

      if (message) {
        return message;
      }
    }
  }

  if (isRecord(value)) {
    const preferredKeys = ["detail", "message", "error", "non_field_errors"];

    for (const key of preferredKeys) {
      const message = pickFirstMessage(value[key]);

      if (message) {
        return message;
      }
    }

    for (const nestedValue of Object.values(value)) {
      const message = pickFirstMessage(nestedValue);

      if (message) {
        return message;
      }
    }
  }

  return "";
};

export class ApiError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

export const toApiError = (
  error: unknown,
  fallbackMessage: string,
): ApiError => {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    const responseData = error.response?.data;
    const message =
      pickFirstMessage(responseData) || error.message || fallbackMessage;

    return new ApiError(message, statusCode);
  }

  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError(error.message || fallbackMessage);
  }

  return new ApiError(fallbackMessage);
};

export const getApiErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => toApiError(error, fallbackMessage).message;
