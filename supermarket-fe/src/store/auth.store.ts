import { create } from "zustand";
import { userService } from "../services/user.service";
import type { User, UserProfile } from "../types";
import { storage } from "../utils";

interface AuthStore {
  user: User | null;
  profile: UserProfile | null;
  token: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  role: "customer" | "staff" | "admin" | null;
  isStaff: boolean;
  isSuperuser: boolean;
  isActive: boolean;
  setAuth: (
    user: User,
    token: string,
    profile?: UserProfile | null,
    authMeta?: {
      refreshToken?: string | null;
      isStaff?: boolean;
      isSuperuser?: boolean;
      isActive?: boolean;
    },
  ) => void;
  setProfile: (profile: UserProfile | null) => void;
  updateUser: (payload: Partial<User>) => void;
  logout: () => void;
  loadToken: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
}

const buildUserFromProfile = (
  currentUser: User | null,
  profile: UserProfile | null,
): User | null => {
  if (!currentUser && !profile) {
    return null;
  }

  const isStaff = profile?.is_staff ?? currentUser?.is_staff ?? false;
  const isSuperuser = profile?.is_superuser ?? currentUser?.is_superuser ?? false;
  const isActive = profile?.is_active ?? currentUser?.is_active ?? true;
  const role = profile?.role || currentUser?.role || (isSuperuser ? "admin" : isStaff ? "staff" : "customer");

  return {
    id: currentUser?.id || profile?.id || 0,
    username: currentUser?.username,
    first_name: currentUser?.first_name || profile?.name || currentUser?.username || "",
    last_name: currentUser?.last_name,
    name: profile?.name || currentUser?.name || currentUser?.first_name || currentUser?.username || "",
    full_name:
      profile?.name ||
      currentUser?.full_name ||
      currentUser?.name ||
      currentUser?.first_name ||
      currentUser?.username ||
      "",
    email: profile?.email || currentUser?.email || "",
    phone: profile?.phone || currentUser?.phone || "",
    avatar: profile?.avatar_url || currentUser?.avatar || currentUser?.avatar_url,
    avatar_url: profile?.avatar_url || currentUser?.avatar_url || currentUser?.avatar,
    created_at: currentUser?.created_at,
    is_staff: isStaff,
    is_superuser: isSuperuser,
    is_active: isActive,
    role,
  };
};

const persistAuthState = async (
  user: User | null,
  token: string | null,
  profile: UserProfile | null,
  refreshToken: string | null,
) => {
  if (token) {
    await storage.set("authToken", token);
  } else {
    await storage.remove("authToken");
  }

  if (refreshToken) {
    await storage.set("refreshToken", refreshToken);
  } else {
    await storage.remove("refreshToken");
  }

  if (user) {
    await storage.setJSON("user", user);
  } else {
    await storage.remove("user");
  }

  if (profile) {
    await storage.setJSON("userProfile", profile);
  } else {
    await storage.remove("userProfile");
  }
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  token: null,
  refreshToken: null,
  isLoggedIn: false,
  isLoading: true,
  role: null,
  isStaff: false,
  isSuperuser: false,
  isActive: true,

  setAuth: (user, token, profile = null, authMeta) => {
    const mergedUser: User = {
      ...user,
      is_staff: authMeta?.isStaff ?? user.is_staff ?? false,
      is_superuser: authMeta?.isSuperuser ?? user.is_superuser ?? false,
      is_active: authMeta?.isActive ?? user.is_active ?? true,
      role:
        user.role ||
        (authMeta?.isSuperuser
          ? "admin"
          : authMeta?.isStaff
            ? "staff"
            : "customer"),
    };
    const nextUser = buildUserFromProfile(mergedUser, profile) ?? mergedUser;
    const nextRole = nextUser.role || (nextUser.is_superuser ? "admin" : nextUser.is_staff ? "staff" : "customer");
    const nextIsStaff = Boolean(nextUser.is_staff);
    const nextIsSuperuser = Boolean(nextUser.is_superuser);
    const nextIsActive = nextUser.is_active ?? true;

    void persistAuthState(nextUser, token, profile, authMeta?.refreshToken ?? null);
    set({
      user: nextUser,
      profile,
      token,
      refreshToken: authMeta?.refreshToken ?? null,
      isLoggedIn: true,
      isLoading: false,
      role: nextRole,
      isStaff: nextIsStaff,
      isSuperuser: nextIsSuperuser,
      isActive: nextIsActive,
    });
  },

  setProfile: (profile) => {
    const nextUser = buildUserFromProfile(get().user, profile);
    const nextRole = nextUser?.role || null;
    const nextIsStaff = Boolean(nextUser?.is_staff);
    const nextIsSuperuser = Boolean(nextUser?.is_superuser);
    const nextIsActive = nextUser?.is_active ?? true;
    void persistAuthState(nextUser, get().token, profile, get().refreshToken);
    set({
      profile,
      user: nextUser,
      role: nextRole,
      isStaff: nextIsStaff,
      isSuperuser: nextIsSuperuser,
      isActive: nextIsActive,
    });
  },

  updateUser: (payload) => {
    const currentUser = get().user;
    const nextUser = currentUser ? { ...currentUser, ...payload } : null;
    void persistAuthState(nextUser, get().token, get().profile, get().refreshToken);
    set({ user: nextUser });
  },

  logout: () => {
    void persistAuthState(null, null, null, null);
    set({
      user: null,
      profile: null,
      token: null,
      refreshToken: null,
      isLoggedIn: false,
      isLoading: false,
      role: null,
      isStaff: false,
      isSuperuser: false,
      isActive: true,
    });
  },

  loadToken: async () => {
    const [token, refreshToken, user, profile] = await Promise.all([
      storage.get("authToken"),
      storage.get("refreshToken"),
      storage.getJSON<User>("user"),
      storage.getJSON<UserProfile>("userProfile"),
    ]);

    const nextUser = buildUserFromProfile(user, profile);
    const nextRole = nextUser?.role || null;

    set({
      token,
      refreshToken,
      user: nextUser,
      profile,
      isLoggedIn: Boolean(token),
      isLoading: false,
      role: nextRole,
      isStaff: Boolean(nextUser?.is_staff),
      isSuperuser: Boolean(nextUser?.is_superuser),
      isActive: nextUser?.is_active ?? true,
    });
  },

  refreshProfile: async () => {
    const token = get().token ?? (await storage.get("authToken"));

    if (!token) {
      set({ profile: null });
      return null;
    }

    const profile = await userService.getMyProfile();
    const nextUser = buildUserFromProfile(get().user, profile);
    const nextRole = nextUser?.role || null;

    await persistAuthState(nextUser, token, profile, get().refreshToken);
    set({
      profile,
      user: nextUser,
      token,
      isLoggedIn: true,
      role: nextRole,
      isStaff: Boolean(nextUser?.is_staff),
      isSuperuser: Boolean(nextUser?.is_superuser),
      isActive: nextUser?.is_active ?? true,
    });

    return profile;
  },
}));
