/**
 * ============================
 * USER TYPES
 * ============================
 */

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  role?: "customer" | "staff" | "admin";
  receive_stock_alerts?: boolean;
  permissions?: string[];
  role_features?: {
    show_customer_features?: boolean;
    show_staff_features?: boolean;
    show_admin_features?: boolean;
  };
}

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  phone?: string;
  avatar?: AvatarUploadPayload | null;
}

export interface AvatarUploadPayload {
  uri: string;
  name?: string;
  mimeType?: string;
  file?: File | null;
}

export type UpdateProfileRequest = UpdateProfilePayload;

export interface Review {
  id: number;
  productId: number;
  userName: string;
  avatar?: string | null;
  rating: number;
  comment: string;
  date: string;
}
