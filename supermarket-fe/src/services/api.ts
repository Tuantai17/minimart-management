import type { AxiosError } from "axios";
import { Config } from "../constants";
import type { AuthResponse } from "../types";
import { ApiError, getApiErrorMessage } from "./api/api-error";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

type RegisterPayload = {
  full_name: string;
  phone: string;
  email: string;
  password: string;
  confirm_password: string;
};

type BackendValidationErrors = Record<string, string | string[]>;

const throwNormalizedApiError = (
  error: unknown,
  fallbackMessage: string,
): never => {
  const axiosError = error as AxiosError<BackendValidationErrors>;
  const responseData = axiosError.response?.data;

  if (responseData && typeof responseData === "object") {
    throw responseData;
  }

  throw new ApiError(getApiErrorMessage(error, fallbackMessage));
};

export const registerUser = async (userData: RegisterPayload) => {
  try {
    const response = await client.post(Endpoints.REGISTER, userData, {
      baseURL: Config.API_BASE_URL,
    });
    return response.data;
  } catch (error: unknown) {
    throwNormalizedApiError(
      error,
      "Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại mạng hoặc IP.",
    );
  }
};

// Hàm đăng nhập - Backend dùng SimpleJWT (TokenObtainPairView)
// Endpoint: /api/token/ | Trả về: { access, refresh, is_staff, is_superuser, is_active }
// Django hiện dùng field "username" để đăng nhập.
export const loginUser = async (
  email: string,
  password: string,
): Promise<AuthResponse> => {
  try {
    const response = await client.post<AuthResponse>(
      Endpoints.LOGIN,
      {
        username: email,
        password,
      },
      {
        baseURL: Config.API_BASE_URL,
      },
    );

    return response.data;
  } catch (error: unknown) {
    throwNormalizedApiError(
      error,
      "Tài khoản của bạn đã bị khóa hoặc sai thông tin. Vui lòng liên hệ Admin!",
    );
  }
};

export default client;
