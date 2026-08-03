import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Config } from "../constants";
import { SupportMessage, supportService } from "../services/support.service";
import { storage } from "../utils";

const buildMessageKey = (message: Partial<SupportMessage>) => {
  if (typeof message.id !== "undefined" && message.id !== null) {
    return `id::${String(message.id)}`;
  }

  const senderId =
    message.sender?.id || message.user?.id || message.customer?.id || "unknown";
  return [message.id, message.message, message.created_at, senderId].join("::");
};

const mergeMessages = (
  currentMessages: SupportMessage[],
  incomingMessages: SupportMessage[],
): SupportMessage[] => {
  const safeCurrent = Array.isArray(currentMessages) ? currentMessages : [];
  const safeIncoming = Array.isArray(incomingMessages) ? incomingMessages : [];

  if (safeIncoming.length === 0) {
    return safeCurrent;
  }

  const mergedMap = new Map<string, SupportMessage>();

  safeCurrent.forEach((message) => {
    mergedMap.set(buildMessageKey(message), message);
  });

  safeIncoming.forEach((message) => {
    mergedMap.set(buildMessageKey(message), message);
  });

  return Array.from(mergedMap.values()).sort(
    (first, second) =>
      new Date(first.created_at || 0).getTime() -
      new Date(second.created_at || 0).getTime(),
  );
};

export const useChat = () => {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const ws = useRef<WebSocket | null>(null);
  const isFetchingHistory = useRef(false);

  const getHistory = useCallback(async () => {
    if (isFetchingHistory.current) {
      return;
    }

    isFetchingHistory.current = true;

    try {
      const data = await supportService.getHistory();
      const safeData = Array.isArray(data) ? data : [];
      setMessages((prev) => mergeMessages(prev, safeData));
    } catch (error) {
      console.error("[useChat] Failed to load history:", error);
      setMessages((prev) => (Array.isArray(prev) ? prev : []));
    } finally {
      isFetchingHistory.current = false;
      setLoading(false);
    }
  }, []);

  const disconnectWS = useCallback(() => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  }, []);

  const connectWS = useCallback(async () => {
    const token = await storage.get("authToken");

    if (!token) {
      console.warn("[useChat] Missing auth token, skipping WebSocket");
      return;
    }

    disconnectWS();

    const wsBaseUrl = Config.WS_BASE_URL || "ws://localhost:8000";
    const wsUrl = `${wsBaseUrl}/ws/support/?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(wsUrl);

    ws.current = socket;

    socket.onopen = () => {
      console.log("[useChat] WebSocket connected");
    };

    socket.onmessage = (event) => {
      console.log("[useChat] Nhận tín hiệu từ WebSocket:", event.data);
      try {
        // Nới lỏng điều kiện kiểm tra: Cứ có bất kì socket data nào trả về
        // thì đều gọi fetch lại lịch sử cho chắc chắn (theo mô hình chuông báo)
        void getHistory();
      } catch (error) {
        console.error("[useChat] Failed to parse WebSocket payload:", error);
      }
    };

    socket.onerror = (event) => {
      console.error("[useChat] Lỗi WebSocket:", event);
    };

    socket.onclose = (event) => {
      if (ws.current === socket) {
        ws.current = null;
      }
      console.log(
        `[useChat] Ngắt kết nối WebSocket (Code: ${event.code}, Reason: ${event.reason})`,
      );
    };
  }, [disconnectWS, getHistory]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();

    if (!trimmed) return;

    const optimisticMessage: SupportMessage = {
      id: Date.now(),
      ticket: 0,
      sender_name: "Bạn",
      is_admin_reply: false,
      message: trimmed,
      is_read: true,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => mergeMessages(prev, [optimisticMessage]));

    try {
      const newMsg = await supportService.sendMessage(trimmed);

      setMessages((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const filteredPrev = safePrev.filter(
          (message) =>
            buildMessageKey(message) !== buildMessageKey(optimisticMessage),
        );

        return mergeMessages(filteredPrev, [newMsg]);
      });

      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "ping_new_msg" }));
      }
    } catch (error) {
      setMessages((prev) =>
        Array.isArray(prev)
          ? prev.filter(
              (message) =>
                buildMessageKey(message) !== buildMessageKey(optimisticMessage),
            )
          : [],
      );
      console.error("[useChat] Failed to send message:", error);
      throw error;
    }
  };

  useEffect(() => {
    void getHistory();
    void connectWS();

    const intervalId = setInterval(() => {
      void getHistory();
    }, 3000);

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          void getHistory();
        }
      },
    );

    const handleWindowFocus = () => {
      void getHistory();
    };

    const handleVisibilityChange = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        void getHistory();
      }
    };

    const canListenWindowFocus =
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function";
    const canRemoveWindowFocus =
      typeof window !== "undefined" &&
      typeof window.removeEventListener === "function";
    const canListenDocumentVisibility =
      typeof document !== "undefined" &&
      typeof document.addEventListener === "function";
    const canRemoveDocumentVisibility =
      typeof document !== "undefined" &&
      typeof document.removeEventListener === "function";

    if (canListenWindowFocus) {
      window.addEventListener("focus", handleWindowFocus);
    }

    if (canListenDocumentVisibility) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();

      if (canRemoveWindowFocus) {
        window.removeEventListener("focus", handleWindowFocus);
      }

      if (canRemoveDocumentVisibility) {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }

      disconnectWS();
    };
  }, [connectWS, disconnectWS, getHistory]);

  return { messages, loading, sendMessage, getHistory };
};
