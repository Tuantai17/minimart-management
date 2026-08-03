/**
 * Root Layout - Entry point
 * Handles: splash screen, auth check, route definitions
 */
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import CartToast from "../src/components/cart/CartToast";
import { Config } from "../src/constants";
import { usePushNotification } from "../src/hooks/usePushNotification";
import { useAuthStore } from "../src/store";
import { useUIStore } from "../src/store/ui.store";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const loadToken = useAuthStore((state) => state.loadToken);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const toastVisible = useUIStore((state) => state.visible);
  const toastMessage = useUIStore((state) => state.message);
  const toastType = useUIStore((state) => state.type);

  usePushNotification(isLoggedIn);

  useEffect(() => {
    const configureGoogleSignin = async () => {
      if (Platform.OS === "web" || !Config.GOOGLE_WEB_CLIENT_ID) {
        return;
      }

      try {
        const { GoogleSignin } =
          await import("@react-native-google-signin/google-signin");

        GoogleSignin.configure({
          webClientId: Config.GOOGLE_WEB_CLIENT_ID,
        });
      } catch (error) {
        console.warn(
          "[AUTH] Google Sign-In chưa sẵn sàng. Hãy dùng development build/prebuild thay vì Expo web hoặc Expo Go.",
          error,
        );
      }
    };

    void configureGoogleSignin();
  }, []);

  useEffect(() => {
    loadToken().finally(() => SplashScreen.hideAsync());
  }, [loadToken]);

  if (isLoading) {
    return null;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product" options={{ presentation: "card" }} />
        <Stack.Screen name="category" options={{ presentation: "card" }} />
        <Stack.Screen name="search" options={{ presentation: "card" }} />
        <Stack.Screen name="cart" options={{ presentation: "card" }} />
        <Stack.Screen name="checkout" options={{ presentation: "card" }} />
        <Stack.Screen name="order" options={{ presentation: "card" }} />
        <Stack.Screen name="profile" options={{ presentation: "card" }} />
      </Stack>
      <CartToast
        message={toastMessage}
        visible={toastVisible}
        type={toastType}
      />
    </>
  );
}
