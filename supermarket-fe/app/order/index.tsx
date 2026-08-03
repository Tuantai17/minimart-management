import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function OrderIndex() {
  const router = useRouter();
  useEffect(() => {
    // Redirect to tabs orders
    router.replace("/(tabs)/orders");
  }, []);
  return null;
}
