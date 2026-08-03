import { create } from "zustand";
import { userService } from "../services/user.service";
import type {
  AvatarUploadPayload,
  UpdateProfilePayload,
  UserProfile,
} from "../types";
import { useAuthStore } from "./auth.store";

interface ProfileStore {
  profile: UserProfile | null;
  isLoadingProfile: boolean;
  isUpdatingProfile: boolean;
  isUpdatingAvatar: boolean;
  profileError: string | null;
  fetchProfile: () => Promise<UserProfile | null>;
  updateProfileAction: (payload: UpdateProfilePayload) => Promise<UserProfile>;
  updateAvatarAction: (payload: AvatarUploadPayload) => Promise<UserProfile>;
  updateStockAlertsAction: (value: boolean) => Promise<void>;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,
  isLoadingProfile: false,
  isUpdatingProfile: false,
  isUpdatingAvatar: false,
  profileError: null,

  fetchProfile: async () => {
    set({
      isLoadingProfile: true,
      profileError: null,
    });

    try {
      const profile = await userService.getMyProfile();

      useAuthStore.getState().setProfile(profile);
      set({
        profile,
        isLoadingProfile: false,
        profileError: null,
      });

      return profile;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Khong the tai thong tin ca nhan.";
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;

      if (statusCode === 401) {
        useAuthStore.getState().logout();
        set({
          profile: null,
          isLoadingProfile: false,
          profileError: message,
        });
        throw error;
      }

      set({
        isLoadingProfile: false,
        profileError: message,
      });

      throw error;
    }
  },

  updateProfileAction: async (payload) => {
    set({
      isUpdatingProfile: true,
      profileError: null,
    });

    try {
      const profile = await userService.updateProfile(payload);

      useAuthStore.getState().setProfile(profile);
      set({
        profile,
        isUpdatingProfile: false,
        profileError: null,
      });

      return profile;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Khong the cap nhat thong tin ca nhan.";
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;

      if (statusCode === 401) {
        useAuthStore.getState().logout();
        set({
          profile: null,
          isUpdatingProfile: false,
          profileError: message,
        });
        throw error;
      }

      set({
        isUpdatingProfile: false,
        profileError: message,
      });

      throw error;
    }
  },

  updateAvatarAction: async (payload) => {
    set({
      isUpdatingAvatar: true,
      profileError: null,
    });

    try {
      const profile = await userService.updateAvatar(payload);

      useAuthStore.getState().setProfile(profile);
      set({
        profile,
        isUpdatingAvatar: false,
        profileError: null,
      });

      return profile;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Khong the cap nhat anh dai dien.";
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : undefined;

      if (statusCode === 401) {
        useAuthStore.getState().logout();
        set({
          profile: null,
          isUpdatingAvatar: false,
          profileError: message,
        });
        throw error;
      }

      set({
        isUpdatingAvatar: false,
        profileError: message,
      });

      throw error;
    }
  },

  updateStockAlertsAction: async (value: boolean) => {
    try {
      const response = await userService.updateStockAlerts(value);
      
      set((state) => {
        if (!state.profile) return state;
        
        const updatedProfile = { 
          ...state.profile, 
          receive_stock_alerts: response?.receive_stock_alerts ?? value 
        };
        
        useAuthStore.getState().setProfile(updatedProfile);
        
        return { profile: updatedProfile };
      });
    } catch (error) {
      // Re-throw to handle in UI
      throw error;
    }
  },

  clearProfile: () => {
    set({
      profile: null,
      isLoadingProfile: false,
      isUpdatingProfile: false,
      isUpdatingAvatar: false,
      profileError: null,
    });
  },
}));
