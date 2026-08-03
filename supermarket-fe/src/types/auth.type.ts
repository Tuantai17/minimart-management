/**
 * ============================
 * AUTH TYPES
 * ============================
 */

export interface User {
  id: number;
  name: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string;
  avatar?: string;
  avatar_url?: string;
  address?: string;
  created_at?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  role?: "customer" | "staff" | "admin";
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  access?: string;
  refresh?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_active?: boolean;
  detail?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
}
