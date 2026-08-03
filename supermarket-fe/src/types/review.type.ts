export type ReviewMediaType = "image" | "video";

export interface ProductReviewMedia {
  id: number;
  file_url: string;
  media_type: ReviewMediaType;
  uploaded_at?: string | null;
}

export interface ProductReviewAuthor {
  id?: number | string | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

export interface ProductReview {
  id: number;
  product: number;
  rating: number;
  comment: string;
  created_at: string;
  updated_at?: string | null;
  user?: number | string | ProductReviewAuthor | null;
  user_id?: number | string | null;
  username?: string | null;
  user_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  reviewer_name?: string | null;
  reviewer_avatar?: string | null;
  shop_reply?: string | null;
  shop_replied_at?: string | null;
  media?: ProductReviewMedia[];
}

export interface PaginatedReviewResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ProductReview[];
}

export interface CreateReviewPayload {
  product: number;
  rating: number;
  comment?: string;
}

export interface UpdateReviewPayload {
  rating?: number;
  comment?: string;
}

export interface ReviewMediaUploadPayload {
  uri: string;
  name?: string;
  mimeType?: string;
  file?: File | null;
}
