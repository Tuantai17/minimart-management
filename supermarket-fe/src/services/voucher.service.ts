import type {
    AppliedVoucherPreview,
    ApplyVoucherPayload,
    ClaimVoucherPayload,
    ClaimVoucherResponse,
    MyVoucherQuery,
    PaginatedMyVoucherResponse,
    PaginatedVoucherCatalogResponse,
    VoucherCatalogQuery,
} from "../types";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

const buildQueryString = <T extends object>(params: T) => {
  const searchParams = new URLSearchParams();

  Object.entries(
    params as Record<string, string | number | boolean | null | undefined>,
  ).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.append(key, String(value));
  });

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const voucherService = {
  getVoucherCatalog: async (
    query: VoucherCatalogQuery = {},
  ): Promise<PaginatedVoucherCatalogResponse> => {
    const response = await client.get<PaginatedVoucherCatalogResponse>(
      `${Endpoints.VOUCHERS}${buildQueryString(query)}`,
    );

    return response.data;
  },

  claimVoucher: async (
    payload: ClaimVoucherPayload,
  ): Promise<ClaimVoucherResponse> => {
    const response = await client.post<ClaimVoucherResponse>(
      Endpoints.VOUCHER_CLAIM(payload.voucher_id),
      payload,
    );

    return response.data;
  },

  getMyVouchers: async (
    query: MyVoucherQuery = {},
  ): Promise<PaginatedMyVoucherResponse> => {
    const response = await client.get<PaginatedMyVoucherResponse>(
      `${Endpoints.MY_VOUCHERS}${buildQueryString(query)}`,
    );

    return response.data;
  },

  applyVoucher: async (
    payload: ApplyVoucherPayload,
  ): Promise<AppliedVoucherPreview> => {
    const response = await client.post<AppliedVoucherPreview>(
      Endpoints.VOUCHER_APPLY,
      payload,
    );

    return response.data;
  },
};
