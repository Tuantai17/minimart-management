import type {
  AvatarUploadPayload,
  UpdateProfilePayload,
  UserProfile,
} from "../types";
import { Config } from "../constants";
import { storage } from "../utils";
import { ApiError, toApiError } from "./api/api-error";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

// Kiểu object tổng quát cho dữ liệu thô trả về từ API.
type ApiRecord = Record<string, unknown>;
const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
]);
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Type guard: kiểm tra một giá trị có phải object thường hay không.
const isRecord = (value: unknown): value is ApiRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Lấy chuỗi đầu tiên có giá trị (không rỗng) trong danh sách truyền vào.
const firstNonEmptyString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

// Kiểm tra URL đã là tuyệt đối (http/https) hay chưa.
const isValidUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

// Chuẩn hóa avatar_url từ backend: nếu là đường dẫn tương đối thì ghép base URL.
const buildAbsoluteMediaUrl = (value: string): string => {
  if (isValidUrl(value)) {
    return value;
  }

  const baseUrl = Config.API_BASE_URL.replace(/\/api\/?$/, "");
  return value.startsWith("/") ? `${baseUrl}${value}` : `${baseUrl}/${value}`;
};

// Gắn cache-buster để buộc app tải ảnh mới thay vì dùng ảnh cache cũ.
const appendCacheBuster = (url: string, cacheKey: string): string => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${cacheKey}`;
};

const getFileExtension = (value: string): string => {
  const cleanValue = value.split("?")[0].trim().toLowerCase();
  const extension = cleanValue.split(".").pop()?.trim();
  return extension || "";
};

const validateAvatarPayload = (
  avatar: AvatarUploadPayload,
): string | null => {
  const mimeType = (avatar.mimeType || "").trim().toLowerCase();
  const extension = getFileExtension(avatar.name || avatar.uri || "");

  if (mimeType && !mimeType.startsWith("image/")) {
    return "Chi ho tro tep anh cho avatar.";
  }

  if (
    extension &&
    !ALLOWED_AVATAR_EXTENSIONS.has(extension) &&
    (!mimeType || !ALLOWED_AVATAR_MIME_TYPES.has(mimeType))
  ) {
    return "Chi chap nhan dinh dang jpg, jpeg, png, webp, gif.";
  }

  const webFileSize = avatar.file?.size;
  if (
    typeof webFileSize === "number" &&
    Number.isFinite(webFileSize) &&
    webFileSize > MAX_AVATAR_FILE_SIZE_BYTES
  ) {
    return "Anh dai dien tai len qua lon, toi da 5MB!";
  }

  return null;
};

// Chuẩn hóa dữ liệu profile trả về từ backend về đúng kiểu UserProfile của app.
const normalizeProfile = (data: unknown): UserProfile => {
  const record = isRecord(data) ? data : {};
  const rawAvatarUrl = firstNonEmptyString(record.avatar_url);
  const permissions = Array.isArray(record.permissions)
    ? record.permissions.filter((item): item is string => typeof item === "string")
    : undefined;
  const roleFeatures = isRecord(record.role_features)
    ? {
        ...(typeof record.role_features.show_customer_features === "boolean" && {
          show_customer_features: record.role_features.show_customer_features,
        }),
        ...(typeof record.role_features.show_staff_features === "boolean" && {
          show_staff_features: record.role_features.show_staff_features,
        }),
        ...(typeof record.role_features.show_admin_features === "boolean" && {
          show_admin_features: record.role_features.show_admin_features,
        }),
      }
    : undefined;

  return {
    id: typeof record.id === "number" ? record.id : Number(record.id) || 0,
    name: firstNonEmptyString(record.name),
    email: firstNonEmptyString(record.email),
    phone: firstNonEmptyString(record.phone),
    avatar_url: rawAvatarUrl ? buildAbsoluteMediaUrl(rawAvatarUrl) : null,
    // Bảo toàn thông tin vai trò từ backend (nếu API trả về)
    // Chỉ gán khi backend thực sự trả về kiểu boolean/string,
    // tránh ghi đè bằng undefined ở buildUserFromProfile
    ...(typeof record.is_staff === "boolean" && { is_staff: record.is_staff }),
    ...(typeof record.is_superuser === "boolean" && { is_superuser: record.is_superuser }),
    ...(typeof record.is_active === "boolean" && { is_active: record.is_active }),
    ...(typeof record.role === "string" && { role: record.role as UserProfile["role"] }),
    ...(typeof record.receive_stock_alerts === "boolean" && { receive_stock_alerts: record.receive_stock_alerts }),
    ...(Array.isArray(permissions) && { permissions }),
    ...(roleFeatures && Object.keys(roleFeatures).length > 0 && { role_features: roleFeatures }),
  };
};

// Đảm bảo endpoint luôn là URL tuyệt đối trước khi gọi fetch thủ công.
const buildAbsoluteApiUrl = (endpoint: string): string => {
  if (isValidUrl(endpoint)) {
    return endpoint;
  }

  return endpoint.startsWith("/")
    ? `${Config.API_BASE_URL}${endpoint}`
    : `${Config.API_BASE_URL}/${endpoint}`;
};

// Parse response text an toàn: JSON thì parse, không phải JSON thì giữ nguyên string.
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

// Trích xuất thông báo lỗi thân thiện từ nhiều format trả về của backend.
const pickErrorMessage = (data: unknown): string => {
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }

  if (isRecord(data)) {
    const preferredKeys = ["detail", "message", "error", "non_field_errors"];

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

// Nhánh native (React Native) dùng fetch để gửi multipart ổn định hơn khi có file.
const updateProfileWithNativeFetch = async (
  formData: FormData,
): Promise<UserProfile> => {
  // 1) Lấy token đã lưu để gắn Authorization header.
  const token = await storage.get("authToken");

  // 2) Gửi PATCH /me với body là FormData (name/phone/avatar).
  const response = await fetch(buildAbsoluteApiUrl(Endpoints.ME), {
    method: "PATCH",
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
    body: formData,
  });

  // 3) Đọc response theo text để parse linh hoạt nhiều kiểu phản hồi.
  const responseText = await response.text();
  const responseData = parseApiResponseData(responseText);

  // 4) Nếu backend trả lỗi thì chuẩn hóa message và throw ApiError.
  if (!response.ok) {
    throw new ApiError(
      pickErrorMessage(responseData) || "Không thể cập nhật thông tin cá nhân.",
      response.status,
    );
  }

  // 5) Thành công: chuẩn hóa dữ liệu profile trả về.
  return normalizeProfile(responseData);
};

export const userService = {
  // Lấy thông tin profile hiện tại của user đang đăng nhập.
  getMyProfile: async (): Promise<UserProfile> => {
    try {
      const response = await client.get(Endpoints.ME);
      return normalizeProfile(response.data);
    } catch (error) {
      throw toApiError(error, "Không thể tải thông tin cá nhân.");
    }
  },

  // Cập nhật profile theo luồng FormData: name/phone/avatar.
  updateProfile: async (payload: UpdateProfilePayload): Promise<UserProfile> => {
    // A) Tạo FormData để gửi cùng lúc text + file.
    const formData = new FormData();
    const isWeb =
      typeof window !== "undefined" && typeof document !== "undefined";
    const hasAvatarUpload = Boolean(payload.avatar?.uri);

    // B) Append các field text nếu có.
    if (typeof payload.name === "string") {
      formData.append("name", payload.name.trim());
    }

    if (typeof payload.phone === "string") {
      formData.append("phone", payload.phone.trim());
    }

    // C) Append ảnh avatar nếu user có chọn ảnh mới.
    if (payload.avatar?.uri) {
      const avatarError = validateAvatarPayload(payload.avatar);
      if (avatarError) {
        throw new ApiError(avatarError, 400);
      }

      const fileName = payload.avatar.name || `avatar-${Date.now()}.jpg`;
      const mimeType = payload.avatar.mimeType || "image/jpeg";

      if (isWeb) {
        // C1) Trên web: append File object vào FormData.
        try {
          const webFile = payload.avatar.file;

          if (webFile instanceof File) {
            formData.append("avatar", webFile, fileName);
          } else {
            // Fallback web: fetch URI thành blob rồi tạo File để upload.
            const response = await fetch(payload.avatar.uri);
            const blob = await response.blob();
            const file = new File([blob], fileName, { type: mimeType });
            formData.append("avatar", file, fileName);
          }
        } catch {
          throw new Error("Không thể đọc file ảnh để tải lên.");
        }
      } else {
        // C2) Trên native: append object { uri, name, type } cho RN fetch/axios.
        formData.append("avatar", {
          uri: payload.avatar.uri,
          name: fileName,
          type: mimeType,
        } as any);
      }
    }

    try {
      // D) Gửi request cập nhật profile.
      // - Native + có ảnh: dùng fetch thủ công để upload ổn định.
      // - Trường hợp còn lại: dùng axios client patch như thường lệ.
      const profile =
        !isWeb && hasAvatarUpload
          ? await updateProfileWithNativeFetch(formData)
          : normalizeProfile((await client.patch(Endpoints.ME, formData)).data);

      // E) Nếu vừa đổi avatar thì thêm cache-buster để UI lấy ảnh mới ngay.
      if (payload.avatar && profile.avatar_url) {
        return {
          ...profile,
          avatar_url: appendCacheBuster(profile.avatar_url, `${Date.now()}`),
        };
      }

      return profile;
    } catch (error) {
      // F) Chuẩn hóa lỗi upload avatar trên native để message dễ hiểu hơn.
      if (!isWeb && hasAvatarUpload && error instanceof TypeError) {
        throw new ApiError(
          "Không thể tải ảnh đại diện lên. Vui lòng kiểm tra mạng hoặc thử lại với ảnh khác.",
        );
      }

      throw toApiError(error, "Không thể cập nhật thông tin cá nhân.");
    }
  },

  // Shortcut chỉ cập nhật avatar, tái sử dụng luồng updateProfile chung.
  updateAvatar: async (payload: AvatarUploadPayload): Promise<UserProfile> => {
    return userService.updateProfile({ avatar: payload });
  },

  // Cập nhật cấu hình nhận email cảnh báo tồn kho
  updateStockAlerts: async (receive_stock_alerts: boolean): Promise<{ message: string; receive_stock_alerts: boolean }> => {
    try {
      const response = await client.patch(Endpoints.PROFILE_STOCK_ALERTS, { receive_stock_alerts });
      return response.data;
    } catch (error) {
      throw toApiError(error, "Không thể thiết lập nhận thông báo.");
    }
  },

  // Alias tên hàm cũ để tương thích với chỗ gọi hiện tại trong app.
  getProfile: async (): Promise<UserProfile> => userService.getMyProfile(),
};
