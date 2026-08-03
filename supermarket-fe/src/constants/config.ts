/** App config */
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000/api";
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_FIREBASE_GOOGLE_WEB_CLIENT_ID || "";

export const Config = {
  API_BASE_URL,
  API_ORIGIN,
  GOOGLE_WEB_CLIENT_ID,
  WS_BASE_URL: API_ORIGIN.replace(/^http/, "ws"),
  API_TIMEOUT: 15000,
  APP_NAME: "Siêu Thị Mini",
  APP_VERSION: "1.0.0",
  FREE_SHIP_THRESHOLD: 150000,
  SHIPPING_FEE: 15000,
} as const;
