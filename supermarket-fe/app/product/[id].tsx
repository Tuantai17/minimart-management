import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import InlineVideoPlayer from "../../src/components/common/InlineVideoPlayer";
import MediaGalleryViewer, {
  type GalleryMediaItem,
} from "../../src/components/common/MediaGalleryViewer";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";

import { categoryService } from "../../src/services/category.service";
import { orderService } from "../../src/services/order.service";
import { productService } from "../../src/services/product.service";
import { reviewService } from "../../src/services/review.service";
import { useAuthStore, useCartStore, AuthRequiredError } from "../../src/store";
import type {
  CartItem,
  Category,
  Product,
  ProductReview,
  ProductReviewMedia,
} from "../../src/types";
import type { OrderResponse } from "../../src/types/order.type";
import {
  calculateDiscount,
  findReviewByCurrentUser,
  formatCurrency,
  getCurrentReviewerAvatarUrl,
  getCurrentReviewerDisplayName,
  getAddToCartErrorMessage,
  getImageUrl,
  showLoginRequireAlert,
} from "../../src/utils";
import { getInventoryHeadline, isOutOfStockProduct } from "../../src/utils/inventory";

const { width } = Dimensions.get("window");

// ============================================================
// Hook quản lý Toast (tái sử dụng pattern từ CartScreen)
// ============================================================
const useToast = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"success" | "error" | "info">("success");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string, t: "success" | "error" | "info" = "success") => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      setType(t);
      setVisible(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
      }, 2000);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { visible, message, type, showToast };
};

// ============================================================
// Toast Component inline (nhỏ gọn, không cần file riêng)
// ============================================================
function InlineToast({
  message,
  visible,
  type = "success",
}: {
  message: string;
  visible: boolean;
  type?: "success" | "error" | "info";
}) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [visible]);

  const bgColor =
    type === "success"
      ? Colors.primary
      : type === "error"
        ? Colors.error
        : Colors.info;

  const iconName =
    type === "success"
      ? "checkmark-circle"
      : type === "error"
        ? "close-circle"
        : "information-circle";

  if (!message) return null;

  return (
    <Animated.View
      style={[
        toastStyles.container,
        { backgroundColor: bgColor, transform: [{ translateY }], opacity, pointerEvents: "none" as const },
      ]}
    >
      <Ionicons name={iconName} size={20} color={Colors.white} />
      <Text style={toastStyles.text} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 50,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    gap: 10,
    zIndex: 9999,
    elevation: 10,
    ...Shadow.large,
  },
  text: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.white,
  },
});

// ============================================================
// Section Đánh giá sản phẩm
// Mục tiêu của block này:
// 1. Chuẩn hóa dữ liệu rating trước khi hiển thị
// 2. Tính phân bố số lượng review theo từng mức sao
// 3. Lấy thông tin người đánh giá để render UI
// 4. Chuẩn bị dữ liệu cho component ProductReviewsSection
// ============================================================

// Danh sách các mức sao cần hiển thị trong phần thống kê.
// Sắp xếp từ 5 -> 1 để UI hiển thị đúng thứ tự quen thuộc của người dùng.
const REVIEW_STARS = [5, 4, 3, 2, 1] as const;

// Chuẩn hóa rating về khoảng hợp lệ từ 1 đến 5.
// Vì backend hoặc dữ liệu cũ có thể trả về giá trị ngoài khoảng mong muốn,
// nên cần chặn lại để tránh làm sai thống kê hoặc hiển thị sai số sao.
const clampReviewRating = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 5;
  }

  return Math.max(1, Math.min(5, Math.round(value)));
};

// Lấy tên người đánh giá để hiển thị trên UI.
// Do dữ liệu tác giả có thể đến từ nhiều field khác nhau,
// nên ưu tiên theo thứ tự: full_name -> user_name -> username -> thông tin trong review.user.
// Nếu không có dữ liệu nào thì fallback về "Khách hàng".
const getReviewAuthorName = (review: ProductReview): string => {
  return (
    review.reviewer_name ||
    review.full_name ||
    review.user_name ||
    review.username ||
    (typeof review.user === "object" && review.user
      ? review.user.full_name || review.user.name || review.user.username || review.user.email
      : "") ||
    "Khách hàng"
  );
};

// Lấy avatar của người đánh giá.
// Ưu tiên avatar ở review trước, sau đó mới đọc trong object review.user.
const getReviewAvatarUrl = (review: ProductReview): string | null => {
  const reviewUser = typeof review.user === "object" && review.user ? review.user : null;

  return review.reviewer_avatar || review.avatar_url || reviewUser?.avatar_url || null;
};


// Format ngày đánh giá để hiển thị thân thiện theo định dạng vi-VN.
// Nếu ngày không hợp lệ thì fallback về "Vừa xong" để UI không bị trống.
const formatReviewDate = (value: string): string => {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return "Vừa xong";
  }

  return new Date(timestamp).toLocaleDateString("vi-VN");
};

// Tính phân bố review theo từng mức sao.
// Ví dụ: nếu có 10 review và 4 review là 5 sao thì dòng 5 sao sẽ là 40%.
// Kết quả này được dùng để render thanh tiến độ trong phần thống kê đánh giá.
const buildReviewDistribution = (reviews: ProductReview[]) => {
  return REVIEW_STARS.map((star) => {
    const count = reviews.filter((review) => clampReviewRating(review.rating) === star).length;
    return {
      star,
      count,
      percentage: reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0,
    };
  });
};

const getReviewMediaItems = (review: ProductReview): ProductReviewMedia[] =>
  Array.isArray(review.media) ? review.media : [];


function ReviewMediaCard({
  media,
  onPress,
}: {
  media: ProductReviewMedia;
  onPress?: () => void;
}) {
  const mediaUrl = getImageUrl(media.file_url);

  return (
    <TouchableOpacity
      style={styles.reviewMediaCard}
      activeOpacity={0.82}
      onPress={onPress}
    >
      {media.media_type === "video" ? (
        <View style={styles.reviewMediaVideoThumb}>
          <Image source={{ uri: mediaUrl }} style={styles.reviewMediaImage} />
          <View style={styles.reviewMediaPlayOverlay}>
            <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.92)" />
          </View>
        </View>
      ) : (
        <Image source={{ uri: mediaUrl }} style={styles.reviewMediaImage} />
      )}
      <View style={styles.reviewMediaBadge}>
        <Ionicons
          name={media.media_type === "video" ? "videocam" : "image-outline"}
          size={11}
          color={Colors.white}
        />
        <Text style={styles.reviewMediaBadgeText}>
          {media.media_type === "video" ? "Video" : "Ảnh"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function ProductReviewsSection({
  reviews,
  isLoading,
  error,
  isLoggedIn,
  canReview,
  reviewEligibilityMessage,
  myReview,
  viewerDisplayName,
  viewerAvatarUrl,
  showReviewForm,
  showAllReviews,
  draftRating,
  draftComment,
  isSubmitting,
  onToggleShowAll,
  onToggleForm,
  onSelectRating,
  onChangeComment,
  onSubmitReview,
  onLoginRequired,
  onOpenGallery,
}: {
  reviews: ProductReview[];
  isLoading: boolean;
  error: string | null;
  isLoggedIn: boolean;
  canReview: boolean;
  reviewEligibilityMessage: string;
  myReview: ProductReview | null;
  viewerDisplayName: string;
  viewerAvatarUrl: string | null;
  showReviewForm: boolean;
  showAllReviews: boolean;
  draftRating: number;
  draftComment: string;
  isSubmitting: boolean;
  onToggleShowAll: () => void;
  onToggleForm: () => void;
  onSelectRating: (rating: number) => void;
  onChangeComment: (value: string) => void;
  onSubmitReview: () => void;
  onLoginRequired: () => void;
  onOpenGallery: (mediaItems: ProductReviewMedia[], startIndex: number) => void;
}) {
  const averageRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, review) => sum + clampReviewRating(review.rating), 0) /
          reviews.length
        ).toFixed(1)
      : "--";
  const distribution = buildReviewDistribution(reviews);
  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  return (
    <View style={styles.ratingSection}>
      <View style={styles.ratingSectionHeader}>
        <Text style={styles.sectionTitle}>Đánh giá</Text>
        {reviews.length > 3 ? (
          <TouchableOpacity onPress={onToggleShowAll}>
            <Text style={styles.viewAllText}>
              {showAllReviews ? "Thu gọn" : "Xem tất cả"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.ratingBody}>
        <View style={styles.ratingOverview}>
          <Text style={styles.ratingBigNumber}>{averageRating}</Text>
          <View style={styles.ratingStarsRow}>
            {[1, 2, 3, 4, 5].map((index) => (
              <Ionicons
                key={index}
                name={
                  Number(averageRating) >= index
                    ? "star"
                    : Number(averageRating) >= index - 0.5
                      ? "star-half"
                      : "star-outline"
                }
                size={16}
                color={Number(averageRating) > 0 ? Colors.star : Colors.starInactive}
              />
            ))}
          </View>
          <Text style={styles.ratingCountText}>
            {reviews.length > 0 ? `${reviews.length} đánh giá` : "Chưa có đánh giá"}
          </Text>
        </View>

        <View style={styles.ratingDistribution}>
          {distribution.map((item) => (
            <View key={item.star} style={styles.ratingBarRow}>
              <Text style={styles.ratingBarLabel}>{item.star}</Text>
              <Ionicons name="star" size={12} color={Colors.star} />
              <View style={styles.ratingBarTrack}>
                <View style={[styles.ratingBarFill, { width: `${item.percentage}%` }]} />
              </View>
              <Text style={styles.ratingBarPercent}>{item.percentage}%</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.reviewActionRow}>
        {myReview ? (
          <Text style={styles.reviewOwnLabel}>Bạn đã đánh giá sản phẩm này</Text>
        ) : (
          <Text style={styles.reviewActionHint}>
            {isLoggedIn
              ? canReview
                ? "Chia sẻ cảm nhận của bạn về sản phẩm."
                : reviewEligibilityMessage
              : "Đăng nhập để gửi đánh giá."}
          </Text>
        )}

        <TouchableOpacity
          style={[
            styles.reviewActionButton,
            (!canReview || myReview) && styles.reviewActionButtonDisabled,
          ]}
          onPress={myReview ? undefined : isLoggedIn ? onToggleForm : onLoginRequired}
          disabled={Boolean(myReview) || (isLoggedIn && !canReview)}
          activeOpacity={0.8}
        >
          <Text style={styles.reviewActionButtonText}>
            {myReview ? "Đã đánh giá" : "Viết đánh giá"}
          </Text>
        </TouchableOpacity>
      </View>

      {showReviewForm ? (
        <View style={styles.reviewFormCard}>
          <Text style={styles.reviewFormTitle}>
            {myReview ? "Bạn đã gửi đánh giá" : "Gửi đánh giá mới"}
          </Text>

          <View style={styles.reviewStarPicker}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => onSelectRating(star)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={draftRating >= star ? "star" : "star-outline"}
                  size={24}
                  color={draftRating >= star ? Colors.star : Colors.starInactive}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.reviewCommentInput}
            value={draftComment}
            onChangeText={onChangeComment}
            placeholder="Viết cảm nhận của bạn về sản phẩm..."
            placeholderTextColor={Colors.textLight}
            multiline
            textAlignVertical="top"
            maxLength={300}
          />
          <Text style={styles.reviewInputHint}>
            Nội dung nhận xét là tùy chọn, bạn vẫn có thể gửi chỉ với số sao.
          </Text>

          <TouchableOpacity
            style={[styles.reviewSubmitButton, isSubmitting && styles.reviewSubmitButtonDisabled]}
            onPress={onSubmitReview}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.reviewSubmitButtonText}>
                {myReview ? "Đã đánh giá" : "Gửi đánh giá"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.ratingEmptyWrap}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.ratingEmptyText}>Đang tải đánh giá...</Text>
        </View>
      ) : error ? (
        <View style={styles.ratingEmptyWrap}>
          <Ionicons name="alert-circle-outline" size={20} color={Colors.error} />
          <Text style={styles.ratingEmptyText}>{error}</Text>
        </View>
      ) : displayedReviews.length > 0 ? (
        <View style={styles.reviewList}>
          {displayedReviews.map((review) => {
            const isOwnReview = myReview?.id === review.id;
            const authorName =
              isOwnReview && viewerDisplayName
                ? viewerDisplayName
                : getReviewAuthorName(review);
            const authorAvatar =
              (isOwnReview ? viewerAvatarUrl : null) || getReviewAvatarUrl(review);
            const mediaItems = getReviewMediaItems(review);

            return (
              <View key={review.id} style={styles.reviewItem}>
                <View style={styles.reviewItemHeader}>
                  {authorAvatar ? (
                    <Image
                      source={{ uri: getImageUrl(authorAvatar) }}
                      style={styles.reviewAvatar}
                    />
                  ) : (
                    <View style={styles.reviewAvatar}>
                      <Ionicons name="person" size={14} color={Colors.primary} />
                    </View>
                  )}
                  <View style={styles.reviewMeta}>
                    <Text style={styles.reviewAuthor}>{authorName}</Text>
                    <View style={styles.reviewMetaRow}>
                      <View style={styles.reviewMiniStars}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Ionicons
                            key={star}
                            name={clampReviewRating(review.rating) >= star ? "star" : "star-outline"}
                            size={12}
                            color={Colors.star}
                          />
                        ))}
                      </View>
                      <Text style={styles.reviewDate}>{formatReviewDate(review.created_at)}</Text>
                    </View>
                  </View>
                </View>
                {review.comment ? (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                ) : (
                  <Text style={styles.reviewCommentEmpty}>Người dùng chỉ gửi đánh giá sao.</Text>
                )}
                {mediaItems.length > 0 ? (
                  <View style={styles.reviewMediaWrap}>
                    {mediaItems.map((media, mediaIdx) => (
                      <ReviewMediaCard
                        key={media.id}
                        media={media}
                        onPress={() => onOpenGallery(mediaItems, mediaIdx)}
                      />
                    ))}
                  </View>
                ) : null}
                {review.shop_reply ? (
                  <View style={styles.shopReplyCard}>
                    <View style={styles.shopReplyHeader}>
                      <View style={styles.shopReplyBadge}>
                        <Ionicons name="storefront-outline" size={12} color={Colors.primary} />
                        <Text style={styles.shopReplyBadgeText}>Phản hồi từ shop</Text>
                      </View>
                      {review.shop_replied_at ? (
                        <Text style={styles.shopReplyDate}>
                          {formatReviewDate(review.shop_replied_at)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.shopReplyText}>{review.shop_reply}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.ratingEmptyWrap}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={20}
            color={Colors.textLight}
          />
          <Text style={styles.ratingEmptyText}>
            Chưa có dữ liệu đánh giá cho sản phẩm này
          </Text>
        </View>
      )}
    </View>
  );
}

const collectCategoryProducts = (category: Category | null): Product[] => {
  if (!category) {
    return [];
  }

  const directProducts = Array.isArray(category.products) ? category.products : [];
  const childProducts = Array.isArray(category.children)
    ? category.children.flatMap((childCategory) => collectCategoryProducts(childCategory))
    : [];

  const productMap = new Map<number, Product>();

  [...directProducts, ...childProducts].forEach((item) => {
    productMap.set(item.id, item);
  });

  return Array.from(productMap.values());
};

// ============================================================
// ProductDetailScreen chính
// ============================================================
export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{
    id: string | string[];
    review?: string | string[];
    reviewSuccess?: string | string[];
  }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const reviewIntent = Array.isArray(params.review) ? params.review[0] : params.review;
  const reviewSuccess =
    Array.isArray(params.reviewSuccess) ? params.reviewSuccess[0] : params.reviewSuccess;
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [qtyInput, setQtyInput] = useState("1");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  // Gallery viewer state
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryMediaItem[]>([]);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

  // Zustand Store
  const addToCart = useCartStore((state) => state.addToCart);
  const checkBeforeAddToCart = useCartStore((state) => state.checkBeforeAddToCart);
  const getTotalItems = useCartStore((state) => state.getTotalItems());

  // Toast
  const {
    visible: toastVisible,
    message: toastMsg,
    type: toastType,
    showToast,
  } = useToast();
  const reviewIntentHandledRef = useRef(false);
  const reviewSuccessHandledRef = useRef(false);

  const myReview = useMemo(
    () => findReviewByCurrentUser(reviews, user, profile),
    [profile, reviews, user],
  );

  const viewerDisplayName = useMemo(
    () => getCurrentReviewerDisplayName(user, profile),
    [profile, user],
  );

  const viewerAvatarUrl = useMemo(
    () => getCurrentReviewerAvatarUrl(user, profile),
    [profile, user],
  );

  const [canReviewProduct, setCanReviewProduct] = useState(false);
  const [reviewEligibilityMessage, setReviewEligibilityMessage] = useState(
    "Chỉ khách đã mua và nhận hàng mới có thể đánh giá sản phẩm này.",
  );

  const normalizeOrderStatus = useCallback((status?: string | null) => {
    const normalized = (status || "").trim().toUpperCase();

    if (normalized === "DELIVERED") {
      return "COMPLETED";
    }

    return normalized;
  }, []);

  const getReviewableOrderItem = useCallback(
    (orders: OrderResponse[], productId: number) => {
      return orders
        .filter((order) => normalizeOrderStatus(order.status) === "COMPLETED")
        .flatMap((order) =>
          (order.items || []).map((item) => ({
            order,
            item,
          })),
        )
        .find(({ item }) => item.product === productId);
    },
    [normalizeOrderStatus],
  );

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setQty(1);
        setQtyInput("1");
        setIsExpanded(false);
        setRelatedProducts([]);
        setReviews([]);
        setReviewError(null);
        setShowReviewForm(false);
        setShowAllReviews(false);
        setReviewRating(5);
        setReviewComment("");
        reviewIntentHandledRef.current = false;
        reviewSuccessHandledRef.current = false;

        const prod = await productService.getById(Number(id));
        setProduct(prod);

        try {
          setIsLoadingReviews(true);
          const reviewList = await reviewService.getByProduct(prod.id);
          setReviews(reviewList);
          setReviewError(null);
        } catch (reviewErr) {
          console.log("Lỗi tải đánh giá:", reviewErr);
          setReviews([]);
          setReviewError("Không thể tải đánh giá lúc này.");
        } finally {
          setIsLoadingReviews(false);
        }

        if (!isLoggedIn) {
          setCanReviewProduct(false);
          setReviewEligibilityMessage("Đăng nhập để kiểm tra quyền đánh giá sản phẩm.");
        } else {
          try {
            const orders = await orderService.getMyOrders();
            const reviewableOrderItem = getReviewableOrderItem(orders, prod.id);

            if (reviewableOrderItem) {
              setCanReviewProduct(true);
              setReviewEligibilityMessage("Bạn có thể đánh giá sản phẩm này.");
            } else {
              setCanReviewProduct(false);
              setReviewEligibilityMessage(
                "Chỉ khách đã mua sản phẩm trong đơn hoàn thành mới có thể đánh giá.",
              );
            }
          } catch (orderErr) {
            console.log("Lỗi kiểm tra quyền đánh giá:", orderErr);
            setCanReviewProduct(false);
            setReviewEligibilityMessage("Không thể xác minh quyền đánh giá lúc này.");
          }
        }

        try {
          const currentCategory = await categoryService.getById(prod.category);
          const related = collectCategoryProducts(currentCategory)
            .filter((item) => item.id !== prod.id)
            .filter((item) => item.category === prod.category)
            .filter((item) => item.is_active !== false)
            .slice(0, 6);

          setRelatedProducts(related);
        } catch (relErr) {
          console.log("Lỗi tải sản phẩm liên quan:", relErr);
          setRelatedProducts([]);
        }
      } catch (error) {
        console.log("Lỗi tải chi tiết sản phẩm:", error);
        setProduct(null);
        setRelatedProducts([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [getReviewableOrderItem, id, isLoggedIn]);

  useEffect(() => {
    if (myReview) {
      setReviewRating(clampReviewRating(myReview.rating));
      setReviewComment(myReview.comment || "");
      return;
    }

    setReviewRating(5);
    setReviewComment("");
  }, [myReview?.comment, myReview?.id, myReview?.rating]);

  useEffect(() => {
    if (reviewIntentHandledRef.current || reviewIntent == null || loading || !product) {
      return;
    }

    if (reviewIntent === "view") {
      reviewIntentHandledRef.current = true;
      setShowReviewForm(false);
      setShowAllReviews(true);
      return;
    }

    if (reviewIntent !== "1") {
      return;
    }

    if (!isLoggedIn) {
      reviewIntentHandledRef.current = true;
      showToast("Vui lòng đăng nhập để đánh giá sản phẩm.", "info");
      return;
    }

    if (!canReviewProduct) {
      reviewIntentHandledRef.current = true;
      showToast(reviewEligibilityMessage, "info");
      return;
    }

    if (myReview) {
      reviewIntentHandledRef.current = true;
      setShowAllReviews(true);
      showToast("Bạn đã đánh giá sản phẩm này rồi.", "info");
      return;
    }

    reviewIntentHandledRef.current = true;
    router.replace({
      pathname: "/review/[id]",
      params: { id: String(product.id) },
    } as any);
  }, [
    canReviewProduct,
    isLoggedIn,
    loading,
    myReview,
    product,
    reviewEligibilityMessage,
    reviewIntent,
    router,
    showToast,
  ]);

  useEffect(() => {
    if (
      reviewSuccessHandledRef.current ||
      reviewSuccess !== "1" ||
      loading ||
      !product
    ) {
      return;
    }

    reviewSuccessHandledRef.current = true;
    setShowReviewForm(false);
    setShowAllReviews(true);
    showToast("Đã đánh giá thành công.", "success");
  }, [loading, product, reviewSuccess, showToast]);


  const discount = calculateDiscount(
    Number(product?.price ?? 0),
    Number(product?.discount_price ?? 0),
  );

  const isOutOfStock = isOutOfStockProduct(product);
  const maxStock = Math.max(1, product?.stock_quantity ?? 0);

  const syncQtyWithinStock = useCallback(
    (value: number, options?: { showLimitToast?: boolean }) => {
      if (isOutOfStock) {
        setQty(1);
        setQtyInput("1");
        return 1;
      }

      const normalized = Math.min(Math.max(1, value), maxStock);

      if (options?.showLimitToast && value > maxStock) {
        showToast(`Bạn chỉ có thể chọn tối đa ${maxStock} sản phẩm`, "info");
      }

      setQty(normalized);
      setQtyInput(String(normalized));
      return normalized;
    },
    [isOutOfStock, maxStock, showToast],
  );

  const handleQtyInputChange = useCallback(
    (value: string) => {
      const sanitizedValue = value.replace(/[^0-9]/g, "");
      setQtyInput(sanitizedValue);

      if (!sanitizedValue) {
        return;
      }

      const parsedQty = Number(sanitizedValue);
      if (Number.isNaN(parsedQty)) {
        return;
      }

      syncQtyWithinStock(parsedQty, { showLimitToast: parsedQty > maxStock });
    },
    [maxStock, syncQtyWithinStock],
  );

  const handleQtyInputBlur = useCallback(() => {
    if (!qtyInput) {
      syncQtyWithinStock(1);
      return;
    }

    const parsedQty = Number(qtyInput);
    if (Number.isNaN(parsedQty) || parsedQty <= 0) {
      syncQtyWithinStock(1);
      return;
    }

    syncQtyWithinStock(parsedQty, { showLimitToast: parsedQty > maxStock });
  }, [maxStock, qtyInput, syncQtyWithinStock]);

  const handleAdd = async () => {
    if (!product) {
      showToast("Không tìm thấy thông tin sản phẩm", "error");
      return;
    }

    if (isOutOfStock) {
      showToast("Sản phẩm đã hết hàng!", "error");
      return;
    }

    if (isAddingToCart) {
      return;
    }

    try {
      setIsAddingToCart(true);
      await checkBeforeAddToCart(product.id, qty);

      const itemToAdd: CartItem = {
        id: product.id,
        name: product.name,
        price: Number(product.discount_price || product.price),
        image: product.image,
        unit: product.unit,
        quantity: qty,
      };

      await addToCart(itemToAdd);
      showToast(`Đã thêm ${product.name} vào giỏ hàng`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        showLoginRequireAlert();
        return;
      }

      showToast(
        getAddToCartErrorMessage(error, "Không thể thêm vào giỏ hàng"),
        "error",
      );
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleToggleReviewForm = useCallback(() => {
    if (!isLoggedIn) {
      showLoginRequireAlert();
      return;
    }

    if (!product) {
      showToast("Không tìm thấy sản phẩm để đánh giá", "error");
      return;
    }

    if (!canReviewProduct) {
      showToast(reviewEligibilityMessage, "info");
      return;
    }

    if (myReview) {
      setShowAllReviews(true);
      showToast("Bạn đã đánh giá sản phẩm này. Hãy vào màn hình đánh giá để cập nhật nếu cần.", "info");
      return;
    }

    router.push({
      pathname: "/review/[id]",
      params: { id: String(product.id) },
    } as any);
  }, [
    canReviewProduct,
    isLoggedIn,
    myReview,
    product,
    reviewEligibilityMessage,
    router,
    showToast,
  ]);

  const handleSubmitReview = useCallback(async () => {
    if (!product) {
      showToast("Không tìm thấy sản phẩm để đánh giá", "error");
      return;
    }

    if (!isLoggedIn) {
      showLoginRequireAlert();
      return;
    }

    if (!canReviewProduct) {
      showToast(reviewEligibilityMessage, "info");
      setShowReviewForm(false);
      return;
    }

    if (!reviewComment.trim()) {
      showToast("Vui lòng nhập nội dung đánh giá", "info");
      return;
    }

    if (myReview) {
      showToast("Bạn đã đánh giá sản phẩm này và không thể chỉnh sửa.", "info");
      setShowReviewForm(false);
      return;
    }

    try {
      setIsSubmittingReview(true);
      const normalizedComment = reviewComment.trim();
      const payload = {
        product: product.id,
        rating: clampReviewRating(reviewRating),
        comment: normalizedComment || undefined,
      };
      const savedReview = await reviewService.createReview(payload);

      setReviews((currentReviews) => {
        const nextReviews = [savedReview, ...currentReviews];

        return nextReviews.sort((firstReview, secondReview) => {
          const secondTime = Date.parse(secondReview.created_at || "") || 0;
          const firstTime = Date.parse(firstReview.created_at || "") || 0;
          return secondTime - firstTime;
        });
      });
      setReviewComment("");
      setReviewRating(5);
      setReviewError(null);
      setShowReviewForm(false);
      showToast("Đã gửi đánh giá thành công", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Không thể gửi đánh giá lúc này",
        "error",
      );
    } finally {
      setIsSubmittingReview(false);
    }
  }, [
    canReviewProduct,
    isLoggedIn,
    myReview,
    product,
    reviewComment,
    reviewEligibilityMessage,
    reviewRating,
    showToast,
  ]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: "center", marginTop: 100 }}>
          Sản phẩm không tồn tại
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Toast */}
      <InlineToast message={toastMsg} visible={toastVisible} type={toastType} />

      {/* Header nav */}
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.topBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Chi tiết sản phẩm</Text>
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => router.push("/cart" as any)}
        >
          <Ionicons name="cart-outline" size={22} color={Colors.textPrimary} />
          {getTotalItems > 0 && (
            <View style={styles.badgeTopBar}>
              <Text style={styles.badgeTopBarText}>
                {getTotalItems > 99 ? "99+" : getTotalItems}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Product Image */}
        <View style={styles.imageArea}>
          <Image
            source={{ uri: getImageUrl(product.image) }}
            style={styles.mainImage}
            resizeMode="contain"
          />
          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discount}%</Text>
            </View>
          )}
        </View>

        {/* Product Info */}
        <View style={styles.infoCard}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>
              {product.category_name?.toUpperCase() || "SẢN PHẨM"}
            </Text>
          </View>
          <Text style={styles.productName}>{product.name}</Text>

          {/* Stock */}
          <View style={styles.ratingLine}>
            <Ionicons
              name="cube-outline"
              size={14}
              color={isOutOfStock ? Colors.error : Colors.primary}
            />
            <Text
              style={[
                styles.stockText,
                isOutOfStock && { color: Colors.error },
              ]}
            >
              {isOutOfStock
                ? "Ngừng bán • Hết hàng"
                : getInventoryHeadline(product)}
            </Text>
          </View>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {formatCurrency(Number(product.discount_price || product.price))}
            </Text>
            {product.discount_price && (
              <Text style={styles.originalPrice}>
                {formatCurrency(Number(product.price))}
              </Text>
            )}
          </View>

          {/* Quantity selector */}
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>Số lượng</Text>
            <View style={styles.qtyControls}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => syncQtyWithinStock(qty - 1)}
                disabled={qty <= 1}
              >
                <Ionicons name="remove" size={18} color={Colors.textPrimary} />
              </TouchableOpacity>

              <TextInput
                style={styles.qtyInput}
                value={qtyInput}
                onChangeText={handleQtyInputChange}
                onBlur={handleQtyInputBlur}
                keyboardType="number-pad"
                returnKeyType="done"
                textAlign="center"
                editable={!isOutOfStock}
                selectTextOnFocus
                maxLength={3}
              />

              <TouchableOpacity
                style={[
                  styles.qtyBtn,
                  styles.qtyBtnPlus,
                  (isOutOfStock || qty >= (product.stock_quantity || 0)) &&
                    styles.qtyBtnDisabled,
                ]}
                onPress={() => {
                  if (isOutOfStock) {
                    showToast("Sản phẩm đã hết hàng", "error");
                    return;
                  }

                  if (qty >= (product.stock_quantity || 0)) {
                    showToast(
                      `Bạn chỉ có thể chọn tối đa ${product.stock_quantity} sản phẩm`,
                      "info",
                    );
                    return;
                  }

                  syncQtyWithinStock(qty + 1);
                }}
                disabled={isOutOfStock || qty >= (product.stock_quantity || 0)}
              >
                <Ionicons name="add" size={18} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.descCard}>
          <Text style={styles.sectionTitle}>Thông tin sản phẩm</Text>
          <Text
            style={styles.descText}
            numberOfLines={isExpanded ? undefined : 3}
          >
            {product.description}
          </Text>

          {typeof product.description === "string" &&
            product.description.length > 150 && (
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => setIsExpanded(!isExpanded)}
              >
                <Text style={styles.expandBtnText}>
                  {isExpanded ? "Thu gọn" : "Xem thêm"}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={Colors.primary}
                />
              </TouchableOpacity>
            )}
        </View>

        {/* Đánh giá */}
        <ProductReviewsSection
          reviews={reviews}
          isLoading={isLoadingReviews}
          error={reviewError}
          isLoggedIn={isLoggedIn}
          canReview={canReviewProduct}
          reviewEligibilityMessage={reviewEligibilityMessage}
          myReview={myReview}
          viewerDisplayName={viewerDisplayName}
          viewerAvatarUrl={viewerAvatarUrl}
          showReviewForm={showReviewForm}
          showAllReviews={showAllReviews}
          draftRating={reviewRating}
          draftComment={reviewComment}
          isSubmitting={isSubmittingReview}
          onToggleShowAll={() => setShowAllReviews((current) => !current)}
          onToggleForm={handleToggleReviewForm}
          onSelectRating={(rating) => setReviewRating(clampReviewRating(rating))}
          onChangeComment={setReviewComment}
          onSubmitReview={() => void handleSubmitReview()}
          onLoginRequired={showLoginRequireAlert}
          onOpenGallery={(mediaItems, startIndex) => {
            const items: GalleryMediaItem[] = mediaItems.map((m) => ({
              id: m.id,
              url: getImageUrl(m.file_url),
              type: m.media_type,
            }));
            setGalleryItems(items);
            setGalleryInitialIndex(startIndex);
            setGalleryVisible(true);
          }}
        />

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Text style={styles.sectionTitle}>Sản phẩm liên quan</Text>
              <Text style={styles.relatedCountText}>
                {relatedProducts.length} sản phẩm
              </Text>
            </View>
            <FlatList
              data={relatedProducts}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: Spacing.sm }}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }) => {
                const itemDiscount = calculateDiscount(
                  Number(item.price),
                  Number(item.discount_price),
                );
                const itemOutOfStock = (item.stock_quantity ?? 0) <= 0;

                return (
                  <TouchableOpacity
                    style={styles.relatedCardOuter}
                    onPress={() => router.push(`/product/${item.id}` as any)}
                    activeOpacity={0.65}
                  >
                    <View style={styles.relatedCardInner}>
                      {/* Ảnh sản phẩm */}
                      <Image
                        source={{ uri: getImageUrl(item.image) }}
                        style={styles.relatedImg}
                        resizeMode="cover"
                      />

                      {/* Badge giảm giá */}
                      {itemDiscount > 0 && (
                        <View style={styles.relatedBadge}>
                          <Text style={styles.relatedBadgeText}>
                            -{itemDiscount}%
                          </Text>
                        </View>
                      )}

                      {/* Overlay hết hàng */}
                      {itemOutOfStock && (
                        <View style={styles.relatedOutOfStock}>
                          <Text style={styles.relatedOutOfStockText}>
                            Hết hàng
                          </Text>
                        </View>
                      )}

                      {/* Info */}
                      <View style={styles.relatedInfo}>
                        <Text style={styles.relatedName} numberOfLines={2}>
                          {item.name}
                        </Text>

                        {/* Stock */}
                        <Text
                          style={[
                            styles.relatedStock,
                            itemOutOfStock && styles.relatedStockOut,
                          ]}
                        >
                          {itemOutOfStock
                            ? "Hết hàng"
                            : `Còn ${item.stock_quantity} ${item.unit || "sp"}`}
                        </Text>

                        {/* Giá */}
                        <View style={styles.relatedPriceRow}>
                          <Text style={styles.relatedPrice}>
                            {formatCurrency(
                              Number(item.discount_price || item.price),
                            )}
                          </Text>
                          {item.discount_price && (
                            <Text style={styles.relatedOriginal}>
                              {formatCurrency(Number(item.price))}
                            </Text>
                          )}
                        </View>

                        {/* Nút MUA */}
                        <TouchableOpacity
                          style={[
                            styles.relatedBuyBtn,
                            itemOutOfStock && styles.relatedBuyBtnDisabled,
                          ]}
                          disabled={itemOutOfStock}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push(`/product/${item.id}` as any);
                          }}
                          activeOpacity={0.65}
                        >
                          <Text
                            style={[
                              styles.relatedBuyText,
                              itemOutOfStock && styles.relatedBuyTextDisabled,
                            ]}
                          >
                            MUA
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
              keyExtractor={(item) => item.id.toString()}
            />
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom bar — chỉ còn nút Thêm vào giỏ */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.addToCartBtn,
            (isOutOfStock || isAddingToCart) && styles.addToCartBtnDisabled,
          ]}
          onPress={handleAdd}
          disabled={isOutOfStock || isAddingToCart}
          activeOpacity={0.75}
        >
          {isAddingToCart ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Ionicons name="bag-add-outline" size={22} color={Colors.white} />
          )}
          <Text style={styles.addToCartText}>
            {isOutOfStock
              ? "Hết hàng"
              : isAddingToCart
                ? "Đang thêm vào giỏ..."
                : "Thêm vào giỏ"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Media gallery viewer — Shopee-style fullscreen */}
      <MediaGalleryViewer
        visible={galleryVisible}
        items={galleryItems}
        initialIndex={galleryInitialIndex}
        onClose={() => setGalleryVisible(false)}
      />
    </View>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.base,
    backgroundColor: Colors.white,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: {
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  badgeTopBar: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: Colors.error,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeTopBarText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: "700",
  },

  // Image
  imageArea: {
    width: "100%",
    height: width * 0.7,
    backgroundColor: Colors.white,
    justifyContent: "center",
    alignItems: "center",
  },
  mainImage: {
    width: "100%",
    height: "100%",
  },
  discountBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: Colors.secondary,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  discountText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.white,
  },

  // Info
  infoCard: {
    backgroundColor: Colors.white,
    padding: Spacing.base,
    marginTop: 2,
  },
  categoryBadge: {
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  categoryBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  productName: {
    fontSize: FontSize.xxl,
    fontWeight: "700",
    color: Colors.textPrimary,
    lineHeight: 30,
  },
  ratingLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  stockText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.primary,
    marginLeft: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
  },
  price: { fontSize: 26, fontWeight: "700", color: Colors.textPrice },
  originalPrice: {
    fontSize: FontSize.md,
    color: Colors.textLight,
    textDecorationLine: "line-through",
    marginLeft: Spacing.md,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  qtyLabel: {
    fontSize: FontSize.base,
    fontWeight: "500",
    color: Colors.textPrimary,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qtyBtnPlus: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  qtyBtnDisabled: {
    backgroundColor: Colors.textLight,
    borderColor: Colors.textLight,
    opacity: 0.6,
  },
  qtyInput: {
    width: 48,
    height: 32,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 9,
    backgroundColor: Colors.white,
    fontSize: FontSize.base,
    fontWeight: "600",
    color: Colors.textPrimary,
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  descCard: {
    backgroundColor: Colors.white,
    padding: Spacing.base,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  descText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  expandBtnText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.primary,
    marginRight: 4,
  },

  // ========== Rating Section ==========
  ratingSection: {
    backgroundColor: Colors.white,
    padding: Spacing.base,
    marginTop: Spacing.sm,
  },
  ratingSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  viewAllText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.primary,
  },
  ratingBody: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  ratingOverview: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  },
  ratingBigNumber: {
    fontSize: 36,
    fontWeight: "800",
    color: Colors.textPrimary,
    lineHeight: 42,
  },
  ratingStarsRow: {
    flexDirection: "row",
    gap: 2,
    marginTop: 4,
  },
  ratingCountText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  ratingDistribution: {
    flex: 1,
    gap: 6,
  },
  ratingBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingBarLabel: {
    fontSize: FontSize.xs,
    fontWeight: "600",
    color: Colors.textPrimary,
    width: 12,
    textAlign: "center",
  },
  ratingBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F0F0F0",
    overflow: "hidden",
  },
  ratingBarFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: Colors.star,
  },
  ratingBarPercent: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    width: 24,
    textAlign: "right",
  },
  ratingEmptyWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  ratingEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.textLight,
    fontStyle: "italic",
  },
  reviewActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  reviewActionHint: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  reviewOwnLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.primary,
  },
  reviewActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primarySurface,
  },
  reviewActionButtonDisabled: {
    opacity: 0.55,
  },
  reviewActionButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.primary,
  },
  reviewFormCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  reviewFormTitle: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  reviewStarPicker: {
    flexDirection: "row",
    gap: 10,
    marginBottom: Spacing.md,
  },
  reviewCommentInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  reviewInputHint: {
    marginTop: Spacing.sm,
    fontSize: FontSize.xs,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
  reviewSubmitButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  reviewSubmitButtonDisabled: {
    opacity: 0.6,
  },
  reviewSubmitButtonText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.white,
  },
  reviewList: {
    gap: 12,
    marginTop: Spacing.md,
  },
  reviewItem: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  reviewItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primarySurface,
  },
  reviewMeta: {
    flex: 1,
  },
  reviewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  reviewMiniStars: {
    flexDirection: "row",
    gap: 2,
  },
  reviewAuthor: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  reviewDate: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
  },
  reviewComment: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  reviewCommentEmpty: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textLight,
    fontStyle: "italic",
  },
  reviewMediaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: Spacing.md,
  },
  reviewMediaCard: {
    width: "47%",
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: "#EEF3FF",
    borderWidth: 1,
    borderColor: "#DDE7FF",
    position: "relative",
  },
  reviewMediaImage: {
    width: "100%",
    height: 120,
    backgroundColor: "#DCE6FF",
  },
  reviewMediaVideoThumb: {
    width: "100%",
    height: 120,
    position: "relative",
  },
  reviewMediaPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },

  reviewMediaBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: "rgba(15, 23, 42, 0.78)",
  },
  reviewMediaBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.white,
  },
  shopReplyCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1,
    borderColor: "#D7E5FF",
    gap: Spacing.sm,
  },
  shopReplyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.sm,
  },
  shopReplyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shopReplyBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.primary,
  },
  shopReplyDate: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  shopReplyText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.textPrimary,
  },

  // ========== Related (Đồng bộ với ProductCard) ==========
  relatedSection: {
    backgroundColor: Colors.white,
    padding: Spacing.base,
    marginTop: Spacing.sm,
  },
  relatedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  relatedCountText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  relatedCardOuter: {
    width: 160,
    padding: 5,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.03)",
  },
  relatedCardInner: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    overflow: "hidden",
    ...Shadow.small,
  },
  relatedImg: {
    width: "100%",
    height: 120,
    backgroundColor: "#FDFBF7",
  },
  relatedBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#EF4444",
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  relatedBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  relatedOutOfStock: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: "rgba(255,255,255,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  relatedOutOfStockText: {
    color: "#111827",
    fontSize: FontSize.sm,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  relatedInfo: {
    padding: 10,
  },
  relatedName: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: "#111827",
    lineHeight: 18,
    height: 36,
  },
  relatedStock: {
    fontSize: 10,
    color: "#059669",
    fontWeight: "600",
    marginTop: 3,
  },
  relatedStockOut: {
    color: "#EF4444",
  },
  relatedPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  relatedPrice: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: "#064E3B",
    letterSpacing: -0.3,
  },
  relatedOriginal: {
    fontSize: 10,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    marginLeft: 6,
  },
  relatedBuyBtn: {
    backgroundColor: "#064E3B",
    borderRadius: Radius.md,
    paddingVertical: 6,
    alignItems: "center",
    marginTop: 8,
  },
  relatedBuyBtnDisabled: {
    backgroundColor: "#F3F4F6",
  },
  relatedBuyText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  relatedBuyTextDisabled: {
    color: "#9CA3AF",
  },

  // ========== Bottom bar ==========
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    padding: Spacing.base,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    ...Shadow.large,
  },
  addToCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    gap: 10,
    ...Shadow.medium,
  },
  addToCartText: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.white,
  },
  addToCartBtnDisabled: {
    backgroundColor: Colors.border,
  },
});


