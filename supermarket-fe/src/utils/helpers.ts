export const truncateText = (text: string, max: number = 50): string =>
  text.length <= max ? text : text.substring(0, max) + "...";

export const calculateDiscount = (
  original: number,
  discount?: number | null,
): number =>
  discount ? Math.round(((original - discount) / original) * 100) : 0;

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isValidPhone = (phone: string): boolean =>
  /^(0[3|5|7|8|9])+([0-9]{8})$/.test(phone);

export const getStarArray = (rating: number): ("full" | "half" | "empty")[] =>
  Array.from({ length: 5 }, (_, i) =>
    rating >= i + 1 ? "full" : rating >= i + 0.5 ? "half" : "empty",
  );

import { Config } from "../constants";

export const getImageUrl = (url?: string | null): string => {
  if (!url) return "https://via.placeholder.com/300";
  if (url.startsWith("http")) return url;
  
  // Lấy BASE_URL hiện tại và bỏ đuôi /api
  const baseUrl = Config.API_BASE_URL.replace(/\/api\/?$/, "");
  return url.startsWith("/") ? `${baseUrl}${url}` : `${baseUrl}/${url}`;
};
