import { Platform } from "react-native";

export type MessagingModule = {
  default: () => {
    requestPermission: () => Promise<number>;
    getToken: () => Promise<string>;
    onTokenRefresh: (listener: (token: string) => Promise<void> | void) => () => void;
    onMessage: (listener: (message: any) => any) => () => void;
    onNotificationOpenedApp: (listener: (message: any) => any) => () => void;
    getInitialNotification: () => Promise<any>;
    subscribeToTopic: (topic: string) => Promise<void>;
  };
  AuthorizationStatus: {
    AUTHORIZED: number;
    PROVISIONAL: number;
  };
};

let messagingModuleCache: MessagingModule | null = null;

const loadModule = async (): Promise<MessagingModule | null> => {
  if (Platform.OS === "web") {
    return null;
  }
  
  if (messagingModuleCache) {
    return messagingModuleCache;
  }

  try {
    const module = (await import("@react-native-firebase/messaging")) as unknown as MessagingModule;
    messagingModuleCache = module;
    return module;
  } catch (error) {
    console.warn(
      "[PUSH] Firebase Messaging chưa sẵn sàng. Hãy dùng development build/prebuild thay vì Expo web hoặc Expo Go.",
      error,
    );
    return null;
  }
};

export const messagingService = {
  loadModule,

  requestPermissionAndGetToken: async (): Promise<string | null> => {
    const module = await loadModule();
    if (!module) return null;

    const messaging = module.default;
    const authStatus = await messaging().requestPermission();
    
    const enabled =
      authStatus === module.AuthorizationStatus.AUTHORIZED ||
      authStatus === module.AuthorizationStatus.PROVISIONAL;

    if (!enabled) return null;

    try {
      const token = await messaging().getToken();
      return token;
    } catch (e) {
      console.error("Lỗi khi lấy FCM token:", e);
      return null;
    }
  },

  subscribeToTopic: async (topic: string): Promise<void> => {
    const module = await loadModule();
    if (!module) return;
    try {
      await module.default().subscribeToTopic(topic);
    } catch (e) {
      console.error(`Lỗi khi subscribe topic ${topic}:`, e);
    }
  },

  onTokenRefresh: async (callback: (token: string) => void): Promise<(() => void) | void> => {
    const module = await loadModule();
    if (!module) return;
    return module.default().onTokenRefresh(callback);
  },

  onForegroundMessage: async (callback: (remoteMessage: any) => void): Promise<(() => void) | void> => {
    const module = await loadModule();
    if (!module) return;
    return module.default().onMessage(callback);
  },

  onNotificationOpenedApp: async (callback: (remoteMessage: any) => void): Promise<(() => void) | void> => {
    const module = await loadModule();
    if (!module) return;
    return module.default().onNotificationOpenedApp(callback);
  },

  getInitialNotification: async (): Promise<any> => {
    const module = await loadModule();
    if (!module) return null;
    return module.default().getInitialNotification();
  }
};
