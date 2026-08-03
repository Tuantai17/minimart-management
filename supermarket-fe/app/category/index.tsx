import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function CategoryIndex() {
  const router = useRouter();
  useEffect(() => {
    // Redirect to tabs category
    router.replace("/(tabs)/category");
  }, []);
  return null;
}
