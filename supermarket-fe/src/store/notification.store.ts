import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppNotification } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RemoteMessage = any; // Will use specific type in hook, keeping any here to decouple store from Firebase types

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (
    notification: Omit<AppNotification, "id" | "created_at" | "is_read"> &
      Partial<Pick<AppNotification, "id" | "created_at" | "is_read">>,
  ) => void;
  addFromRemoteMessage: (remoteMessage: RemoteMessage) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const createNotificationId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (notification) => {
        const nextNotification: AppNotification = {
          id: notification.id || createNotificationId(),
          title: notification.title,
          message: notification.message,
          created_at: notification.created_at || new Date().toISOString(),
          is_read: notification.is_read ?? false,
          type: notification.type ?? "info",
        };

        set((state) => {
          const nextNotifications = [nextNotification, ...state.notifications];
          return {
            notifications: nextNotifications,
            unreadCount: nextNotifications.filter((n) => !n.is_read).length,
          };
        });
      },

      addFromRemoteMessage: (remoteMessage) => {
        if (!remoteMessage?.notification) return;
        
        get().addNotification({
          title: remoteMessage.notification.title || "Thông báo mới",
          message: remoteMessage.notification.body || "",
          type: remoteMessage.data?.order_code ? "order_update" : "info",
        });
      },

      markAsRead: (id) => {
        set((state) => {
          const nextNotifications = state.notifications.map((notification) =>
            notification.id === id
              ? { ...notification, is_read: true }
              : notification,
          );
          return {
            notifications: nextNotifications,
            unreadCount: nextNotifications.filter((n) => !n.is_read).length,
          };
        });
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            is_read: true,
          })),
          unreadCount: 0,
        }));
      },

      clearNotifications: () => {
        set({ notifications: [], unreadCount: 0 });
      },
    }),
    {
      name: "notification-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
