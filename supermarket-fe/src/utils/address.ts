import type { Address } from "../types";

export const formatAddressShort = (address: Address | null): string => {
  if (!address) {
    return "Them dia chi giao hang";
  }

  const parts = [address.street, address.district, address.province].filter(Boolean);

  if (parts.length === 0) {
    return "Them dia chi giao hang";
  }

  if (address.street) {
    return parts.join(", ");
  }

  return [address.district, address.province].filter(Boolean).join(", ");
};

export const formatAddressFull = (address: Address | null): string => {
  if (!address) {
    return "";
  }

  return [address.street, address.district, address.province].filter(Boolean).join(", ");
};

export const getDefaultAddress = (addresses: Address[]): Address | null =>
  addresses.find((address) => address.is_default) || addresses[0] || null;

export const getSelectedOrDefaultAddress = (
  addresses: Address[],
  selectedDeliveryAddressId: number | null,
): Address | null => {
  if (selectedDeliveryAddressId) {
    const selectedAddress = addresses.find(
      (address) => address.id === selectedDeliveryAddressId,
    );

    if (selectedAddress) {
      return selectedAddress;
    }
  }

  return getDefaultAddress(addresses);
};
