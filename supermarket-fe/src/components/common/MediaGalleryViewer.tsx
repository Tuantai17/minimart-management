import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import InlineVideoPlayer from "./InlineVideoPlayer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GalleryMediaItem {
  id: number | string;
  url: string;
  type: "image" | "video";
}

interface MediaGalleryViewerProps {
  visible: boolean;
  items: GalleryMediaItem[];
  initialIndex?: number;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CLOSE_HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GalleryImage({ url }: { url: string }) {
  return (
    <View style={slideStyles.slide}>
      <Image
        source={{ uri: url }}
        style={slideStyles.fullImage}
        resizeMode="contain"
      />
    </View>
  );
}

function GalleryVideo({ url }: { url: string }) {
  const videoHeight = Math.round(SCREEN_HEIGHT * 0.55);

  return (
    <View style={slideStyles.slide}>
      <View style={slideStyles.videoContainer}>
        <InlineVideoPlayer uri={url} height={videoHeight} autoplay />
      </View>
    </View>
  );
}

const slideStyles = StyleSheet.create({
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  videoContainer: {
    width: SCREEN_WIDTH - 24,
    borderRadius: 12,
    overflow: "hidden",
  },
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MediaGalleryViewer({
  visible,
  items,
  initialIndex = 0,
  onClose,
}: MediaGalleryViewerProps) {
  const flatListRef = useRef<FlatList<GalleryMediaItem>>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / SCREEN_WIDTH);
      setCurrentIndex(index);
    },
    [],
  );

  const handleClose = useCallback(() => {
    setCurrentIndex(initialIndex);
    onClose();
  }, [initialIndex, onClose]);

  const renderItem: ListRenderItem<GalleryMediaItem> = useCallback(
    ({ item }) => {
      if (item.type === "video") {
        return <GalleryVideo url={item.url} />;
      }

      return <GalleryImage url={item.url} />;
    },
    [],
  );

  const keyExtractor = useCallback(
    (item: GalleryMediaItem) => String(item.id),
    [],
  );

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    }),
    [],
  );

  if (!visible || items.length === 0) {
    return null;
  }

  const current = items[currentIndex] ?? items[0];
  const isVideo = current?.type === "video";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        {Platform.OS !== "web" && (
          <StatusBar backgroundColor="rgba(0,0,0,0.95)" barStyle="light-content" />
        )}

        {/* ─── Top bar ─── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            hitSlop={CLOSE_HIT_SLOP}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {items.length > 1 && (
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>
                {currentIndex + 1} / {items.length}
              </Text>
            </View>
          )}

          {isVideo && (
            <View style={styles.typeBadge}>
              <Ionicons name="videocam" size={14} color="#FFFFFF" />
              <Text style={styles.typeBadgeText}>Video</Text>
            </View>
          )}
        </View>

        {/* ─── Gallery slides ─── */}
        <FlatList
          ref={flatListRef}
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          getItemLayout={getItemLayout}
          initialScrollIndex={initialIndex}
          bounces={false}
          removeClippedSubviews
        />

        {/* ─── Bottom dots indicator ─── */}
        {items.length > 1 && (
          <View style={styles.dotsContainer}>
            {items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.dot,
                  index === currentIndex && styles.dotActive,
                  item.type === "video" && styles.dotVideo,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  counterPill: {
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  counterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  typeBadge: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  dotsContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 50 : 32,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  dotActive: {
    width: 20,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  dotVideo: {
    backgroundColor: "rgba(255, 160, 0, 0.5)",
  },
});
