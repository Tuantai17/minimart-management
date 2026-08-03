import { create } from "zustand";
import { addressService } from "../services/address.service";
import type { Address, CreateAddressPayload, UpdateAddressPayload } from "../types";
import { storage, getDefaultAddress, getSelectedOrDefaultAddress } from "../utils";
import { useAuthStore } from "./auth.store";

interface AddressStore {
  addresses: Address[];
  selectedDeliveryAddressId: number | null;
  isLoadingAddresses: boolean;
  isCreatingAddress: boolean;
  isUpdatingAddress: boolean;
  isDeletingAddress: boolean;
  deletingAddressId: number | null;
  defaultingAddressId: number | null;
  addressError: string | null;
  fetchAddresses: () => Promise<Address[]>;
  createAddressAction: (payload: CreateAddressPayload) => Promise<Address>;
  updateAddressAction: (id: number, payload: UpdateAddressPayload) => Promise<Address>;
  deleteAddressAction: (id: number) => Promise<void>;
  setDefaultAddressAction: (id: number) => Promise<void>;
  setSelectedDeliveryAddress: (id: number | null) => Promise<void>;
  getDefaultAddress: () => Address | null;
  getSelectedOrDefaultAddress: () => Address | null;
  clearSelectedDeliveryAddressIfInvalid: () => Promise<void>;
  clearAddresses: () => void;
}

const DELIVERY_ADDRESS_STORAGE_KEY = "selectedDeliveryAddressId";

const getStatusCode = (error: unknown): number | undefined => {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const rawStatusCode = (error as { statusCode?: unknown }).statusCode;

    if (typeof rawStatusCode === "number") {
      return rawStatusCode;
    }
  }

  return undefined;
};

const handleUnauthorized = (error: unknown) => {
  if (getStatusCode(error) === 401) {
    useAuthStore.getState().logout();
  }
};

const persistSelectedDeliveryAddressId = async (id: number | null) => {
  if (typeof id === "number") {
    await storage.set(DELIVERY_ADDRESS_STORAGE_KEY, String(id));
    return;
  }

  await storage.remove(DELIVERY_ADDRESS_STORAGE_KEY);
};

const loadStoredSelectedDeliveryAddressId = async (): Promise<number | null> => {
  const rawValue = await storage.get(DELIVERY_ADDRESS_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const resolveSelectedDeliveryAddressId = (
  addresses: Address[],
  selectedDeliveryAddressId: number | null,
): number | null => {
  if (!selectedDeliveryAddressId) {
    return null;
  }

  const exists = addresses.some((address) => address.id === selectedDeliveryAddressId);
  return exists ? selectedDeliveryAddressId : null;
};

export const useAddressStore = create<AddressStore>((set, get) => ({
  addresses: [],
  selectedDeliveryAddressId: null,
  isLoadingAddresses: false,
  isCreatingAddress: false,
  isUpdatingAddress: false,
  isDeletingAddress: false,
  deletingAddressId: null,
  defaultingAddressId: null,
  addressError: null,

  fetchAddresses: async () => {
    set({
      isLoadingAddresses: true,
      addressError: null,
    });

    try {
      const addresses = await addressService.getAddresses();
      const currentSelectedDeliveryAddressId = get().selectedDeliveryAddressId;
      const storedSelectedDeliveryAddressId =
        currentSelectedDeliveryAddressId ?? (await loadStoredSelectedDeliveryAddressId());
      const nextSelectedDeliveryAddressId = resolveSelectedDeliveryAddressId(
        addresses,
        storedSelectedDeliveryAddressId,
      );

      await persistSelectedDeliveryAddressId(nextSelectedDeliveryAddressId);

      set({
        addresses,
        selectedDeliveryAddressId: nextSelectedDeliveryAddressId,
        isLoadingAddresses: false,
        addressError: null,
      });

      return addresses;
    } catch (error) {
      handleUnauthorized(error);

      const message =
        error instanceof Error ? error.message : "Khong the tai danh sach dia chi.";

      if (getStatusCode(error) === 401) {
        set({
          addresses: [],
          selectedDeliveryAddressId: null,
          isLoadingAddresses: false,
          addressError: message,
        });
        throw error;
      }

      set({
        isLoadingAddresses: false,
        addressError: message,
      });

      throw error;
    }
  },

  createAddressAction: async (payload) => {
    set({
      isCreatingAddress: true,
      addressError: null,
    });

    try {
      const createdAddress = await addressService.createAddress(payload);
      await get().fetchAddresses();

      set({
        isCreatingAddress: false,
        addressError: null,
      });

      return createdAddress;
    } catch (error) {
      handleUnauthorized(error);

      const message =
        error instanceof Error ? error.message : "Khong the tao dia chi moi.";

      if (getStatusCode(error) === 401) {
        set({
          addresses: [],
          selectedDeliveryAddressId: null,
          isCreatingAddress: false,
          addressError: message,
        });
        throw error;
      }

      set({
        isCreatingAddress: false,
        addressError: message,
      });

      throw error;
    }
  },

  updateAddressAction: async (id, payload) => {
    set({
      isUpdatingAddress: true,
      addressError: null,
    });

    try {
      const updatedAddress = await addressService.updateAddress(id, payload);
      await get().fetchAddresses();

      set({
        isUpdatingAddress: false,
        addressError: null,
      });

      return updatedAddress;
    } catch (error) {
      handleUnauthorized(error);

      const message =
        error instanceof Error ? error.message : "Khong the cap nhat dia chi.";

      if (getStatusCode(error) === 401) {
        set({
          addresses: [],
          selectedDeliveryAddressId: null,
          isUpdatingAddress: false,
          addressError: message,
        });
        throw error;
      }

      set({
        isUpdatingAddress: false,
        addressError: message,
      });

      throw error;
    }
  },

  deleteAddressAction: async (id) => {
    set({
      isDeletingAddress: true,
      deletingAddressId: id,
      addressError: null,
    });

    try {
      await addressService.deleteAddress(id);
      await get().fetchAddresses();

      set({
        isDeletingAddress: false,
        deletingAddressId: null,
        addressError: null,
      });
    } catch (error) {
      handleUnauthorized(error);

      const message =
        error instanceof Error ? error.message : "Khong the xoa dia chi.";

      if (getStatusCode(error) === 401) {
        set({
          addresses: [],
          selectedDeliveryAddressId: null,
          isDeletingAddress: false,
          deletingAddressId: null,
          addressError: message,
        });
        throw error;
      }

      set({
        isDeletingAddress: false,
        deletingAddressId: null,
        addressError: message,
      });

      throw error;
    }
  },

  setDefaultAddressAction: async (id) => {
    set({
      defaultingAddressId: id,
      addressError: null,
    });

    try {
      await addressService.setDefaultAddress(id);
      await get().fetchAddresses();

      set({
        defaultingAddressId: null,
        addressError: null,
      });
    } catch (error) {
      handleUnauthorized(error);

      const message =
        error instanceof Error ? error.message : "Khong the dat dia chi mac dinh.";

      if (getStatusCode(error) === 401) {
        set({
          addresses: [],
          selectedDeliveryAddressId: null,
          defaultingAddressId: null,
          addressError: message,
        });
        throw error;
      }

      set({
        defaultingAddressId: null,
        addressError: message,
      });

      throw error;
    }
  },

  setSelectedDeliveryAddress: async (id) => {
    const addresses = get().addresses;
    const nextSelectedDeliveryAddressId = resolveSelectedDeliveryAddressId(addresses, id);

    await persistSelectedDeliveryAddressId(nextSelectedDeliveryAddressId);

    set({
      selectedDeliveryAddressId: nextSelectedDeliveryAddressId,
    });
  },

  getDefaultAddress: () => {
    return getDefaultAddress(get().addresses);
  },

  getSelectedOrDefaultAddress: () => {
    const state = get();
    return getSelectedOrDefaultAddress(
      state.addresses,
      state.selectedDeliveryAddressId,
    );
  },

  clearSelectedDeliveryAddressIfInvalid: async () => {
    const state = get();
    const nextSelectedDeliveryAddressId = resolveSelectedDeliveryAddressId(
      state.addresses,
      state.selectedDeliveryAddressId,
    );

    if (nextSelectedDeliveryAddressId === state.selectedDeliveryAddressId) {
      return;
    }

    await persistSelectedDeliveryAddressId(nextSelectedDeliveryAddressId);
    set({
      selectedDeliveryAddressId: nextSelectedDeliveryAddressId,
    });
  },

  clearAddresses: () => {
    void persistSelectedDeliveryAddressId(null);
    set({
      addresses: [],
      selectedDeliveryAddressId: null,
      isLoadingAddresses: false,
      isCreatingAddress: false,
      isUpdatingAddress: false,
      isDeletingAddress: false,
      deletingAddressId: null,
      defaultingAddressId: null,
      addressError: null,
    });
  },
}));
