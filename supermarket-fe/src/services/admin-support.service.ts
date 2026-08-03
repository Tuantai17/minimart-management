import { Config } from "../constants";
import client from "./api/client";
import type { SupportMessage } from "./support.service";

export type SupportTicket = {
  id: number;
  user: number;
  user_email?: string;
  user_name?: string;
  customer_name?: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
  last_message_time?: string;
  last_message?: string;
  message?: string;
  last_sender?: IdentityRecord;
  avatar?: string | null;
  avatar_url?: string | null;
  user_avatar?: string | null;
  customer_avatar?: string | null;
  profile_picture?: string | null;
  role?: "customer" | "staff" | "admin" | string;
  is_staff?: boolean;
  is_superuser?: boolean;
  user_info?: IdentityRecord | null;
  user_detail?: IdentityRecord | null;
  owner?: IdentityRecord | null;
  customer?: IdentityRecord | null;
};

type ApiRecord = Record<string, any>;
type IdentityRecord = {
  id?: number | string;
  name?: string;
  username?: string;
  email?: string;
  avatar?: string | null;
  avatar_url?: string | null;
  profile_picture?: string | null;
  role?: "customer" | "staff" | "admin" | string;
  is_staff?: boolean;
  is_superuser?: boolean;
} | null;

const IDENTITY_NAME_KEYS = [
  "user_name",
  "sender_name",
  "customer_name",
  "full_name",
  "display_name",
  "name",
  "username",
  "email",
  "user_email",
] as const;

const IDENTITY_AVATAR_KEYS = [
  "avatar_url",
  "avatar",
  "user_avatar",
  "customer_avatar",
  "profile_picture",
  "profile_image",
  "profile_photo",
  "photo_url",
  "photo",
  "sender_avatar",
  "sender_avatar_url",
] as const;

const TICKET_OWNER_CONTAINER_KEYS = [
  "owner",
  "user",
  "customer",
  "user_info",
  "user_detail",
  "profile",
  "profile_data",
  "user_profile",
  "customer_profile",
  "account",
] as const;

const LAST_SENDER_CONTAINER_KEYS = [
  "last_sender",
  "sender",
  "author",
  "account",
  "profile",
] as const;

const MESSAGE_SENDER_CONTAINER_KEYS = [
  "sender",
  "user",
  "customer",
  "user_info",
  "user_detail",
  "sender_profile",
  "customer_profile",
  "profile",
  "profile_data",
  "account",
  "author",
  "owner",
] as const;

const isRecord = (value: unknown): value is ApiRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const pickFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const toAbsoluteMediaUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmedValue = value.trim();

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return trimmedValue.startsWith("/")
    ? `${Config.API_ORIGIN}${trimmedValue}`
    : `${Config.API_ORIGIN}/${trimmedValue}`;
};

const collectCandidateRecords = (
  payload: unknown,
  containerKeys: readonly string[],
  depth = 0,
  visited = new Set<ApiRecord>(),
): ApiRecord[] => {
  if (depth > 4 || !isRecord(payload) || visited.has(payload)) {
    return [];
  }

  visited.add(payload);

  const candidates: ApiRecord[] = [payload];

  for (const key of containerKeys) {
    const nestedValue = payload[key];
    if (isRecord(nestedValue)) {
      candidates.push(
        ...collectCandidateRecords(nestedValue, containerKeys, depth + 1, visited),
      );
    }
  }

  return candidates;
};

const extractIdentity = (
  payload: unknown,
  containerKeys: readonly string[],
  nameKeys: readonly string[] = IDENTITY_NAME_KEYS,
  avatarKeys: readonly string[] = IDENTITY_AVATAR_KEYS,
) => {
  const record = isRecord(payload) ? payload : {};
  const candidates = collectCandidateRecords(record, containerKeys);

  const name = pickFirstString(
    ...candidates.flatMap((candidate) => nameKeys.map((key) => candidate[key])),
  );

  const avatarUrl = toAbsoluteMediaUrl(
    pickFirstString(
      ...candidates.flatMap((candidate) => avatarKeys.map((key) => candidate[key])),
    ),
  );

  return {
    name,
    avatarUrl,
  };
};

const extractTicketOwnerIdentity = (ticket: SupportTicket) =>
  extractIdentity(ticket, TICKET_OWNER_CONTAINER_KEYS);

const extractLastSenderIdentity = (ticket: SupportTicket) =>
  extractIdentity(ticket.last_sender || ticket, LAST_SENDER_CONTAINER_KEYS);

const extractMessageSenderIdentity = (message: SupportMessage) =>
  extractIdentity(message, MESSAGE_SENDER_CONTAINER_KEYS);

const normalizeRole = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isCustomerRecord = (record: ApiRecord): boolean =>
  normalizeRole(record.role) === "customer";

const isSupportOperatorRecord = (record: ApiRecord): boolean => {
  const role = normalizeRole(record.role);
  if (role === "staff" || role === "admin") {
    return true;
  }

  return Boolean(record.is_staff) || Boolean(record.is_superuser);
};

const shouldKeepCustomerTicket = (ticket: SupportTicket): boolean => {
  const rawTicket = ticket as ApiRecord;

  return (
    typeof ticket.id !== "undefined" ||
    typeof rawTicket.ticket_id !== "undefined" ||
    typeof rawTicket.ticket !== "undefined"
  );
};

const normalizeTicket = (ticket: SupportTicket): SupportTicket => {
  const ownerIdentity = extractTicketOwnerIdentity(ticket);
  const lastSenderIdentity = extractLastSenderIdentity(ticket);
  const lastMessagePreview = pickFirstString(
    ticket.last_message_preview,
    ticket.last_message,
    ticket.message,
    (ticket as ApiRecord).last_message_text,
    (ticket as ApiRecord).last_preview,
    (ticket as ApiRecord).preview,
    (ticket as ApiRecord).latest_message,
    isRecord((ticket as ApiRecord).last_message_data)
      ? (ticket as ApiRecord).last_message_data.message
      : null,
    isRecord((ticket as ApiRecord).last_message_data)
      ? (ticket as ApiRecord).last_message_data.content
      : null,
    isRecord((ticket as ApiRecord).latest_message_data)
      ? (ticket as ApiRecord).latest_message_data.message
      : null,
    isRecord((ticket as ApiRecord).latest_message_data)
      ? (ticket as ApiRecord).latest_message_data.content
      : null,
  );
  const lastMessageTime = pickFirstString(
    ticket.last_message_time,
    (ticket as ApiRecord).last_message_at,
    (ticket as ApiRecord).latest_message_time,
    isRecord((ticket as ApiRecord).last_message_data)
      ? (ticket as ApiRecord).last_message_data.created_at
      : null,
    isRecord((ticket as ApiRecord).latest_message_data)
      ? (ticket as ApiRecord).latest_message_data.created_at
      : null,
    ticket.updated_at,
    ticket.created_at,
  );

  return {
    ...ticket,
    user_name:
      ownerIdentity.name ||
      pickFirstString(
        ticket.user_name,
        ticket.customer_name,
        ticket.user_info?.name,
        ticket.user_info?.username,
        ticket.user_detail?.name,
        ticket.user_detail?.username,
        ticket.owner?.name,
        ticket.owner?.username,
        ticket.owner?.email,
        ticket.user_email,
      ) ||
      `Khach hang #${ticket.user || ticket.id || "?"}`,
    last_message_preview: lastMessagePreview || undefined,
    last_message_time: lastMessageTime || undefined,
    last_sender: ticket.last_sender
      ? {
          ...ticket.last_sender,
          name:
            lastSenderIdentity.name ||
            ticket.last_sender.name ||
            ticket.last_sender.username ||
            ticket.last_sender.email,
          avatar_url:
            lastSenderIdentity.avatarUrl ||
            ticket.last_sender.avatar_url ||
            ticket.last_sender.avatar ||
            ticket.last_sender.profile_picture ||
            null,
          avatar:
            lastSenderIdentity.avatarUrl ||
            ticket.last_sender.avatar ||
            ticket.last_sender.avatar_url ||
            ticket.last_sender.profile_picture ||
            null,
        }
      : ticket.last_sender,
    avatar_url: ownerIdentity.avatarUrl,
    avatar: ownerIdentity.avatarUrl,
    user_avatar: ownerIdentity.avatarUrl,
    customer_avatar: ownerIdentity.avatarUrl,
  };
};

const normalizeMessage = (message: SupportMessage): SupportMessage => {
  const identity = extractMessageSenderIdentity(message);

  return {
    ...message,
    sender_name: identity.name || message.sender_name,
    avatar_url: identity.avatarUrl,
    avatar: identity.avatarUrl,
    sender_avatar: identity.avatarUrl,
    sender_avatar_url: identity.avatarUrl,
    user_avatar: identity.avatarUrl,
  };
};

const normalizeTicketList = (items: unknown[]): SupportTicket[] =>
  items
    .filter((item): item is SupportTicket => isRecord(item))
    .map((item) => normalizeTicket(item));

const normalizeMessageList = (items: unknown[]): SupportMessage[] =>
  items
    .filter((item): item is SupportMessage => isRecord(item))
    .map((item) => normalizeMessage(item));

const describePayloadShape = (payload: unknown): string => {
  if (Array.isArray(payload)) {
    return `array(length=${payload.length})`;
  }

  if (!isRecord(payload)) {
    return typeof payload;
  }

  const rootKeys = Object.keys(payload);
  const nestedSummary = ["data", "result", "payload"]
    .filter((key) => isRecord(payload[key]))
    .map((key) => `${key}=[${Object.keys(payload[key]).join(",")}]`);

  return `object(keys=[${rootKeys.join(",")}], nested=${nestedSummary.join(" | ") || "none"})`;
};

const extractCollection = <T>(
  payload: unknown,
  normalizeList: (items: unknown[]) => T[],
  rootArrayKeys: readonly string[],
  nestedPrefixes: readonly string[] = ["data", "result", "payload"],
): { items: T[]; source: string } => {
  if (Array.isArray(payload)) {
    return {
      items: normalizeList(payload),
      source: "root",
    };
  }

  if (!isRecord(payload)) {
    return { items: [], source: "unknown" };
  }

  for (const key of rootArrayKeys) {
    if (Array.isArray(payload[key])) {
      return {
        items: normalizeList(payload[key]),
        source: key,
      };
    }
  }

  for (const prefix of nestedPrefixes) {
    const nested = payload[prefix];
    if (!isRecord(nested)) {
      continue;
    }

    for (const key of rootArrayKeys) {
      if (Array.isArray(nested[key])) {
        return {
          items: normalizeList(nested[key]),
          source: `${prefix}.${key}`,
        };
      }
    }
  }

  return { items: [], source: "unknown" };
};

const extractSingleMessage = (payload: unknown): SupportMessage => {
  if (isRecord(payload) && typeof payload.id !== "undefined") {
    return normalizeMessage(payload as SupportMessage);
  }

  const nestedCandidates = isRecord(payload)
    ? [payload.message, payload.data, payload.result, payload.payload]
    : [];

  for (const candidate of nestedCandidates) {
    if (isRecord(candidate) && typeof candidate.id !== "undefined") {
      return normalizeMessage(candidate as SupportMessage);
    }

    if (
      isRecord(candidate) &&
      isRecord(candidate.message) &&
      typeof candidate.message.id !== "undefined"
    ) {
      return normalizeMessage(candidate.message as SupportMessage);
    }
  }

  throw new Error("[adminSupportService] Invalid reply payload");
};

export const adminSupportService = {
  getTickets: async (): Promise<SupportTicket[]> => {
    const response = await client.get("/admin-support/");
    const { items, source } = extractCollection(
      response.data,
      normalizeTicketList,
      ["results", "items", "tickets", "data", "result", "payload"],
    );

    if (items.length === 0 && source === "unknown" && response.data != null) {
      console.warn(
        "[adminSupportService] Unrecognized tickets payload shape:",
        describePayloadShape(response.data),
      );
    }

    return items.filter((item) => shouldKeepCustomerTicket(item));
  },

  getHistory: async (ticketId: number | string): Promise<SupportMessage[]> => {
    const response = await client.get(`/admin-support/${ticketId}/history/`);
    const { items, source } = extractCollection(
      response.data,
      normalizeMessageList,
      ["messages", "results", "items", "history", "data", "result", "payload"],
    );

    if (items.length === 0 && source === "unknown" && response.data != null) {
      console.warn(
        "[adminSupportService] Unrecognized history payload shape:",
        describePayloadShape(response.data),
      );
    }

    return items;
  },

  replyMessage: async (
    ticketId: number | string,
    message: string,
  ): Promise<SupportMessage> => {
    const response = await client.post(`/admin-support/${ticketId}/reply/`, {
      message,
    });
    return extractSingleMessage(response.data);
  },
};
