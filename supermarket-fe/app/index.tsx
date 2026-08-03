/**
 * Entry point - Redirect to Splash screen
 */
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/(auth)/splash" />;
}
