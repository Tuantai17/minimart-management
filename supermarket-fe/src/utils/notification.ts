import { router } from "expo-router";
import type { FCMDataPayload } from "../types";

export const handleNotificationNavigation = (data?: FCMDataPayload) => {
  if (!data) return;

  if (data.order_code) {
    // Navigate to order detail page
    // Assuming the path is /order/[id] or similar
    // The previous implementation of layout showed: <Stack.Screen name="order" options={{ presentation: "card" }} />
    // Assuming /order/[id] is valid
    router.push(`/order/${data.order_code}`);
  }
};
