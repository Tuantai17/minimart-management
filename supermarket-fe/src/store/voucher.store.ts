import { create } from "zustand";
import { getApiErrorMessage } from "../services/api/api-error";
import { voucherService } from "../services/voucher.service";
import type {
    AppliedVoucherPreview,
    ClaimVoucherResponse,
    MyVoucherQuery,
    PaginatedMyVoucherResponse,
    PaginatedVoucherCatalogResponse,
    UserVoucher,
    VoucherCatalogItem,
    VoucherCatalogQuery,
} from "../types";

interface VoucherState {
  catalog: VoucherCatalogItem[];
  myVouchers: UserVoucher[];
  checkoutVouchers: UserVoucher[];
  appliedVoucherPreview: AppliedVoucherPreview | null;
  isLoadingCatalog: boolean;
  isClaimingVoucher: boolean;
  isLoadingMyVouchers: boolean;
  isApplyingVoucher: boolean;
  voucherError: string | null;
  lastClaimResponse: ClaimVoucherResponse | null;
  catalogPagination: {
    count: number;
    next: string | null;
    previous: string | null;
  };
  myVoucherPagination: {
    count: number;
    next: string | null;
    previous: string | null;
  };
  fetchVoucherCatalog: (
    query?: VoucherCatalogQuery,
  ) => Promise<PaginatedVoucherCatalogResponse>;
  claimVoucher: (voucherId: number) => Promise<ClaimVoucherResponse>;
  fetchMyVouchers: (
    query?: MyVoucherQuery,
  ) => Promise<PaginatedMyVoucherResponse>;
  fetchCheckoutVouchers: () => Promise<PaginatedMyVoucherResponse>;
  applyVoucherByCode: (code: string) => Promise<AppliedVoucherPreview>;
  applyVoucherByUserVoucherId: (
    userVoucherId: number,
  ) => Promise<AppliedVoucherPreview>;
  clearAppliedVoucherPreview: () => void;
  clearVoucherError: () => void;
}

const getErrorMessage = (error: unknown) =>
  getApiErrorMessage(error, "Không thể xử lý voucher lúc này.");

export const useVoucherStore = create<VoucherState>((set) => ({
  catalog: [],
  myVouchers: [],
  checkoutVouchers: [],
  appliedVoucherPreview: null,
  isLoadingCatalog: false,
  isClaimingVoucher: false,
  isLoadingMyVouchers: false,
  isApplyingVoucher: false,
  voucherError: null,
  lastClaimResponse: null,
  catalogPagination: {
    count: 0,
    next: null,
    previous: null,
  },
  myVoucherPagination: {
    count: 0,
    next: null,
    previous: null,
  },

  fetchVoucherCatalog: async (query = {}) => {
    set({ isLoadingCatalog: true, voucherError: null });

    try {
      const response = await voucherService.getVoucherCatalog(query);

      set({
        catalog: response.results,
        catalogPagination: {
          count: response.count,
          next: response.next,
          previous: response.previous,
        },
        isLoadingCatalog: false,
      });

      return response;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ isLoadingCatalog: false, voucherError: message });
      throw error;
    }
  },

  claimVoucher: async (voucherId) => {
    set({ isClaimingVoucher: true, voucherError: null });

    try {
      const response = await voucherService.claimVoucher({
        voucher_id: voucherId,
      });

      set((state) => ({
        isClaimingVoucher: false,
        lastClaimResponse: response,
        catalog: state.catalog.map((voucher) =>
          voucher.id === voucherId
            ? {
                ...voucher,
                claim_status: "claimed",
                is_claimed: true,
                is_claimable: false,
              }
            : voucher,
        ),
        myVouchers: [response.user_voucher, ...state.myVouchers],
      }));

      return response;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ isClaimingVoucher: false, voucherError: message });
      throw error;
    }
  },

  fetchMyVouchers: async (query = {}) => {
    set({ isLoadingMyVouchers: true, voucherError: null });

    try {
      const response = await voucherService.getMyVouchers(query);

      set({
        myVouchers: response.results,
        myVoucherPagination: {
          count: response.count,
          next: response.next,
          previous: response.previous,
        },
        isLoadingMyVouchers: false,
      });

      return response;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ isLoadingMyVouchers: false, voucherError: message });
      throw error;
    }
  },

  fetchCheckoutVouchers: async () => {
    set({ isLoadingMyVouchers: true, voucherError: null });

    try {
      const response = await voucherService.getMyVouchers({
        status: "active",
        available_for_checkout: true,
      });

      set({
        checkoutVouchers: response.results,
        isLoadingMyVouchers: false,
      });

      return response;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ isLoadingMyVouchers: false, voucherError: message });
      throw error;
    }
  },

  applyVoucherByCode: async (code) => {
    set({ isApplyingVoucher: true, voucherError: null });

    try {
      const response = await voucherService.applyVoucher({ code });
      set({
        appliedVoucherPreview: response,
        isApplyingVoucher: false,
      });
      return response;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ isApplyingVoucher: false, voucherError: message });
      throw error;
    }
  },

  applyVoucherByUserVoucherId: async (userVoucherId) => {
    set({ isApplyingVoucher: true, voucherError: null });

    try {
      const response = await voucherService.applyVoucher({
        user_voucher_id: userVoucherId,
      });
      set({
        appliedVoucherPreview: response,
        isApplyingVoucher: false,
      });
      return response;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ isApplyingVoucher: false, voucherError: message });
      throw error;
    }
  },

  clearAppliedVoucherPreview: () => set({ appliedVoucherPreview: null }),
  clearVoucherError: () => set({ voucherError: null }),
}));
