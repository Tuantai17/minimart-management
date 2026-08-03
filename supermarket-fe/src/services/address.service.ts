import type {
  Address,
  CreateAddressPayload,
  UpdateAddressPayload,
} from "../types";
import { toApiError } from "./api/api-error";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

interface PaginatedResponse<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
}

type ApiRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ApiRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isPaginatedResponse = <T>(value: unknown): value is PaginatedResponse<T> =>
  isRecord(value) && Array.isArray(value.results);

const firstNonEmptyString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const normalizeAddress = (data: unknown): Address => {
  const record = isRecord(data) ? data : {};
  const lat =
    typeof record.lat === "number"
      ? record.lat
      : record.lat != null
        ? Number(record.lat)
        : null;
  const lng =
    typeof record.lng === "number"
      ? record.lng
      : record.lng != null
        ? Number(record.lng)
        : null;

  return {
    id:
      typeof record.id === "number"
        ? record.id
        : Number(record.id) || 0,
    full_name: firstNonEmptyString(record.full_name),
    phone: firstNonEmptyString(record.phone),
    province: firstNonEmptyString(record.province),
    district: firstNonEmptyString(record.district),
    street: firstNonEmptyString(record.street),
    note: firstNonEmptyString(record.note),
    is_default: Boolean(record.is_default),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    created_at: firstNonEmptyString(record.created_at),
  };
};

const normalizeAddressResponse = (data: unknown): Address[] => {
  const items = Array.isArray(data)
    ? data
    : isPaginatedResponse<unknown>(data)
      ? data.results || []
      : [];

  return items.map(normalizeAddress);
};

const sortAddresses = (addresses: Address[]): Address[] => {
  return [...addresses].sort((leftAddress, rightAddress) => {
    if (leftAddress.is_default !== rightAddress.is_default) {
      return Number(rightAddress.is_default) - Number(leftAddress.is_default);
    }

    const leftTime = leftAddress.created_at ? Date.parse(leftAddress.created_at) : 0;
    const rightTime = rightAddress.created_at ? Date.parse(rightAddress.created_at) : 0;

    return rightTime - leftTime;
  });
};

const buildAddressPayload = (
  payload: CreateAddressPayload | UpdateAddressPayload,
): Record<string, unknown> => {
  const nextPayload: Record<string, unknown> = {};

  if (typeof payload.full_name === "string") {
    nextPayload.full_name = payload.full_name.trim();
  }

  if (typeof payload.phone === "string") {
    nextPayload.phone = payload.phone.trim();
  }

  if (typeof payload.province === "string") {
    nextPayload.province = payload.province.trim();
  }

  if (typeof payload.district === "string") {
    nextPayload.district = payload.district.trim();
  }

  if (typeof payload.street === "string") {
    nextPayload.street = payload.street.trim();
  }

  if (typeof payload.note === "string") {
    nextPayload.note = payload.note.trim();
  }

  if (typeof payload.is_default === "boolean") {
    nextPayload.is_default = payload.is_default;
  }

  if (typeof payload.lat === "number" && Number.isFinite(payload.lat)) {
    // Workaround: BE DecimalField(max_digits=9) — làm tròn 4 decimal
    // để tổng digit không vượt 9 (VN: lat ~10.xxxx = 6 digits, lng ~106.xxxx = 7 digits)
    nextPayload.lat = Math.round(payload.lat * 10000) / 10000;
  }

  if (payload.lat === null) {
    nextPayload.lat = null;
  }

  if (typeof payload.lng === "number" && Number.isFinite(payload.lng)) {
    nextPayload.lng = Math.round(payload.lng * 10000) / 10000;
  }

  if (payload.lng === null) {
    nextPayload.lng = null;
  }

  return nextPayload;
};

export const addressService = {
  getAddresses: async (): Promise<Address[]> => {
    try {
      const response = await client.get(Endpoints.ADDRESSES);
      return sortAddresses(normalizeAddressResponse(response.data));
    } catch (error) {
      throw toApiError(error, "Không thể tải danh sách địa chỉ.");
    }
  },

  createAddress: async (payload: CreateAddressPayload): Promise<Address> => {
    try {
      const response = await client.post(
        Endpoints.ADDRESSES,
        buildAddressPayload(payload),
      );
      return normalizeAddress(response.data);
    } catch (error) {
      throw toApiError(error, "Không thể tạo địa chỉ mới.");
    }
  },

  updateAddress: async (
    id: number,
    payload: UpdateAddressPayload,
  ): Promise<Address> => {
    try {
      const response = await client.patch(
        Endpoints.ADDRESS_DETAIL(id),
        buildAddressPayload(payload),
      );
      return normalizeAddress(response.data);
    } catch (error) {
      throw toApiError(error, "Không thể cập nhật địa chỉ.");
    }
  },

  deleteAddress: async (id: number): Promise<void> => {
    try {
      console.log(`Bắt đầu xóa địa chỉ với ID: ${id}`);
      const res = await client.delete(Endpoints.ADDRESS_DETAIL(id));
      console.log(`Xóa thành công, response status:`, res?.status);
    } catch (error) {
      console.error(`Lỗi khi xóa địa chỉ ID ${id}:`, error);
      throw toApiError(error, "Không thể xóa địa chỉ.");
    }
  },

  setDefaultAddress: async (id: number): Promise<string> => {
    try {
      const response = await client.post(Endpoints.ADDRESS_SET_DEFAULT(id), {});

      if (isRecord(response.data) && typeof response.data.message === "string") {
        return response.data.message;
      }

      return "Đặt địa chỉ mặc định thành công.";
    } catch (error) {
      throw toApiError(error, "Không thể đặt địa chỉ mặc định.");
    }
  },

  normalizeAddressResponse,
  sortAddresses,
};
