import AsyncStorage from "@react-native-async-storage/async-storage";

/** Wrapper around AsyncStorage with type safety */
export const storage = {
  get: async (key: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.error("Storage set error:", e);
    }
  },
  remove: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error("Storage remove error:", e);
    }
  },
  getJSON: async <T>(key: string): Promise<T | null> => {
    const val = await storage.get(key);
    return val ? JSON.parse(val) : null;
  },
  setJSON: async (key: string, value: unknown): Promise<void> => {
    await storage.set(key, JSON.stringify(value));
  },
};
