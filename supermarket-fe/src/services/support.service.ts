import client from "./api/client";
import { Config } from "../constants";
import { Endpoints } from "./api/endpoints";

export interface SupportMessage {
  id: number;
  ticket: number;
  sender_name: string;
  is_admin_reply: boolean;
  message: string;
  is_read: boolean;
  created_at: string;
  avatar?: string | null;
  avatar_url?: string | null;
  sender_avatar?: string | null;
  sender_avatar_url?: string | null;
  user_avatar?: string | null;
  user?: {
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
  sender?: {
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
  customer?: {
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
}

type ApiRecord = Record<string, any>;
type MessagePayloadPath =
  | "root"
  | "messages"
  | "results"
  | "items"
  | "history"
  | "data"
  | "result"
  | "payload"
  | "data.messages"
  | "data.results"
  | "data.items"
  | "data.history"
  | "result.messages"
  | "result.results"
  | "result.items"
  | "result.history"
  | "payload.messages"
  | "payload.results"
  | "payload.items"
  | "payload.history";

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

const normalizeMessage = (message: SupportMessage): SupportMessage => {
  const sender = isRecord(message.sender)
    ? message.sender
    : isRecord(message.user)
      ? message.user
      : isRecord(message.customer)
        ? message.customer
        : null;

  const senderName = pickFirstString(
    sender?.name,
    sender?.username,
    sender?.email,
    message.sender_name,
  );

  const avatarUrl = toAbsoluteMediaUrl(
    pickFirstString(
      sender?.avatar_url,
      sender?.avatar,
      sender?.profile_picture,
      message.avatar_url,
      message.avatar,
      message.sender_avatar_url,
      message.sender_avatar,
      message.user_avatar,
    ),
  );

  return {
    ...message,
    sender_name: senderName || message.sender_name,
    avatar_url: avatarUrl,
    avatar: avatarUrl,
    sender_avatar: avatarUrl,
    sender_avatar_url: avatarUrl,
    user_avatar: avatarUrl,
    sender: sender ? { ...sender } : message.sender,
  };
};

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

const findMessageArray = (
  payload: unknown,
): { items: SupportMessage[]; source: MessagePayloadPath | "unknown" } => {
  if (Array.isArray(payload)) {
    return {
      items: normalizeMessageList(payload),
      source: "root",
    };
  }

  if (!isRecord(payload)) {
    return { items: [], source: "unknown" };
  }

  const arrayCandidates: Array<{ source: MessagePayloadPath; value: unknown }> = [
    { source: "messages", value: payload.messages },
    { source: "results", value: payload.results },
    { source: "items", value: payload.items },
    { source: "history", value: payload.history },
    { source: "data", value: payload.data },
    { source: "result", value: payload.result },
    { source: "payload", value: payload.payload },
  ];

  for (const candidate of arrayCandidates) {
    if (Array.isArray(candidate.value)) {
      return {
        items: normalizeMessageList(candidate.value),
        source: candidate.source,
      };
    }
  }

  const nestedCandidates: Array<{ prefix: "data" | "result" | "payload"; value: unknown }> = [
    { prefix: "data", value: payload.data },
    { prefix: "result", value: payload.result },
    { prefix: "payload", value: payload.payload },
  ];

  for (const candidate of nestedCandidates) {
    if (!isRecord(candidate.value)) {
      continue;
    }

    const nestedArrayCandidates: Array<{ source: MessagePayloadPath; value: unknown }> = [
      { source: `${candidate.prefix}.messages` as MessagePayloadPath, value: candidate.value.messages },
      { source: `${candidate.prefix}.results` as MessagePayloadPath, value: candidate.value.results },
      { source: `${candidate.prefix}.items` as MessagePayloadPath, value: candidate.value.items },
      { source: `${candidate.prefix}.history` as MessagePayloadPath, value: candidate.value.history },
    ];

    for (const nestedArrayCandidate of nestedArrayCandidates) {
      if (Array.isArray(nestedArrayCandidate.value)) {
        return {
          items: normalizeMessageList(nestedArrayCandidate.value),
          source: nestedArrayCandidate.source,
        };
      }
    }
  }

  return { items: [], source: "unknown" };
};

const extractMessages = (payload: unknown): SupportMessage[] => {
  const { items, source } = findMessageArray(payload);

  if (items.length > 0) {
    return items;
  }

  if (Array.isArray(payload)) {
    return [];
  }

  if (source === "unknown" && payload != null) {
    console.warn(
      "[supportService] Unrecognized history payload shape:",
      describePayloadShape(payload),
    );
  }

  return [];
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

    if (isRecord(candidate) && isRecord(candidate.message) && typeof candidate.message.id !== "undefined") {
      return normalizeMessage(candidate.message as SupportMessage);
    }
  }

  throw new Error("[supportService] Invalid send message payload");
};

export const supportService = {
  getHistory: async (): Promise<SupportMessage[]> => {
    const response = await client.get("/support/history/");
    return extractMessages(response.data);
  },

  sendMessage: async (message: string): Promise<SupportMessage> => {
    const response = await client.post(Endpoints.SUPPORT_SEND, { message });
    return extractSingleMessage(response.data);
  },
};
