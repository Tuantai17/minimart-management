import type { User, UserProfile, ProductReview } from "../types";

export const findReviewByCurrentUser = (
  reviews: ProductReview[],
  currentUser: User | null,
  profile: UserProfile | null,
): ProductReview | null => {
  const candidateIds = new Set(
    [currentUser?.id, profile?.id]
      .map((value) =>
        typeof value === "number" || typeof value === "string" ? String(value) : "",
      )
      .filter(Boolean),
  );
  const candidateEmails = new Set(
    [currentUser?.email, profile?.email]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const candidateUsernames = new Set(
    [currentUser?.username]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean),
  );

  if (
    candidateIds.size === 0 &&
    candidateEmails.size === 0 &&
    candidateUsernames.size === 0
  ) {
    return null;
  }

  return (
    reviews.find((review) => {
      const reviewUser = typeof review.user === "object" && review.user ? review.user : null;
      const ownerIds = [
        review.user_id,
        typeof review.user === "number" || typeof review.user === "string" ? review.user : null,
        reviewUser?.id ?? null,
      ]
        .map((value) => (value != null ? String(value) : ""))
        .filter(Boolean);

      if (ownerIds.some((value) => candidateIds.has(value))) {
        return true;
      }

      const ownerEmails = [
        reviewUser?.email,
        review.username?.includes("@") ? review.username : null,
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);

      if (ownerEmails.some((value) => candidateEmails.has(value))) {
        return true;
      }

      const ownerUsernames = [
        review.username,
        reviewUser?.username,
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);

      return ownerUsernames.some((value) => candidateUsernames.has(value));
    }) || null
  );
};

export const getCurrentReviewerDisplayName = (
  currentUser: User | null,
  profile: UserProfile | null,
): string =>
  profile?.name ||
  currentUser?.full_name ||
  currentUser?.name ||
  currentUser?.username ||
  "Khách hàng";

export const getCurrentReviewerAvatarUrl = (
  currentUser: User | null,
  profile: UserProfile | null,
): string | null => profile?.avatar_url || currentUser?.avatar_url || currentUser?.avatar || null;
