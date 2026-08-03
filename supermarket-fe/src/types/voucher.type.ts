export type VoucherDiscountType = "PERCENT" | "FIXED" | "SHIPPING";

export type VoucherClaimStatus =
  | "claimable"
  | "locked"
  | "claimed"
  | "expired"
  | "out_of_stock";

export type UserVoucherStatus = "active" | "used" | "expired" | "invalid";

export type VoucherErrorCode =
  | "UNAUTHENTICATED"
  | "VOUCHER_NOT_FOUND"
  | "VOUCHER_NOT_STARTED"
  | "VOUCHER_NOT_CLAIMABLE"
  | "VOUCHER_CLAIM_EXPIRED"
  | "VOUCHER_OUT_OF_STOCK"
  | "VOUCHER_ALREADY_CLAIMED"
  | "CLAIM_CONDITION_NOT_MET"
  | "VOUCHER_EXPIRED"
  | "INSUFFICIENT_ORDER_AMOUNT"
  | "VOUCHER_MAX_USAGE_REACHED"
  | "VOUCHER_USER_LIMIT_REACHED"
  | "INVALID_SUBTOTAL"
  | "USER_VOUCHER_NOT_FOUND"
  | "USER_VOUCHER_NOT_OWNED"
  | "VOUCHER_ALREADY_USED"
  | "VOUCHER_SCOPE_NOT_MATCHED"
  | "THROTTLED";

export interface VoucherClaimConditions {
  requires_login: boolean;
  required_membership_tier: string | null;
  min_completed_orders: number;
  min_lifetime_spend: string;
  requires_phone_verified: boolean;
}

export interface VoucherDisplay {
  badge: string;
  highlight: string | null;
  accent_color: string;
}

export interface VoucherCatalogItem {
  id: number;
  code: string;
  title: string;
  description?: string;
  discount_type: VoucherDiscountType;
  discount_value: string;
  min_order_value: string;
  max_discount_amount?: string | null;
  start_at: string;
  end_at: string;
  claim_start_at: string | null;
  claim_end_at: string | null;
  claim_status: VoucherClaimStatus;
  is_claimed: boolean;
  is_claimable: boolean;
  remaining_quantity: number;
  user_claim_limit: number;
  claim_conditions: VoucherClaimConditions;
  claim_requirement_text: string;
  apply_requirement_text: string;
  display: VoucherDisplay;
}

export interface VoucherCatalogQuery {
  page?: number;
  page_size?: number;
  status?: VoucherClaimStatus;
  scope?: "public" | "recommended";
}

export interface PaginatedVoucherCatalogResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: VoucherCatalogItem[];
}

export interface ClaimVoucherPayload {
  voucher_id: number;
}

export interface UserVoucher {
  id: number;
  voucher_id: number;
  code: string;
  title: string;
  description?: string;
  status: UserVoucherStatus;
  claimed_at: string;
  expires_at: string;
  discount_type?: VoucherDiscountType;
  discount_value?: string;
  min_order_value?: string;
  apply_requirement_text?: string;
  display?: VoucherDisplay;
}

export interface ClaimVoucherResponse {
  message: string;
  user_voucher: UserVoucher;
}

export interface MyVoucherQuery {
  status?: UserVoucherStatus;
  page?: number;
  page_size?: number;
  available_for_checkout?: boolean;
}

export interface PaginatedMyVoucherResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: UserVoucher[];
}

export interface ApplyVoucherPayload {
  code?: string;
  user_voucher_id?: number;
}

export interface AppliedVoucherPreview {
  success?: boolean;
  voucher_id?: number;
  user_voucher_id?: number;
  voucher_code: string;
  discount_type?: VoucherDiscountType;
  discount_value?: string;
  discount_amount: number;
  original_subtotal: number;
  final_subtotal: number;
  shipping_discount_amount?: number;
  final_shipping_fee?: number;
  final_total?: number;
  applied_scope?: "order" | "shipping" | "mixed";
  message: string;
}

export interface VoucherApiError {
  error_code?: VoucherErrorCode;
  message?: string;
  error?: string;
  detail?: string;
  details?: Record<string, unknown>;
}
