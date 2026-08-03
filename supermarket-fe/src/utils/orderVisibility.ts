import type { User } from "../types";
import type { OrderResponse } from "../types/order.type";

const toPositiveNumber = (value: unknown): number | null => {
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized > 0) {
    return normalized;
  }

  return null;
};

const normalizeComparableText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const pushOwnerKey = (target: Set<string>, value: unknown) => {
  const numericValue = toPositiveNumber(value);
  if (numericValue) {
    target.add(`id:${numericValue}`);
  }

  const textValue = normalizeComparableText(value);
  if (textValue) {
    target.add(`text:${textValue}`);
  }
};

const collectOwnerKeysFromRecord = (
  target: Set<string>,
  value: OrderResponse["user"] | OrderResponse["customer"],
) => {
  if (value == null) {
    return;
  }

  if (typeof value === "object") {
    pushOwnerKey(target, value.id);
    pushOwnerKey(target, value.user_id);
    pushOwnerKey(target, value.pk);
    if ("email" in value) {
      pushOwnerKey(target, value.email);
    }
    if ("username" in value) {
      pushOwnerKey(target, value.username);
    }
    if ("name" in value) {
      pushOwnerKey(target, value.name);
    }
    return;
  }

  pushOwnerKey(target, value);
};

const getOrderOwnerKeys = (order: OrderResponse): Set<string> => {
  const ownerKeys = new Set<string>();

  collectOwnerKeysFromRecord(ownerKeys, order.user);
  collectOwnerKeysFromRecord(ownerKeys, order.customer);
  pushOwnerKey(ownerKeys, order.user_id);
  pushOwnerKey(ownerKeys, order.customer_id);
  pushOwnerKey(ownerKeys, order.owner_id);

  return ownerKeys;
};

const getCurrentUserKeys = (currentUser: User | null | undefined): Set<string> => {
  const userKeys = new Set<string>();

  if (!currentUser) {
    return userKeys;
  }

  pushOwnerKey(userKeys, currentUser.id);
  pushOwnerKey(userKeys, currentUser.email);
  pushOwnerKey(userKeys, currentUser.username);
  pushOwnerKey(userKeys, currentUser.name);

  return userKeys;
};

export const getOrderOwnerId = (order: OrderResponse): number | null => {
  for (const key of getOrderOwnerKeys(order)) {
    if (key.startsWith("id:")) {
      return Number(key.slice(3));
    }
  }

  return null;
};

export const isOrderOwnedByUser = (
  order: OrderResponse,
  currentUser: User | null | undefined,
): boolean => {
  const ownerKeys = getOrderOwnerKeys(order);
  const currentUserKeys = getCurrentUserKeys(currentUser);

  if (ownerKeys.size === 0 || currentUserKeys.size === 0) {
    return false;
  }

  for (const key of currentUserKeys) {
    if (ownerKeys.has(key)) {
      return true;
    }
  }

  return false;
};

export const isOrderVisibleToCustomer = (order: OrderResponse): boolean => {
  const explicitVisibility =
    order.customer_visible ??
    order.is_visible_to_customer ??
    order.is_visible_for_customer;

  if (typeof explicitVisibility === "boolean") {
    return explicitVisibility;
  }

  return true;
};

export const filterCustomerVisibleOrders = (
  orders: OrderResponse[],
  currentUser: User | null | undefined,
): OrderResponse[] => {
  if (!currentUser) {
    return [];
  }

  return orders.filter(
    (order) =>
      isOrderOwnedByUser(order, currentUser) && isOrderVisibleToCustomer(order),
  );
};
