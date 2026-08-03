import type {
  CreateReviewPayload,
  PaginatedReviewResponse,
  ProductReview,
  ProductReviewAuthor,
  ProductReviewMedia,
  ReviewMediaUploadPayload,
  UpdateReviewPayload,
} from "../types";
import { Config } from "../constants";
import { storage } from "../utils";
import { ApiError, toApiError } from "./api/api-error";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

// ---------------------------------------------------------------------------
// Helpers nội bộ
// ---------------------------------------------------------------------------

type ApiRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ApiRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const isAbsoluteUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

const toAbsoluteMediaUrl = (value: unknown): string | null => {
  const normalized = firstString(value);

  if (!normalized) {
    return null;
  }

  if (isAbsoluteUrl(normalized)) {
    return normalized;
  }

  const baseUrl = Config.API_BASE_URL.replace(/\/api\/?$/, "");
  return normalized.startsWith("/")
    ? `${baseUrl}${normalized}`
    : `${baseUrl}/${normalized}`;
};

const buildAbsoluteApiUrl = (endpoint: string): string => {
  if (isAbsoluteUrl(endpoint)) {
    return endpoint;
  }

  return endpoint.startsWith("/")
    ? `${Config.API_BASE_URL}${endpoint}`
    : `${Config.API_BASE_URL}/${endpoint}`;
};

const parseApiResponseData = (value: string): unknown => {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const pickErrorMessage = (data: unknown): string => {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (isRecord(data)) {
    const preferredKeys = [
      "detail",
      "message",
      "error",
      "non_field_errors",
      "file",
      "files",
      "media",
    ];

    for (const key of preferredKeys) {
      const value = data[key];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }

      if (Array.isArray(value)) {
        const firstMessage = value.find(
          (item) => typeof item === "string" && item.trim(),
        );

        if (typeof firstMessage === "string") {
          return firstMessage.trim();
        }
      }
    }
  }

  return "";
};

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

const normalizeAuthor = (value: unknown): ProductReviewAuthor | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    id:
      typeof value.id === "number" || typeof value.id === "string"
        ? value.id
        : null,
    username: firstString(value.username) || null,
    email: firstString(value.email) || null,
    name: firstString(value.name) || null,
    full_name: firstString(value.full_name) || null,
    avatar_url: toAbsoluteMediaUrl(value.avatar_url ?? value.avatar),
  };
};

const normalizeMediaItem = (value: unknown): ProductReviewMedia | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = toNumberOrNull(value.id);
  const fileUrl = toAbsoluteMediaUrl(value.file_url ?? value.url ?? value.file);
  const mediaType = firstString(value.media_type, value.type).toLowerCase();

  if (id == null || !fileUrl || (mediaType !== "image" && mediaType !== "video")) {
    return null;
  }

  return {
    id,
    file_url: fileUrl,
    media_type: mediaType,
    uploaded_at: firstString(value.uploaded_at, value.created_at) || null,
  };
};

const normalizeReview = (data: unknown): ProductReview => {
  const record = isRecord(data) ? data : {};
  const author = normalizeAuthor(record.user ?? record.author ?? record.customer);
  const rating = toNumberOrNull(record.rating) ?? 0;
  const product =
    toNumberOrNull(record.product) ??
    toNumberOrNull(record.product_id) ??
    0;
  const reviewerName = firstString(
    record.reviewer_name,
    record.full_name,
    record.user_name,
    record.username,
    author?.full_name,
    author?.name,
    author?.username,
    author?.email,
  );
  const reviewerAvatar = toAbsoluteMediaUrl(
    record.reviewer_avatar ?? record.avatar_url ?? author?.avatar_url,
  );
  const media = Array.isArray(record.media)
    ? record.media
        .map(normalizeMediaItem)
        .filter((item): item is ProductReviewMedia => Boolean(item))
    : [];

  return {
    id: toNumberOrNull(record.id) ?? 0,
    product,
    rating,
    comment: typeof record.comment === "string" ? record.comment.trim() : "",
    created_at: firstString(record.created_at, record.date),
    updated_at: firstString(record.updated_at) || null,
    user:
      author ??
      (typeof record.user === "number" || typeof record.user === "string"
        ? record.user
        : null),
    user_id:
      toNumberOrNull(record.user_id) ??
      toNumberOrNull(record.customer_id) ??
      null,
    username: firstString(record.username, author?.username) || null,
    user_name: firstString(record.user_name, record.name, author?.name) || null,
    full_name: firstString(record.full_name, author?.full_name) || null,
    avatar_url: toAbsoluteMediaUrl(record.avatar_url ?? author?.avatar_url),
    reviewer_name: reviewerName || null,
    reviewer_avatar: reviewerAvatar,
    shop_reply: typeof record.shop_reply === "string" ? record.shop_reply.trim() : null,
    shop_replied_at: firstString(record.shop_replied_at) || null,
    media,
  };
};

const normalizeReviewPage = (data: unknown): PaginatedReviewResponse => {
  if (Array.isArray(data)) {
    return {
      count: data.length,
      next: null,
      previous: null,
      results: data.map(normalizeReview),
    };
  }

  if (isRecord(data) && Array.isArray(data.results)) {
    return {
      count: toNumberOrNull(data.count) ?? data.results.length,
      next: firstString(data.next) || null,
      previous: firstString(data.previous) || null,
      results: data.results.map(normalizeReview),
    };
  }

  return {
    count: 0,
    next: null,
    previous: null,
    results: [],
  };
};

// ---------------------------------------------------------------------------
// Upload media — chiến lược chốt: field = "file", upload từng file một
// ---------------------------------------------------------------------------

/**
 * Field multipart cố định cho endpoint POST /reviews/{id}/media/.
 *
 * Backend DRF mặc định sử dụng field "file" cho FileUploadParser /
 * serializers.FileField. Mình chốt cố định field này để FE **không còn
 * gửi request thử sai** gây 400 thừa nữa.
 *
 * Nếu sau này backend đổi field, chỉ cần sửa hằng số này.
 */
const UPLOAD_FIELD_NAME = "file";

/**
 * Upload 1 file trên **native** (Android/iOS) bằng fetch() thủ công.
 *
 * - Trên React Native, FormData append dạng { uri, name, type } để RN tự
 *   đọc file từ URI local.
 * - Không đặt Content-Type header → fetch sẽ tự thêm multipart boundary.
 */
const uploadSingleMediaNative = async (
  reviewId: number | string,
  payload: ReviewMediaUploadPayload,
  index: number,
): Promise<void> => {
  const token = await storage.get("authToken");
  const formData = new FormData();
  const fileName = payload.name || `review-media-${Date.now()}-${index}.jpg`;
  const mimeType = payload.mimeType || "image/jpeg";

  formData.append(UPLOAD_FIELD_NAME, {
    uri: payload.uri,
    name: fileName,
    type: mimeType,
  } as any);

  const url = buildAbsoluteApiUrl(Endpoints.REVIEW_MEDIA(reviewId));

  const response = await fetch(url, {
    method: "POST",
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : undefined,
    body: formData,
  });

  if (!response.ok) {
    const responseText = await response.text();
    const responseData = parseApiResponseData(responseText);
    throw new ApiError(
      pickErrorMessage(responseData) || "Không thể tải media đánh giá lên.",
      response.status,
    );
  }
};

/**
 * Upload 1 file trên **web** bằng axios client (có sẵn auth interceptor).
 *
 * - Nếu payload có File object thật (từ expo-image-picker web) → dùng luôn.
 * - Nếu chỉ có blob URI → fetch blob rồi tạo File.
 */
const uploadSingleMediaWeb = async (
  reviewId: number | string,
  payload: ReviewMediaUploadPayload,
  index: number,
): Promise<void> => {
  const formData = new FormData();
  const fileName = payload.name || `review-media-${Date.now()}-${index}.jpg`;
  const mimeType = payload.mimeType || "image/jpeg";

  if (payload.file instanceof File) {
    formData.append(UPLOAD_FIELD_NAME, payload.file, fileName);
  } else {
    try {
      const response = await fetch(payload.uri);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: mimeType });
      formData.append(UPLOAD_FIELD_NAME, file, fileName);
    } catch {
      throw new ApiError("Không thể đọc file media để tải lên.");
    }
  }

  // Dùng axios client → tự gắn Bearer token + xử lý refresh token.
  await client.post(Endpoints.REVIEW_MEDIA(reviewId), formData);
};

/**
 * Upload danh sách media tuần tự (từng file một), sau đó refetch review
 * để lấy danh sách media chuẩn nhất từ backend.
 */
const uploadAllReviewMedia = async (
  reviewId: number | string,
  payloads: ReviewMediaUploadPayload[],
): Promise<ProductReview> => {
  const isWeb =
    typeof window !== "undefined" && typeof document !== "undefined";

  for (const [index, payload] of payloads.entries()) {
    if (isWeb) {
      await uploadSingleMediaWeb(reviewId, payload, index);
    } else {
      await uploadSingleMediaNative(reviewId, payload, index);
    }
  }

  // Luôn refetch review sau upload để lấy media[] chuẩn từ server.
  return reviewService.getById(reviewId);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const reviewService = {
  getByProduct: async (productId: number): Promise<ProductReview[]> => {
    try {
      const response = await client.get(Endpoints.REVIEWS(productId), {
        params: { product: productId },
      });

      return normalizeReviewPage(response.data).results;
    } catch (error) {
      throw toApiError(error, "Không thể tải danh sách đánh giá.");
    }
  },

  getReviewPageByProduct: async (
    productId: number,
    page = 1,
    pageSize = 10,
  ): Promise<PaginatedReviewResponse> => {
    try {
      const response = await client.get(Endpoints.REVIEWS(productId), {
        params: {
          product: productId,
          page,
          page_size: pageSize,
        },
      });

      return normalizeReviewPage(response.data);
    } catch (error) {
      throw toApiError(error, "Không thể tải danh sách đánh giá.");
    }
  },

  getById: async (reviewId: number | string): Promise<ProductReview> => {
    try {
      const response = await client.get(Endpoints.REVIEW_DETAIL(reviewId));
      return normalizeReview(response.data);
    } catch (error) {
      throw toApiError(error, "Không thể tải chi tiết đánh giá.");
    }
  },

  createReview: async (payload: CreateReviewPayload): Promise<ProductReview> => {
    try {
      const response = await client.post(Endpoints.REVIEWS(payload.product), payload);
      return normalizeReview(response.data);
    } catch (error) {
      throw toApiError(error, "Không thể gửi đánh giá.");
    }
  },

  updateReview: async (
    reviewId: number | string,
    payload: UpdateReviewPayload,
  ): Promise<ProductReview> => {
    try {
      const response = await client.patch(Endpoints.REVIEW_DETAIL(reviewId), payload);
      return normalizeReview(response.data);
    } catch (error) {
      throw toApiError(error, "Không thể cập nhật đánh giá.");
    }
  },

  deleteReview: async (reviewId: number | string): Promise<void> => {
    try {
      await client.delete(Endpoints.REVIEW_DETAIL(reviewId));
    } catch (error) {
      throw toApiError(error, "Không thể xóa đánh giá.");
    }
  },

  replyReview: async (
    reviewId: number | string,
    content: string,
  ): Promise<ProductReview> => {
    try {
      const response = await client.post(Endpoints.REVIEW_REPLY(reviewId), { content });
      return normalizeReview(response.data);
    } catch (error) {
      throw toApiError(error, "Không thể gửi phản hồi của shop.");
    }
  },

  deleteReply: async (reviewId: number | string): Promise<void> => {
    try {
      await client.delete(Endpoints.REVIEW_REPLY(reviewId));
    } catch (error) {
      throw toApiError(error, "Không thể xóa phản hồi của shop.");
    }
  },

  /**
   * Upload media cho review.
   *
   * - Upload tuần tự từng file một (tránh lỗi backend chỉ nhận 1 file/request).
   * - Dùng field multipart cố định "file" (không còn fallback gây request 400 thừa).
   * - Sau upload xong, refetch review để lấy dữ liệu media chuẩn nhất.
   */
  uploadReviewMedia: async (
    reviewId: number | string,
    payloads: ReviewMediaUploadPayload[],
  ): Promise<ProductReview> => {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      throw new ApiError("Vui lòng chọn ít nhất một ảnh hoặc video để tải lên.");
    }

    try {
      return await uploadAllReviewMedia(reviewId, payloads);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw toApiError(error, "Không thể tải media đánh giá lên.");
    }
  },

  deleteReviewMedia: async (
    reviewId: number | string,
    mediaId: number | string,
  ): Promise<void> => {
    try {
      await client.delete(Endpoints.REVIEW_MEDIA_DETAIL(reviewId, mediaId));
    } catch (error) {
      throw toApiError(error, "Không thể xóa media đánh giá.");
    }
  },
};
