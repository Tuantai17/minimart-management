import { useEffect } from "react";
import { Platform } from "react-native";
import { deviceService, type DeviceType } from "../services/device.service";
import { messagingService } from "../services/messaging.service";
import { useNotificationStore } from "../store/notification.store";
import { useUIStore } from "../store/ui.store";
import { handleNotificationNavigation } from "../utils/notification";

const resolveDeviceType = (): DeviceType => {
  if (Platform.OS === "ios") {
    return "ios";
  }

  if (Platform.OS === "android") {
    return "android";
  }

  return "web";
};

export const usePushNotification = (isLoggedIn: boolean) => {
  const addFromRemoteMessage = useNotificationStore(
    (state) => state.addFromRemoteMessage
  );
  const showToast = useUIStore((state) => state.showToast);

  useEffect(() => {
    if (!isLoggedIn || Platform.OS === "web") {
      return;
    }

    let isMounted = true;
    let unsubscribeRefresh: (() => void) | void;
    let unsubscribeForeground: (() => void) | void;
    let unsubscribeOpenedApp: (() => void) | void;

    const registerDevice = async () => {
      try {
        const token = await messagingService.requestPermissionAndGetToken();

        if (!token || !isMounted) {
          return;
        }

        await deviceService.registerDeviceToken({
          token,
          device_type: resolveDeviceType(),
        });
        
        await messagingService.subscribeToTopic("promotions");

        unsubscribeRefresh = await messagingService.onTokenRefresh(async (newToken) => {
          try {
            if (!newToken) return;

            await deviceService.registerDeviceToken({
              token: newToken,
              device_type: resolveDeviceType(),
            });
          } catch (error) {
            console.error("Lỗi khi refresh token:", error);
          }
        });

        unsubscribeForeground = await messagingService.onForegroundMessage((remoteMessage) => {
          if (!isMounted) return;
          
          addFromRemoteMessage(remoteMessage);
          
          const title = remoteMessage.notification?.title || "Thông báo mới";
          const body = remoteMessage.notification?.body || "";
          const msg = body ? `${title}\n${body}` : title;
          
          showToast(msg, "info");
        });

        unsubscribeOpenedApp = await messagingService.onNotificationOpenedApp((remoteMessage) => {
          if (!isMounted || !remoteMessage) return;
          handleNotificationNavigation(remoteMessage.data);
        });

        const initialNotification = await messagingService.getInitialNotification();
        if (initialNotification && isMounted) {
          setTimeout(() => {
            handleNotificationNavigation(initialNotification.data);
          }, 500);
        }

      } catch (error) {
        console.error("Lỗi khi đăng ký push notification:", error);
      }
    };

    void registerDevice();

    return () => {
      isMounted = false;
      if (typeof unsubscribeRefresh === 'function') unsubscribeRefresh();
      if (typeof unsubscribeForeground === 'function') unsubscribeForeground();
      if (typeof unsubscribeOpenedApp === 'function') unsubscribeOpenedApp();
    };
  }, [isLoggedIn, addFromRemoteMessage, showToast]);
};
