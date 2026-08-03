import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { ImageStyle } from "react-native";
import { Colors, Shadow } from "../../src/constants";
import { useNotificationStore, useProfileStore } from "../../src/store";
import { useUIStore } from "../../src/store/ui.store";
import type { UpdateProfilePayload } from "../../src/types";

const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
]);
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Xác định MIME type của ảnh để backend hiểu đúng định dạng file upload.
const getMimeTypeFromAsset = (asset: ImagePicker.ImagePickerAsset): string => {
  if (asset.mimeType?.trim()) {
    return asset.mimeType.toLowerCase();
  }

  // Fallback theo tên file hoặc URI nếu mimeType không có sẵn.
  const normalizedSource = `${asset.fileName || ""} ${asset.uri.split("?")[0]}`.toLowerCase();

  if (normalizedSource.includes(".png")) {
    return "image/png";
  }

  if (normalizedSource.includes(".webp")) {
    return "image/webp";
  }

  if (normalizedSource.includes(".jpg") || normalizedSource.includes(".jpeg")) {
    return "image/jpeg";
  }

  return "image/jpeg";
};

// Chuẩn hoá mime type đầu ra theo các định dạng mà manipulator hỗ trợ ổn định.
const getOutputMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();

  if (normalized === "image/png") {
    return "image/png";
  }

  if (normalized === "image/webp") {
    return "image/webp";
  }

  return "image/jpeg";
};

// Suy ra extension tương ứng với MIME type để tạo tên file hợp lệ.
const getExtensionFromMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();

  if (normalized === "image/png") {
    return "png";
  }

  if (normalized === "image/webp") {
    return "webp";
  }

  return "jpg";
};

const getAssetExtension = (asset: ImagePicker.ImagePickerAsset): string => {
  const fromFileName = asset.fileName?.split(".").pop()?.toLowerCase().trim();
  if (fromFileName) {
    return fromFileName;
  }

  const cleanUri = asset.uri.split("?")[0];
  const fromUri = cleanUri.split(".").pop()?.toLowerCase().trim();
  return fromUri || "";
};

const getAssetSizeBytes = (asset: ImagePicker.ImagePickerAsset): number | null => {
  if (typeof asset.fileSize === "number" && Number.isFinite(asset.fileSize)) {
    return asset.fileSize;
  }

  const webFileSize =
    (asset as ImagePicker.ImagePickerAsset & { file?: File | null }).file?.size;
  if (typeof webFileSize === "number" && Number.isFinite(webFileSize)) {
    return webFileSize;
  }

  return null;
};

const validateAvatarAsset = (asset: ImagePicker.ImagePickerAsset): string | null => {
  const mimeType = getMimeTypeFromAsset(asset);
  const extension = getAssetExtension(asset);
  const fileSize = getAssetSizeBytes(asset);

  if (!mimeType.startsWith("image/")) {
    return "Chi ho tro tep anh cho avatar.";
  }

  if (
    extension &&
    !ALLOWED_AVATAR_EXTENSIONS.has(extension) &&
    !ALLOWED_AVATAR_MIME_TYPES.has(mimeType)
  ) {
    return "Chi chap nhan dinh dang jpg, jpeg, png, webp, gif.";
  }

  if (typeof fileSize === "number" && fileSize > MAX_AVATAR_FILE_SIZE_BYTES) {
    return "Anh dai dien qua lon. Toi da 5MB.";
  }

  return null;
};

// Chuẩn hoá payload avatar trước khi đẩy xuống service/store.
const buildAvatarPayload = (
  asset: ImagePicker.ImagePickerAsset,
): NonNullable<UpdateProfilePayload["avatar"]> => {
  const mimeType = getOutputMimeType(getMimeTypeFromAsset(asset));
  const extension = getExtensionFromMimeType(mimeType);
  const fileName = asset.fileName?.trim() || `avatar-${Date.now()}.${extension}`;

  return {
    uri: asset.uri,
    name: fileName,
    mimeType,
    file: asset.file ?? null,
  };
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const AVATAR_PREVIEW_SIZE = 130;
const AVATAR_EDITOR_STAGE_HEIGHT = Math.min(SCREEN_HEIGHT * 0.56, 520);
const AVATAR_CROP_FRAME_SIZE = Math.min(SCREEN_WIDTH - 56, 300);
const AVATAR_EXPORT_SIZE = 600;

const getManipulatorFormatFromMimeType = (mimeType: string): SaveFormat => {
  const normalized = getOutputMimeType(mimeType);

  if (normalized === "image/png") {
    return SaveFormat.PNG;
  }

  if (normalized === "image/webp") {
    return SaveFormat.WEBP;
  }

  return SaveFormat.JPEG;
};

type AvatarEditorDraft = {
  asset: ImagePicker.ImagePickerAsset;
  scale: number;
  offsetX: number;
  offsetY: number;
};

// Đọc kích thước ảnh gốc để tính toán chính xác vùng crop.
const getImageDimensions = async (
  asset: ImagePicker.ImagePickerAsset,
): Promise<{ width: number; height: number }> => {
  // Nếu ImagePicker đã trả width/height thì dùng trực tiếp.
  if (asset.width && asset.height) {
    return {
      width: asset.width,
      height: asset.height,
    };
  }

  // Fallback: lấy kích thước từ Image API khi metadata bị thiếu.
  return new Promise((resolve, reject) => {
    Image.getSize(
      asset.uri,
      (width, height) => resolve({ width, height }),
      () => reject(new Error("Không thể đọc kích thước ảnh đã chọn.")),
    );
  });
};

// Tính thông số hiển thị kiểu "cover" để ảnh luôn phủ kín khung crop.
const getCoverMetrics = (
  width: number,
  height: number,
  frameSize: number = AVATAR_CROP_FRAME_SIZE,
) => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeFrameSize = Math.max(1, frameSize);
  const baseScale = Math.max(safeFrameSize / safeWidth, safeFrameSize / safeHeight);
  const widthOnCanvas = safeWidth * baseScale;
  const heightOnCanvas = safeHeight * baseScale;

  return {
    width: safeWidth,
    height: safeHeight,
    baseScale,
    widthOnCanvas,
    heightOnCanvas,
  };
};

const getAvatarImageLayout = (
  width: number,
  height: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  frameSize: number,
  offsetReferenceSize: number = frameSize,
): ImageStyle => {
  const metrics = getCoverMetrics(width, height, frameSize);
  const offsetRatio = frameSize / Math.max(1, offsetReferenceSize);

  return {
    width: metrics.widthOnCanvas,
    height: metrics.heightOnCanvas,
    marginLeft: -metrics.widthOnCanvas / 2,
    marginTop: -metrics.heightOnCanvas / 2,
    transform: [
      { scale },
      { translateX: offsetX * offsetRatio },
      { translateY: offsetY * offsetRatio },
    ] as NonNullable<ImageStyle["transform"]>,
  };
};

// Giới hạn mức zoom hợp lệ trong khoảng 1x -> 3x.
const clampScale = (value: number): number => {
  return Math.min(3, Math.max(1, Number(value) || 1));
};

// Giới hạn tọa độ kéo để khung tròn không lộ vùng trống.
const clampAvatarOffset = (
  offsetX: number,
  offsetY: number,
  imageWidth: number,
  imageHeight: number,
  scale: number,
  frameSize: number = AVATAR_CROP_FRAME_SIZE,
) => {
  const metrics = getCoverMetrics(imageWidth, imageHeight, frameSize);
  const scaledWidth = metrics.widthOnCanvas * scale;
  const scaledHeight = metrics.heightOnCanvas * scale;
  const maxOffsetX = Math.max(0, (scaledWidth - frameSize) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - frameSize) / 2);

  return {
    offsetX: Math.min(maxOffsetX, Math.max(-maxOffsetX, offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(-maxOffsetY, offsetY)),
  };
};

// Chuyển thao tác zoom/kéo của user thành file ảnh đã crop thật sự để upload.
const buildScaledAvatarAsset = async (
  asset: ImagePicker.ImagePickerAsset,
  scale: number,
  offsetX: number,
  offsetY: number,
): Promise<ImagePicker.ImagePickerAsset> => {
  const normalizedScale = clampScale(scale);
  const dimensions = await getImageDimensions(asset);
  const metrics = getCoverMetrics(
    dimensions.width,
    dimensions.height,
    AVATAR_CROP_FRAME_SIZE,
  );
  const safeOffset = clampAvatarOffset(
    offsetX,
    offsetY,
    dimensions.width,
    dimensions.height,
    normalizedScale,
    AVATAR_CROP_FRAME_SIZE,
  );

  // Tính vùng crop đúng với những gì user đang nhìn trong khung tròn.
  const visibleScale = metrics.baseScale * normalizedScale;
  const cropWidth = AVATAR_CROP_FRAME_SIZE / visibleScale;
  const cropHeight = AVATAR_CROP_FRAME_SIZE / visibleScale;
  const centerX = dimensions.width / 2 - safeOffset.offsetX / visibleScale;
  const centerY = dimensions.height / 2 - safeOffset.offsetY / visibleScale;
  const maxOriginX = Math.max(0, dimensions.width - cropWidth);
  const maxOriginY = Math.max(0, dimensions.height - cropHeight);
  const originX = Math.min(
    maxOriginX,
    Math.max(0, centerX - cropWidth / 2),
  );
  const originY = Math.min(
    maxOriginY,
    Math.max(0, centerY - cropHeight / 2),
  );
  const mimeType = getOutputMimeType(getMimeTypeFromAsset(asset));
  const extension = getExtensionFromMimeType(mimeType);
  const outputFormat = getManipulatorFormatFromMimeType(mimeType);

  const manipulated = await manipulateAsync(
    asset.uri,
    [
      {
        crop: {
          originX: Math.round(originX),
          originY: Math.round(originY),
          width: Math.max(1, Math.round(cropWidth)),
          height: Math.max(1, Math.round(cropHeight)),
        },
      },
      {
        resize: {
          width: AVATAR_EXPORT_SIZE,
          height: AVATAR_EXPORT_SIZE,
        },
      },
    ],
    {
      compress: outputFormat === SaveFormat.PNG ? 1 : 0.92,
      format: outputFormat,
    },
  );

  return {
    ...asset,
    uri: manipulated.uri,
    width: manipulated.width,
    height: manipulated.height,
    mimeType,
    fileName: `avatar-cropped-${Date.now()}.${extension}`,
  };
};

export default function EditProfileScreen() {
  const router = useRouter();
  const profile = useProfileStore((state) => state.profile);
  const updateProfileAction = useProfileStore((state) => state.updateProfileAction);
  const isUpdatingProfile = useProfileStore((state) => state.isUpdatingProfile);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const showToast = useUIStore((state) => state.showToast);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selectedAvatar, setSelectedAvatar] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [avatarScale, setAvatarScale] = useState(1);
  const [avatarOffset, setAvatarOffset] = useState({ offsetX: 0, offsetY: 0 });
  const [avatarEditorDraft, setAvatarEditorDraft] =
    useState<AvatarEditorDraft | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [isApplyingAvatar, setIsApplyingAvatar] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});



  const formInitialized = useRef(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const draftOffsetRef = useRef({ offsetX: 0, offsetY: 0 });

  const openAvatarEditor = (
    asset: ImagePicker.ImagePickerAsset,
    scale: number = 1,
    offsetX: number = 0,
    offsetY: number = 0,
  ) => {
    const safeScale = clampScale(scale);
    const safeOffset = clampAvatarOffset(
      offsetX,
      offsetY,
      asset.width || 0,
      asset.height || 0,
      safeScale,
    );

    draftOffsetRef.current = safeOffset;
    setAvatarEditorDraft({
      asset,
      scale: safeScale,
      ...safeOffset,
    });
    setEditorVisible(true);
  };

  useEffect(() => {
    if (profile && !formInitialized.current) {
      setName(profile.name || "");
      setPhone(profile.phone || "");
      setEmail(profile.email || "");
      formInitialized.current = true;
    }
  }, [profile]);

  // Luồng chọn ảnh từ thư viện để chỉnh avatar.
  const handlePickImage = async () => {
    // 1. Xin quyền truy cập thư viện ảnh trên thiết bị.
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Quyền truy cập bị từ chối",
        "Vui lòng cấp quyền truy cập thư viện ảnh để đổi ảnh đại diện.",
      );
      return;
    }

    // 2. Mở thư viện chọn ảnh.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,  // Tắt chế độ crop mặc định của iOS/Android
      quality: 1,
    });

    // 3. Nếu user đã chọn ảnh, tạo draft để mở modal crop/zoom.
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedAsset = result.assets[0];
      const avatarValidationError = validateAvatarAsset(selectedAsset);

      if (avatarValidationError) {
        showToast(avatarValidationError, "error");
        return;
      }

      openAvatarEditor(selectedAsset);
    }
  };

  const handleAvatarPress = () => {
    if (selectedAvatar) {
      openAvatarEditor(
        selectedAvatar,
        avatarScale,
        avatarOffset.offsetX,
        avatarOffset.offsetY,
      );
      return;
    }

    void handlePickImage();
  };

  // Đóng modal editor avatar và reset draft tạm.
  const handleCloseEditor = () => {
    if (isApplyingAvatar) {
      return;
    }

    setEditorVisible(false);
    setAvatarEditorDraft(null);
    draftOffsetRef.current = {
      offsetX: 0,
      offsetY: 0,
    };
  };

  // Tăng/giảm zoom ảnh trong modal và clamp lại offset tương ứng.
  const handleDraftScaleChange = (delta: number) => {
    setAvatarEditorDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const nextScale = clampScale(prev.scale + delta);
      const safeOffset = clampAvatarOffset(
        prev.offsetX,
        prev.offsetY,
        prev.asset.width || 0,
        prev.asset.height || 0,
        nextScale,
      );

      draftOffsetRef.current = safeOffset;

      return {
        ...prev,
        scale: nextScale,
        ...safeOffset,
      };
    });
  };

  // Chốt ảnh trong editor: lưu scale/offset về state chính để chuẩn bị upload.
  const handleApplyAvatarEditor = async () => {
    if (!avatarEditorDraft) {
      return;
    }

    try {
      setIsApplyingAvatar(true);
      const safeOffset = clampAvatarOffset(
        avatarEditorDraft.offsetX,
        avatarEditorDraft.offsetY,
        avatarEditorDraft.asset.width || 0,
        avatarEditorDraft.asset.height || 0,
        avatarEditorDraft.scale,
      );

      setSelectedAvatar(avatarEditorDraft.asset);
      setLocalAvatarUri(avatarEditorDraft.asset.uri);
      setAvatarScale(avatarEditorDraft.scale);
      setAvatarOffset(safeOffset);
      setEditorVisible(false);
      setAvatarEditorDraft(null);
      draftOffsetRef.current = {
        offsetX: 0,
        offsetY: 0,
      };
    } finally {
      setIsApplyingAvatar(false);
    }
  };

  // Validate dữ liệu form cơ bản trước khi gửi lên backend.
  const validate = () => {
    const newErrors: { name?: string; phone?: string } = {};
    if (!name.trim()) {
      newErrors.name = "Tên hiển thị không được để trống";
    }

    const phoneRegex = /^(0[3|5|7|8|9])+([0-9]{8})$/;
    if (!phone.trim()) {
      newErrors.phone = "Số điện thoại không được để trống";
    } else if (!phoneRegex.test(phone.trim())) {
      newErrors.phone = "Số điện thoại không hợp lệ";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Lưu thông tin profile + avatar.
  const handleSave = async () => {
    // 1) Chặn submit khi form chưa hợp lệ.
    if (!validate()) return;

    try {
      const payload: UpdateProfilePayload = {};

      // 2) Chỉ append field nào thực sự thay đổi để giảm payload gửi đi.
      if (name.trim() !== profile?.name) {
        payload.name = name.trim();
      }
      if (phone.trim() !== profile?.phone) {
        payload.phone = phone.trim();
      }

      // 3) Nếu có avatar mới thì crop/resize xong mới gắn vào payload upload.
      if (selectedAvatar) {
        const processedAvatar = await buildScaledAvatarAsset(
          selectedAvatar,
          avatarScale,
          avatarOffset.offsetX,
          avatarOffset.offsetY,
        );
        payload.avatar = buildAvatarPayload(processedAvatar);
      }

      // 4) Không có thay đổi gì thì dừng, tránh gọi API không cần thiết.
      if (Object.keys(payload).length === 0) {
        Alert.alert("Thông báo", "Bạn chưa thay đổi thông tin nào.");
        return;
      }

      // 5) Gọi store action để gửi PATCH profile lên backend.
      await updateProfileAction(payload);

      // 6) Thông báo thành công và quay lại màn hình trước.
      addNotification({
        title: "Thành công",
        message: "Cập nhật thông tin cá nhân thành công",
        type: "success",
      });

      router.back();
    } catch (error: any) {
      Alert.alert(
        "Lỗi",
        error?.message || "Không thể cập nhật thông tin. Vui lòng thử lại sau.",
      );
    }
  };

  const draftPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(avatarEditorDraft),
        onMoveShouldSetPanResponder: () => Boolean(avatarEditorDraft),
        onPanResponderGrant: () => {
          draftOffsetRef.current = {
            offsetX: avatarEditorDraft?.offsetX || 0,
            offsetY: avatarEditorDraft?.offsetY || 0,
          };
        },
        onPanResponderMove: (_, gestureState) => {
          setAvatarEditorDraft((prev) => {
            if (!prev) {
              return prev;
            }

            const nextOffset = clampAvatarOffset(
              draftOffsetRef.current.offsetX + gestureState.dx,
              draftOffsetRef.current.offsetY + gestureState.dy,
              prev.asset.width || 0,
              prev.asset.height || 0,
              prev.scale,
            );

            return {
              ...prev,
              ...nextOffset,
            };
          });
        },
        onPanResponderRelease: (_, gestureState) => {
          setAvatarEditorDraft((prev) => {
            if (!prev) {
              return prev;
            }

            const nextOffset = clampAvatarOffset(
              draftOffsetRef.current.offsetX + gestureState.dx,
              draftOffsetRef.current.offsetY + gestureState.dy,
              prev.asset.width || 0,
              prev.asset.height || 0,
              prev.scale,
            );

            draftOffsetRef.current = nextOffset;

            return {
              ...prev,
              ...nextOffset,
            };
          });
        },
      }),
    [avatarEditorDraft],
  );

  const previewAvatarStyle = useMemo(() => {
    if (!selectedAvatar) {
      return null;
    }

    return getAvatarImageLayout(
      selectedAvatar.width || AVATAR_EXPORT_SIZE,
      selectedAvatar.height || AVATAR_EXPORT_SIZE,
      avatarScale,
      avatarOffset.offsetX,
      avatarOffset.offsetY,
      AVATAR_PREVIEW_SIZE,
      AVATAR_CROP_FRAME_SIZE,
    );
  }, [selectedAvatar, avatarScale, avatarOffset]);

  const draftAvatarStyle = useMemo(() => {
    if (!avatarEditorDraft) {
      return null;
    }

    return getAvatarImageLayout(
      avatarEditorDraft.asset.width || AVATAR_EXPORT_SIZE,
      avatarEditorDraft.asset.height || AVATAR_EXPORT_SIZE,
      avatarEditorDraft.scale,
      avatarEditorDraft.offsetX,
      avatarEditorDraft.offsetY,
      AVATAR_CROP_FRAME_SIZE,
    );
  }, [avatarEditorDraft]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      
      {/* Floating Pill Nav */}
      <Animated.View style={[styles.floatNav, { opacity: headerOpacity }]}>
        <TouchableOpacity style={styles.navAction} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Thông tin cá nhân</Text>
        <TouchableOpacity 
          style={[styles.saveActionBtn, isUpdatingProfile && styles.saveBtnDisabled]} 
          onPress={handleSave}
          disabled={isUpdatingProfile}
        >
          {isUpdatingProfile ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.saveActionText}>Lưu</Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.ScrollView
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.spacer} />

          <View style={styles.heroArea}>
            <TouchableOpacity
              onPress={handleAvatarPress}
              style={styles.avatarPicker}
              activeOpacity={0.9}
              disabled={isUpdatingProfile}
            >
              <View style={styles.avatarWrapper}>
                {localAvatarUri ? (
                  <Image
                    source={{ uri: localAvatarUri }}
                    style={[
                      styles.avatarImage,
                      previewAvatarStyle,
                    ]}
                  />
                ) : profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.placeholderBox}>
                    <Ionicons name="person" size={50} color="#CBD5E1" />
                  </View>
                )}
                <View style={styles.avatarSoftOverlay} />
                <View style={styles.glassBadge}>
                  <Ionicons name="camera" size={16} color="#FFFFFF" />
                </View>
              </View>
            </TouchableOpacity>
            <Text style={styles.heroTitle}>Ảnh đại diện</Text>
            <Text style={styles.heroSub}>Thêm hoặc đổi ảnh cá nhân của bạn</Text>

            {selectedAvatar && (
              <View style={styles.scaleEditorCard}>
                <View style={styles.scaleEditorHeader}>
                  <Text style={styles.scaleEditorTitle}>Ảnh đã được căn chỉnh</Text>
                  <Text style={styles.scaleEditorValue}>
                    {Math.round(avatarScale * 100)}%
                  </Text>
                </View>

                <Text style={styles.scaleEditorHint}>
                  Ảnh sẽ được lưu đúng theo vùng tròn bạn đã zoom và kéo. Nhấn vào avatar để chỉnh lại.
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    void handlePickImage();
                  }}
                  disabled={isUpdatingProfile}
                  style={styles.changeAvatarButton}
                  activeOpacity={0.85}
                >
                  <Ionicons name="images-outline" size={15} color={Colors.primary} />
                  <Text style={styles.changeAvatarButtonText}>Chọn ảnh khác</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Form Section */}
          <View style={styles.formContainer}>
            <View style={styles.inputStack}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.label}>HỌ VÀ TÊN</Text>
                {errors.name && <Text style={styles.errorHighlight}>{errors.name}</Text>}
              </View>
              <View style={[styles.inputWrapper, errors.name && styles.inputWrapperError]}>
                <Ionicons name="person-outline" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="Họ và tên của bạn"
                  placeholderTextColor="#94A3B8"
                  editable={!isUpdatingProfile}
                />
              </View>
            </View>

            <View style={styles.inputStack}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.label}>SỐ ĐIỆN THOẠI</Text>
                {errors.phone && <Text style={styles.errorHighlight}>{errors.phone}</Text>}
              </View>
              <View style={[styles.inputWrapper, errors.phone && styles.inputWrapperError]}>
                <Ionicons name="call-outline" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.textInput}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  keyboardType="phone-pad"
                  placeholder="Ví dụ: 0901234567"
                  placeholderTextColor="#94A3B8"
                  editable={!isUpdatingProfile}
                />
              </View>
            </View>

            <View style={styles.inputStack}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.label}>ĐỊA CHỈ EMAIL</Text>
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={10} color="#94A3B8" />
                  <Text style={styles.lockText}>Cố định</Text>
                </View>
              </View>
              <View style={[styles.inputWrapper, styles.inputDisabled]}>
                <Ionicons name="mail-outline" size={18} color="#CBD5E1" />
                <Text style={styles.disabledText}>{email}</Text>
              </View>
              <Text style={styles.infoHint}>
                Email được dùng để đăng nhập và bảo mật nên không thể thay đổi.
              </Text>
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={editorVisible}
        animationType="fade"
        transparent
        onRequestClose={handleCloseEditor}
      >
        <View style={styles.editorBackdrop}>
          {avatarEditorDraft ? (
            <>
              <Image
                source={{ uri: avatarEditorDraft.asset.uri }}
                style={styles.editorBackdropImage}
                resizeMode="cover"
                blurRadius={10}
              />
              <View style={styles.editorBackdropTint} />
              <View style={styles.editorBackdropLight} />
            </>
          ) : null}

          <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

          <View style={styles.editorHeader}>
            <TouchableOpacity
              style={styles.editorHeaderAction}
              onPress={handleCloseEditor}
              disabled={isApplyingAvatar}
            >
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.editorHeaderTitle}>Cắt ảnh</Text>
            <View style={styles.editorHeaderSpacer} />
          </View>

          <View style={styles.editorCanvasWrap}>
            {avatarEditorDraft ? (
              <View style={styles.editorCanvas} {...draftPanResponder.panHandlers}>
                <View pointerEvents="none" style={styles.editorFocusHalo} />
                <View pointerEvents="none" style={styles.editorCircleViewport}>
                  <Image
                    source={{ uri: avatarEditorDraft.asset.uri }}
                    style={[
                      styles.editorImage,
                      draftAvatarStyle,
                    ]}
                    resizeMode="cover"
                  />
                </View>
                <View pointerEvents="none" style={styles.editorCircleFrame} />
                <Text style={styles.editorCanvasHint}>
                  Kéo ảnh vào đúng vị trí bạn muốn hiển thị trong avatar.
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.editorBottomSheet}>
            <View style={styles.editorScaleHeader}>
              <Text style={styles.editorScaleLabel}>Zoom ảnh đại diện</Text>
              <Text style={styles.editorScaleValue}>
                {Math.round((avatarEditorDraft?.scale || 1) * 100)}%
              </Text>
            </View>

            <Text style={styles.editorHintText}>
              Ảnh nền được làm mờ để bạn căn bố cục dễ hơn. Dùng nút trừ và cộng để zoom đúng ý trước khi lưu.
            </Text>

            <View style={styles.editorScaleControls}>
              <TouchableOpacity
                style={styles.editorScaleButton}
                onPress={() => handleDraftScaleChange(-0.1)}
                disabled={!avatarEditorDraft || isApplyingAvatar}
              >
                <Ionicons name="remove" size={20} color="#FFFFFF" />
              </TouchableOpacity>

              <View style={styles.editorScaleTrack}>
                <View
                  style={[
                    styles.editorScaleFill,
                    {
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          Math.round((((avatarEditorDraft?.scale || 1) - 1) / 2) * 100),
                        ),
                      )}%` as `${number}%`,
                    },
                  ]}
                />
              </View>

              <TouchableOpacity
                style={styles.editorScaleButton}
                onPress={() => handleDraftScaleChange(0.1)}
                disabled={!avatarEditorDraft || isApplyingAvatar}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.editorFooterActions}>
              <TouchableOpacity
                style={styles.editorCancelButton}
                onPress={handleCloseEditor}
                disabled={isApplyingAvatar}
              >
                <Text style={styles.editorCancelText}>Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.editorSaveButton}
                onPress={handleApplyAvatarEditor}
                disabled={!avatarEditorDraft || isApplyingAvatar}
              >
                {isApplyingAvatar ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.editorSaveText}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  spacer: {
    height: 110,
  },
  floatNav: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 16,
    right: 16,
    height: 56,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    zIndex: 100,
    ...Shadow.medium,
    shadowOpacity: 0.08,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.03)",
  },
  navAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: -0.3,
  },
  saveActionBtn: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "10",
    justifyContent: "center",
    alignItems: "center",
  },
  saveActionText: {
    color: Colors.primary,
    fontWeight: "800",
    fontSize: 14,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  heroArea: {
    alignItems: "center",
    marginBottom: 40,
  },
  avatarPicker: {
    marginBottom: 20,
  },
  avatarWrapper: {
    width: AVATAR_PREVIEW_SIZE,
    height: AVATAR_PREVIEW_SIZE,
    borderRadius: AVATAR_PREVIEW_SIZE / 2,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    overflow: "hidden",
    ...Shadow.medium,
    shadowOpacity: 0.05,
  },
  avatarImage: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "100%",
    height: "100%",
    borderRadius: AVATAR_PREVIEW_SIZE / 2,
    marginLeft: -AVATAR_PREVIEW_SIZE / 2,
    marginTop: -AVATAR_PREVIEW_SIZE / 2,
  },
  avatarSoftOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
  },
  placeholderBox: {
    width: "100%",
    height: "100%",
    borderRadius: AVATAR_PREVIEW_SIZE / 2,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  glassBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    ...Shadow.small,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
  },
  scaleEditorCard: {
    width: "100%",
    marginTop: 20,
    backgroundColor: "#F8FAFC",
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  scaleEditorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scaleEditorTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  scaleEditorValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
  },
  scaleEditorHint: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },
  changeAvatarButton: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.primary + "12",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  changeAvatarButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
  },
  formContainer: {
    gap: 28,
  },
  inputStack: {
    gap: 10,
  },
  inputLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1.2,
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  lockText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
  },
  errorHighlight: {
    fontSize: 10,
    fontWeight: "700",
    color: "#EF4444",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  inputWrapperError: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  textInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: "#1E293B",
    fontWeight: "600",
  },
  disabledText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: "#94A3B8",
    fontWeight: "600",
  },
  infoHint: {
    fontSize: 12,
    color: "#94A3B8",
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  bottomSpacer: {
    height: 80,
  },
  editorBackdrop: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  editorBackdropImage: {
    ...StyleSheet.absoluteFillObject,
  },
  editorBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.62)",
  },
  editorBackdropLight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  editorHeader: {
    height: Platform.OS === "ios" ? 96 : 76,
    paddingTop: Platform.OS === "ios" ? 42 : 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(17, 24, 39, 0.08)",
  },
  editorHeaderAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.68)",
  },
  editorHeaderTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  editorHeaderSpacer: {
    width: 42,
    height: 42,
  },
  editorCanvasWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: SCREEN_WIDTH,
  },
  editorCanvas: {
    width: SCREEN_WIDTH,
    minHeight: AVATAR_EDITOR_STAGE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  editorImage: {
    position: "absolute",
    top: "50%",
    left: "50%",
  },
  editorFocusHalo: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: AVATAR_CROP_FRAME_SIZE + 44,
    height: AVATAR_CROP_FRAME_SIZE + 44,
    borderRadius: (AVATAR_CROP_FRAME_SIZE + 44) / 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginLeft: -(AVATAR_CROP_FRAME_SIZE + 44) / 2,
    marginTop: -(AVATAR_CROP_FRAME_SIZE + 44) / 2,
  },
  editorCircleViewport: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: AVATAR_CROP_FRAME_SIZE,
    height: AVATAR_CROP_FRAME_SIZE,
    borderRadius: AVATAR_CROP_FRAME_SIZE / 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.14)",
    marginLeft: -AVATAR_CROP_FRAME_SIZE / 2,
    marginTop: -AVATAR_CROP_FRAME_SIZE / 2,
  },
  editorCircleFrame: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: AVATAR_CROP_FRAME_SIZE,
    height: AVATAR_CROP_FRAME_SIZE,
    borderRadius: AVATAR_CROP_FRAME_SIZE / 2,
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.96)",
    backgroundColor: "transparent",
    marginLeft: -AVATAR_CROP_FRAME_SIZE / 2,
    marginTop: -AVATAR_CROP_FRAME_SIZE / 2,
  },
  editorCanvasHint: {
    position: "absolute",
    bottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.74)",
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },
  editorBottomSheet: {
    backgroundColor: "rgba(255,255,255,0.78)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 22,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(17, 24, 39, 0.08)",
  },
  editorScaleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editorScaleLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  editorScaleValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.primary,
  },
  editorHintText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
  },
  editorScaleControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  editorScaleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  editorScaleTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(17,24,39,0.08)",
  },
  editorScaleFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  editorFooterActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  editorCancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(17,24,39,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  editorCancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  editorSaveButton: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  editorSaveText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
