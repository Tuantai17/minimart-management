import axios from "axios";
import { router } from "expo-router";
import { Config } from "../../constants";
import { useAuthStore } from "../../store/auth.store";
import { useUIStore } from "../../store/ui.store";
import { storage } from "../../utils";
import { Endpoints } from "./endpoints";

type RetryableRequestConfig = {
  _retry?: boolean;
  headers: Record<string, string>;
  url?: string;
};

const client = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: Config.API_TIMEOUT,
});

let refreshRequest: Promise<string | null> | null = null;
let isForceLogoutInProgress = false;
let lastRateLimitToastAt = 0;

const RATE_LIMIT_TOAST_MESSAGE =
  "Hệ thống đang bận. Bạn thực hiện thao tác quá nhanh, vui lòng chờ vài phút rồi thử lại!";

const isTokenNotValidResponse = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Record<string, unknown>;
  const code = typeof data.code === "string" ? data.code.toLowerCase() : "";
  const detail =
    typeof data.detail === "string" ? data.detail.toLowerCase() : "";

  return code === "token_not_valid" || detail.includes("token not valid");
};

const showGlobalRateLimitToast = () => {
  const now = Date.now();
  if (now - lastRateLimitToastAt < 1500) {
    return;
  }

  lastRateLimitToastAt = now;
  useUIStore.getState().showToast(RATE_LIMIT_TOAST_MESSAGE, "error");
};

const clearStoredAuth = async () => {
  await Promise.all([
    storage.remove("authToken"),
    storage.remove("refreshToken"),
    storage.remove("user"),
    storage.remove("userProfile"),
  ]);
};

const forceLogoutAndRedirectToLogin = async () => {
  if (isForceLogoutInProgress) {
    return;
  }

  isForceLogoutInProgress = true;

  try {
    await clearStoredAuth();
    useAuthStore.getState().logout();
    router.replace("/(auth)/login" as any);
  } finally {
    isForceLogoutInProgress = false;
  }
};

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshRequest) {
    return refreshRequest;
  }

  refreshRequest = (async () => {
    const refreshToken = await storage.get("refreshToken");

    if (!refreshToken) {
      await clearStoredAuth();
      return null;
    }

    try {
      const response = await axios.post<{ access?: string }>(
        `${Config.API_BASE_URL}${Endpoints.TOKEN_REFRESH}`,
        { refresh: refreshToken },
        {
          timeout: Config.API_TIMEOUT,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const nextAccessToken = response.data?.access?.trim();

      if (!nextAccessToken) {
        await clearStoredAuth();
        return null;
      }

      await storage.set("authToken", nextAccessToken);
      return nextAccessToken;
    } catch {
      await clearStoredAuth();
      return null;
    } finally {
      refreshRequest = null;
    }
  })();

  return refreshRequest;
};

client.interceptors.request.use(async (config) => {
  const token = await storage.get("authToken");
  const requestUrl = String(config.url || "");
  const shouldSkipAuth = requestUrl.includes(Endpoints.PRODUCTS_BEST_SELLING);

  if (token && !shouldSkipAuth) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const isFormData =
    typeof FormData !== "undefined" && config.data instanceof FormData;

  if (isFormData) {
    delete config.headers["Content-Type"];
  } else if (!config.headers["Content-Type"]) {
    config.headers["Content-Type"] = "application/json";
  }

  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = (err.config ?? {}) as RetryableRequestConfig;
    const statusCode = err.response?.status;
    const responseData = err.response?.data;
    const requestUrl = String(originalRequest.url || "");
    const isRefreshRequest = requestUrl.includes(Endpoints.TOKEN_REFRESH);
    const isLoginRequest = requestUrl.includes(Endpoints.LOGIN);
    const isBestSellingRequest = requestUrl.includes(
      Endpoints.PRODUCTS_BEST_SELLING,
    );
    const isTokenNotValid =
      statusCode === 401 && isTokenNotValidResponse(responseData);

    if (statusCode === 429) {
      showGlobalRateLimitToast();
    }

    if (isTokenNotValid) {
      await forceLogoutAndRedirectToLogin();
      return Promise.reject(err);
    }

    if (
      statusCode === 401 &&
      !originalRequest._retry &&
      !isRefreshRequest &&
      !isLoginRequest &&
      !isBestSellingRequest
    ) {
      originalRequest._retry = true;

      const nextAccessToken = await refreshAccessToken();

      if (nextAccessToken) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        return client(originalRequest);
      }
    }

    if (statusCode === 401) {
      await clearStoredAuth();
      useAuthStore.getState().logout();
    }

    return Promise.reject(err);
  },
);

export default client;
