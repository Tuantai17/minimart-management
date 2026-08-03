import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import AppHeader from "../../src/components/common/AppHeader";
import InlineVideoPlayer from "../../src/components/common/InlineVideoPlayer";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../src/constants";
import { getApiErrorMessage } from "../../src/services/api/api-error";
import { orderService } from "../../src/services/order.service";
import { productService } from "../../src/services/product.service";
import { reviewService } from "../../src/services/review.service";
import { useAuthStore } from "../../src/store/auth.store";
import type {
    Product,
    ProductReview,
    ProductReviewMedia,
    ReviewMediaUploadPayload,
} from "../../src/types";
import type { OrderResponse } from "../../src/types/order.type";
import {
    findReviewByCurrentUser,
    getCurrentReviewerAvatarUrl,
    getCurrentReviewerDisplayName,
    getImageUrl,
} from "../../src/utils";

const PAGE_ACCENT = "#2F6BFF";
const PAGE_BG = "#F6F7FB";
const CARD_BORDER = "#ECEDF4";
const INPUT_BG = "#F3F4F8";
const DASHED_BORDER = "#D9DEEE";
const MAX_IMAGE_COUNT = 5;
const MAX_VIDEO_COUNT = 1;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

type PendingMediaItem = ReviewMediaUploadPayload & {
  id: string;
  mediaType: "image" | "video";
  fileSize?: number | null;
};

const RATING_LABELS: Record<number, string> = {
  1: "Rất tệ",
  2: "Chưa tốt",
  3: "Ổn",
  4: "Hài lòng",
  5: "Tuyệt vời",
};

const clampReviewRating = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 5;
  }

  return Math.max(1, Math.min(5, Math.round(value)));
};

const normalizeParam = (value?: string | string[]): string =>
  Array.isArray(value) ? value[0] || "" : value || "";

const isVideoAsset = (mimeType?: string | null): boolean =>
  typeof mimeType === "string" && mimeType.toLowerCase().startsWith("video/");

const formatFileSize = (sizeInBytes: number): string => {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return "0 MB";
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getSelectedMediaSummary = (items: PendingMediaItem[]) => {
  const imageCount = items.filter((item) => item.mediaType === "image").length;
  const videoCount = items.filter((item) => item.mediaType === "video").length;

  return {
    imageCount,
    videoCount,
  };
};

const getMediaPreviewCounterLabel = (items: PendingMediaItem[]) => {
  const { imageCount, videoCount } = getSelectedMediaSummary(items);
  return `${imageCount}/${MAX_IMAGE_COUNT} ảnh • ${videoCount}/${MAX_VIDEO_COUNT} video`;
};

const getMediaPickerHintText = () =>
  `Tối đa ${MAX_IMAGE_COUNT} ảnh (≤ 5MB/ảnh) và ${MAX_VIDEO_COUNT} video (≤ 50MB/video).`;

const getPendingMediaLabel = (item: PendingMediaItem): string =>
  item.mediaType === "video" ? "Video" : "Ảnh";

const getMediaPreviewUrl = (item: ProductReviewMedia): string =>
  getImageUrl(item.file_url);

function ReviewMediaPreview({
  uri,
  mediaType,
}: {
  uri: string;
  mediaType: "image" | "video";
}) {
  if (mediaType === "video") {
    return <InlineVideoPlayer uri={uri} height={132} />;
  }

  return <Image source={{ uri }} style={styles.mediaPreview} />;
}

export default function ReviewProductScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string | string[];
    quantity?: string | string[];
    orderId?: string | string[];
  }>();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  const productId = Number(normalizeParam(params.id));

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<PendingMediaItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [purchasedQuantity, setPurchasedQuantity] = useState(0);
  const [canReviewProduct, setCanReviewProduct] = useState(false);
  const [reviewEligibilityMessage, setReviewEligibilityMessage] = useState(
    "Chỉ khách đã mua sản phẩm trong đơn hoàn thành mới có thể đánh giá.",
  );
  const [successProductId, setSuccessProductId] = useState<number | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState(
    "Cảm ơn bạn đã chia sẻ nhận xét.",
  );

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

  const displayRating = myReview ? clampReviewRating(myReview.rating) : rating;
  const displayComment = myReview?.comment ?? comment;
  const displayMedia = myReview?.media ?? [];
  const ratingLabel = RATING_LABELS[displayRating] || RATING_LABELS[5];

  const normalizeOrderStatus = useCallback((status?: string | null) => {
    const normalized = (status || "").trim().toUpperCase();

    if (normalized === "DELIVERED") {
      return "COMPLETED";
    }

    return normalized;
  }, []);

  const getPurchasedOrderItem = useCallback(
    (orders: OrderResponse[], currentProductId: number) => {
      return orders
        .filter((order) => normalizeOrderStatus(order.status) === "COMPLETED")
        .flatMap((order) => order.items || [])
        .find((item) => item.product === currentProductId);
    },
    [normalizeOrderStatus],
  );

  const fetchData = useCallback(async () => {
    if (!Number.isFinite(productId) || productId <= 0) {
      setError("Không tìm thấy sản phẩm để đánh giá.");
      setLoading(false);
      return;
    }

    if (!isLoggedIn) {
      setError("Vui lòng đăng nhập để đánh giá sản phẩm.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [productData, reviewList, myOrders] = await Promise.all([
        productService.getById(productId),
        reviewService.getByProduct(productId),
        orderService.getMyOrders(),
      ]);

      const purchasedOrderItem = getPurchasedOrderItem(myOrders, productId);

      setProduct(productData);
      setReviews(reviewList);

      if (purchasedOrderItem) {
        setPurchasedQuantity(Math.max(1, purchasedOrderItem.quantity || 1));
        setCanReviewProduct(true);
        setReviewEligibilityMessage("Bạn có thể đánh giá sản phẩm này.");
      } else {
        setPurchasedQuantity(0);
        setCanReviewProduct(false);
        setReviewEligibilityMessage(
          "Chỉ khách đã mua sản phẩm trong đơn hoàn thành mới có thể đánh giá.",
        );
      }
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err, "Không thể tải dữ liệu đánh giá sản phẩm."),
      );
    } finally {
      setLoading(false);
    }
  }, [getPurchasedOrderItem, isLoggedIn, productId]);

  useEffect(() => {
    setReviews([]);
    setRating(5);
    setComment("");
    setSelectedMedia([]);
    setError(null);
    setSuccessProductId(null);
    setPurchasedQuantity(0);
    setCanReviewProduct(false);
    setReviewEligibilityMessage(
      "Chỉ khách đã mua sản phẩm trong đơn hoàn thành mới có thể đánh giá.",
    );
    void fetchData();
  }, [fetchData]);

  const handleSelectRating = useCallback(
    (value: number) => {
      if (myReview || !canReviewProduct) {
        return;
      }

      setRating(clampReviewRating(value));
    },
    [canReviewProduct, myReview],
  );

  const handlePressUpload = useCallback(async () => {
    if (myReview) {
      Alert.alert(
        "Đã có đánh giá",
        "Review hiện tại đã được tạo. Nếu cần thêm hoặc xóa media, hãy dùng luồng chỉnh sửa review ở bước tiếp theo.",
      );
      return;
    }

    if (!canReviewProduct) {
      Alert.alert("Chưa đủ điều kiện", reviewEligibilityMessage);
      return;
    }

    const currentSummary = getSelectedMediaSummary(selectedMedia);

    if (
      currentSummary.imageCount >= MAX_IMAGE_COUNT &&
      currentSummary.videoCount >= MAX_VIDEO_COUNT
    ) {
      Alert.alert(
        "Đã đạt giới hạn",
        `Bạn chỉ có thể chọn tối đa ${MAX_IMAGE_COUNT} ảnh và ${MAX_VIDEO_COUNT} video cho một đánh giá.`,
      );
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Quyền truy cập bị từ chối",
        "Vui lòng cấp quyền thư viện để chọn ảnh hoặc video cho đánh giá.",
      );
      return;
    }

    const remainingSlots =
      MAX_IMAGE_COUNT -
      currentSummary.imageCount +
      (MAX_VIDEO_COUNT - currentSummary.videoCount);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(remainingSlots, 1),
      quality: 1,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const nextItems: PendingMediaItem[] = [];
    let nextImageCount = currentSummary.imageCount;
    let nextVideoCount = currentSummary.videoCount;

    for (const [index, asset] of result.assets.entries()) {
      const mediaType =
        asset.type === "video" || isVideoAsset(asset.mimeType)
          ? "video"
          : "image";
      const extension = mediaType === "video" ? "mp4" : "jpg";
      const webFile =
        Platform.OS === "web" && "file" in asset
          ? ((asset as any).file as File | null)
          : null;
      const fileSize =
        typeof asset.fileSize === "number"
          ? asset.fileSize
          : typeof webFile?.size === "number"
            ? webFile.size
            : null;
      const maxAllowedSize =
        mediaType === "video" ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;

      if (mediaType === "image" && nextImageCount >= MAX_IMAGE_COUNT) {
        Alert.alert(
          "Vượt quá số lượng ảnh",
          `Mỗi đánh giá chỉ được tối đa ${MAX_IMAGE_COUNT} ảnh.`,
        );
        continue;
      }

      if (mediaType === "video" && nextVideoCount >= MAX_VIDEO_COUNT) {
        Alert.alert(
          "Vượt quá số lượng video",
          `Mỗi đánh giá chỉ được tối đa ${MAX_VIDEO_COUNT} video.`,
        );
        continue;
      }

      if (typeof fileSize === "number" && fileSize > maxAllowedSize) {
        Alert.alert(
          "Tệp vượt quá dung lượng cho phép",
          mediaType === "video"
            ? `Video ${asset.fileName || "đã chọn"} có dung lượng ${formatFileSize(fileSize)}. Giới hạn tối đa là 50 MB.`
            : `Ảnh ${asset.fileName || "đã chọn"} có dung lượng ${formatFileSize(fileSize)}. Giới hạn tối đa là 5 MB.`,
        );
        continue;
      }

      nextItems.push({
        id: `${Date.now()}-${index}-${asset.assetId || asset.fileName || "media"}`,
        uri: asset.uri,
        name:
          asset.fileName ||
          webFile?.name ||
          `review-${Date.now()}-${index}.${extension}`,
        mimeType:
          asset.mimeType ||
          webFile?.type ||
          (mediaType === "video" ? "video/mp4" : "image/jpeg"),
        file: webFile,
        mediaType,
        fileSize,
      });

      if (mediaType === "video") {
        nextVideoCount += 1;
      } else {
        nextImageCount += 1;
      }
    }

    if (nextItems.length === 0) {
      return;
    }

    setSelectedMedia((prev) => [...prev, ...nextItems]);
  }, [canReviewProduct, myReview, reviewEligibilityMessage, selectedMedia]);

  const handleRemovePendingMedia = useCallback((mediaId: string) => {
    setSelectedMedia((prev) => prev.filter((item) => item.id !== mediaId));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isLoggedIn) {
      Alert.alert("Cần đăng nhập", "Vui lòng đăng nhập để gửi đánh giá.");
      return;
    }

    if (!product) {
      Alert.alert("Thiếu dữ liệu", "Không tìm thấy sản phẩm để đánh giá.");
      return;
    }

    if (!canReviewProduct) {
      Alert.alert("Chưa đủ điều kiện", reviewEligibilityMessage);
      return;
    }

    if (myReview) {
      Alert.alert(
        "Đã đánh giá",
        "Bạn đã đánh giá sản phẩm này rồi. Bạn có thể cập nhật lại đánh giá ở bước tiếp theo khi FE mở form chỉnh sửa.",
      );
      return;
    }

    const trimmedComment = comment.trim();

    try {
      setIsSubmitting(true);
      const createdReview = await reviewService.createReview({
        product: product.id,
        rating: clampReviewRating(rating),
        comment: trimmedComment || undefined,
      });

      let finalReview: ProductReview = {
        ...createdReview,
        full_name: createdReview.full_name || viewerDisplayName || null,
        user_name:
          createdReview.user_name || user?.name || user?.full_name || null,
        username:
          createdReview.username || user?.username || user?.email || null,
        avatar_url: createdReview.avatar_url || viewerAvatarUrl || null,
        reviewer_name: createdReview.reviewer_name || viewerDisplayName || null,
        reviewer_avatar:
          createdReview.reviewer_avatar || viewerAvatarUrl || null,
        media: createdReview.media || [],
      };

      let successMessage = "Đã gửi đánh giá thành công.";

      if (selectedMedia.length > 0) {
        try {
          const uploadedReview = await reviewService.uploadReviewMedia(
            createdReview.id,
            selectedMedia.map(({ id, mediaType, ...payload }) => payload),
          );

          finalReview = {
            ...finalReview,
            ...uploadedReview,
            full_name: uploadedReview.full_name || finalReview.full_name,
            user_name: uploadedReview.user_name || finalReview.user_name,
            username: uploadedReview.username || finalReview.username,
            avatar_url: uploadedReview.avatar_url || finalReview.avatar_url,
            reviewer_name:
              uploadedReview.reviewer_name || finalReview.reviewer_name,
            reviewer_avatar:
              uploadedReview.reviewer_avatar || finalReview.reviewer_avatar,
            media: uploadedReview.media || [],
          };
          successMessage = "Đã gửi đánh giá kèm media thành công.";
        } catch (mediaError: unknown) {
          successMessage =
            "Đã tạo đánh giá nhưng tải media chưa thành công. Bạn có thể thử thêm media lại sau.";
          Alert.alert(
            "Upload media chưa thành công",
            getApiErrorMessage(
              mediaError,
              "Review đã được tạo nhưng media chưa được tải lên. Vui lòng thử lại sau.",
            ),
          );
        }
      }

      setReviews((prev) => [finalReview, ...prev]);
      setSelectedMedia([]);
      setSubmitSuccessMessage(successMessage);
      setSuccessProductId(product.id);
    } catch (err: unknown) {
      Alert.alert(
        "Gửi thất bại",
        getApiErrorMessage(err, "Không thể gửi đánh giá. Vui lòng thử lại."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canReviewProduct,
    comment,
    isLoggedIn,
    myReview,
    product,
    rating,
    reviewEligibilityMessage,
    selectedMedia,
    user?.email,
    user?.full_name,
    user?.name,
    user?.username,
    viewerAvatarUrl,
    viewerDisplayName,
  ]);

  useEffect(() => {
    if (successProductId == null) return;
    const timer = setTimeout(() => {
      router.replace({
        pathname: "/product/[id]",
        params: { id: String(successProductId), reviewSuccess: "1" },
      } as any);
    }, 2500);
    return () => clearTimeout(timer);
  }, [successProductId, router]);

  if (successProductId != null) {
    return (
      <View style={styles.container}>
        <AppHeader title="Đánh giá sản phẩm" showBack />
        <View style={styles.centerState}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark-circle" size={72} color="#22C55E" />
          </View>
          <Text style={styles.successTitle}>Đánh giá thành công! 🎉</Text>
          <Text style={styles.successSubtitle}>
            {submitSuccessMessage}
            {"\n"}
            Đang chuyển đến trang sản phẩm...
          </Text>

          <TouchableOpacity
            style={styles.successButton}
            activeOpacity={0.85}
            onPress={() =>
              router.replace({
                pathname: "/product/[id]",
                params: { id: String(successProductId), reviewSuccess: "1" },
              } as any)
            }
          >
            <Ionicons name="eye-outline" size={20} color={Colors.white} />
            <Text style={styles.successButtonText}>Xem sản phẩm ngay</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader title="Đánh giá sản phẩm" showBack />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={PAGE_ACCENT} />
          <Text style={styles.stateText}>Đang tải sản phẩm...</Text>
        </View>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.container}>
        <AppHeader title="Đánh giá sản phẩm" showBack />
        <View style={styles.centerState}>
          <Ionicons
            name="alert-circle-outline"
            size={56}
            color={Colors.error}
          />
          <Text style={styles.errorText}>
            {error || "Không tìm thấy sản phẩm."}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void fetchData()}
          >
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title="Đánh giá sản phẩm" showBack />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.productCardRow}>
              <Image
                source={{ uri: getImageUrl(product.image) }}
                style={styles.productImage}
                resizeMode="contain"
              />

              <View style={styles.productMeta}>
                <Text style={styles.productName} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={styles.productQuantity}>
                  {canReviewProduct
                    ? `Số lượng đã mua: x${purchasedQuantity}`
                    : "Bạn chưa có đơn hoàn thành chứa sản phẩm này"}
                </Text>

                <View style={styles.purchasedBadge}>
                  <Ionicons
                    name={
                      canReviewProduct
                        ? "checkmark-circle"
                        : "alert-circle-outline"
                    }
                    size={16}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.purchasedBadgeText}>
                    {canReviewProduct
                      ? "ĐỦ ĐIỀU KIỆN ĐÁNH GIÁ"
                      : "CHƯA ĐỦ ĐIỀU KIỆN"}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitleCentered}>Chất lượng sản phẩm</Text>

            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleSelectRating(star)}
                  activeOpacity={0.82}
                  disabled={Boolean(myReview) || !canReviewProduct}
                  style={styles.starButton}
                >
                  <Ionicons
                    name={displayRating >= star ? "star" : "star-outline"}
                    size={42}
                    color={Colors.star}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.ratingLabel}>{ratingLabel}</Text>

            {myReview ? (
              <Text style={styles.reviewLockedText}>
                Bạn đã đánh giá sản phẩm này rồi.
              </Text>
            ) : !canReviewProduct ? (
              <Text style={styles.reviewLockedText}>
                {reviewEligibilityMessage}
              </Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Nhận xét của bạn</Text>

            <View style={styles.textAreaWrap}>
              <TextInput
                value={displayComment}
                onChangeText={setComment}
                editable={!myReview && canReviewProduct}
                multiline
                maxLength={500}
                placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm..."
                placeholderTextColor="#B1B4C4"
                style={styles.textArea}
                textAlignVertical="top"
              />
              <Text style={styles.inputHint}>
                Nhận xét là tùy chọn, bạn có thể chỉ chọn số sao.
              </Text>
              <Text style={styles.charCount}>{displayComment.length}/500</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.uploadCard}
            onPress={() => void handlePressUpload()}
            activeOpacity={0.82}
            disabled={Boolean(myReview) || !canReviewProduct}
          >
            <View style={styles.uploadIconWrap}>
              <Ionicons name="camera" size={28} color={PAGE_ACCENT} />
              <View style={styles.uploadPlusBadge}>
                <Ionicons name="add" size={12} color={Colors.white} />
              </View>
            </View>
            <Text style={styles.uploadTitle}>Thêm hình ảnh/video</Text>
            <Text style={styles.uploadHint}>{getMediaPickerHintText()}</Text>
          </TouchableOpacity>

          {selectedMedia.length > 0 ? (
            <View style={styles.card}>
              <View style={styles.mediaSectionHeader}>
                <Text style={styles.sectionTitle}>
                  Media sẽ gửi cùng review
                </Text>
                <Text style={styles.mediaCountText}>
                  {getMediaPreviewCounterLabel(selectedMedia)}
                </Text>
              </View>

              <View style={styles.mediaGrid}>
                {selectedMedia.map((item) => (
                  <View key={item.id} style={styles.mediaCard}>
                    <ReviewMediaPreview
                      uri={item.uri}
                      mediaType={item.mediaType}
                    />
                    {item.mediaType === "video" ? (
                      <View style={styles.videoBadge}>
                        <Ionicons
                          name="videocam"
                          size={12}
                          color={Colors.white}
                        />
                        <Text style={styles.videoBadgeText}>Video</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={styles.removeMediaButton}
                      onPress={() => handleRemovePendingMedia(item.id)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="close" size={16} color={Colors.white} />
                    </TouchableOpacity>
                    <Text style={styles.mediaTypeLabel}>
                      {getPendingMediaLabel(item)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {displayMedia.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Media đã có trong review</Text>
              <View style={styles.mediaGrid}>
                {displayMedia.map((media) => (
                  <View key={media.id} style={styles.mediaCard}>
                    <ReviewMediaPreview
                      uri={getMediaPreviewUrl(media)}
                      mediaType={media.media_type}
                    />
                    {media.media_type === "video" ? (
                      <View style={styles.videoBadge}>
                        <Ionicons
                          name="videocam"
                          size={12}
                          color={Colors.white}
                        />
                        <Text style={styles.videoBadgeText}>Video</Text>
                      </View>
                    ) : null}
                    <Text style={styles.mediaTypeLabel}>
                      {media.media_type === "video" ? "Video" : "Ảnh"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              (isSubmitting ||
                Boolean(myReview) ||
                !isLoggedIn ||
                !canReviewProduct) &&
                styles.submitButtonDisabled,
            ]}
            activeOpacity={0.88}
            disabled={
              isSubmitting ||
              Boolean(myReview) ||
              !isLoggedIn ||
              !canReviewProduct
            }
            onPress={() => void handleSubmit()}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="send" size={18} color={Colors.white} />
                <Text style={styles.submitButtonText}>
                  {myReview
                    ? "Đã đánh giá"
                    : canReviewProduct
                      ? "Gửi đánh giá"
                      : "Chưa đủ điều kiện"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  flex: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  stateText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    marginTop: Spacing.sm,
    backgroundColor: PAGE_ACCENT,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  retryButtonText: {
    color: Colors.white,
    fontSize: FontSize.base,
    fontWeight: "700",
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    ...Shadow.medium,
  },
  productCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.base,
  },
  productImage: {
    width: 110,
    height: 110,
    borderRadius: Radius.lg,
    backgroundColor: "#F4F5F9",
  },
  productMeta: {
    flex: 1,
    gap: Spacing.sm,
  },
  productName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  productQuantity: {
    fontSize: FontSize.xl,
    color: "#35374A",
  },
  purchasedBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "#F2F3F7",
    borderRadius: Radius.md,
  },
  purchasedBadgeText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: "#60657A",
  },
  sectionTitleCentered: {
    fontSize: 22,
    fontWeight: "500",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  starRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.xl,
  },
  starButton: {
    padding: 2,
  },
  ratingLabel: {
    marginTop: Spacing.lg,
    fontSize: 20,
    fontWeight: "500",
    color: "#7A4A00",
    textAlign: "center",
  },
  reviewLockedText: {
    marginTop: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
  },
  textAreaWrap: {
    minHeight: 220,
    backgroundColor: INPUT_BG,
    borderRadius: Radius.xl,
    padding: Spacing.base,
  },
  textArea: {
    minHeight: 160,
    fontSize: 18,
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  inputHint: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  charCount: {
    marginTop: Spacing.base,
    alignSelf: "flex-end",
    fontSize: FontSize.md,
    color: "#8A8FA3",
  },
  uploadCard: {
    backgroundColor: "#F9FAFE",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: DASHED_BORDER,
    borderRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 38,
    alignItems: "center",
    justifyContent: "center",
    opacity: 1,
  },
  uploadIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.small,
  },
  uploadPlusBadge: {
    position: "absolute",
    right: 18,
    top: 18,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PAGE_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadTitle: {
    marginTop: Spacing.lg,
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  uploadHint: {
    marginTop: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  mediaSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginBottom: Spacing.base,
  },
  mediaCountText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: PAGE_ACCENT,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  mediaCard: {
    width: "47%",
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: "#EEF3FF",
    position: "relative",
  },
  mediaPreview: {
    width: "100%",
    height: 132,
    backgroundColor: "#DCE6FF",
  },

  mediaTypeLabel: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  removeMediaButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(15, 23, 42, 0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBadge: {
    position: "absolute",
    left: 8,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: "rgba(15, 23, 42, 0.78)",
  },
  videoBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.white,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: 24,
    backgroundColor: "rgba(246, 247, 251, 0.97)",
  },
  submitButton: {
    minHeight: 58,
    borderRadius: Radius.full,
    backgroundColor: PAGE_ACCENT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    ...Shadow.large,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.white,
  },
  successIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#16A34A",
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginTop: Spacing.sm,
  },
  successButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: PAGE_ACCENT,
    ...Shadow.medium,
  },
  successButtonText: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.white,
  },
});
