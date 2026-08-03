import type { Banner } from "../types";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

const sortBanners = (banners: Banner[]): Banner[] => {
  return [...banners].sort((left, right) => {
    return (left.display_order || 0) - (right.display_order || 0);
  });
};

export const bannerService = {
  getAll: async (): Promise<Banner[]> => {
    try {
      const response = await client.get<any>(Endpoints.BANNERS);
      const rawBanners = Array.isArray(response.data)
        ? response.data
        : response.data?.results || response.data?.data || [];

      const activeBanners = (rawBanners as Banner[]).filter(
        (banner) => banner?.is_active !== false,
      );

      return sortBanners(activeBanners);
    } catch (error) {
      console.error("[Banner Service] Loi khi lay danh sach banner:", error);
      throw error;
    }
  },
};
