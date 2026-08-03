import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewToken,
} from "react-native";
import { Colors, Radius, Shadow, Spacing } from "../../constants";
import type { Banner } from "../../types";
import { getImageUrl } from "../../utils";

const HORIZONTAL_PADDING = Spacing.base;
const AUTO_SCROLL_INTERVAL = 4000;

interface BannerSliderProps {
  banners: Banner[];
  onPressBanner: (banner: Banner) => void;
}

export default function BannerSlider({
  banners,
  onPressBanner,
}: BannerSliderProps) {
  const { width: screenWidth } = useWindowDimensions();
  const pageWidth = screenWidth;
  const bannerWidth = screenWidth - HORIZONTAL_PADDING * 2;
  const bannerHeight = Math.round(bannerWidth * 0.46);

  const flatListRef = useRef<FlatList<Banner>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isUserScrolling = useRef(false);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(() => {
    stopAutoScroll();

    if (banners.length <= 1) {
      return;
    }

    autoScrollTimer.current = setInterval(() => {
      if (isUserScrolling.current) {
        return;
      }

      setActiveIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % banners.length;

        flatListRef.current?.scrollToOffset({
          offset: nextIndex * pageWidth,
          animated: true,
        });

        return nextIndex;
      });
    }, AUTO_SCROLL_INTERVAL);
  }, [banners.length, pageWidth, stopAutoScroll]);

  useEffect(() => {
    startAutoScroll();
    return stopAutoScroll;
  }, [startAutoScroll, stopAutoScroll]);

  useEffect(() => {
    if (activeIndex >= banners.length && banners.length > 0) {
      setActiveIndex(0);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [activeIndex, banners.length]);

  const handleScrollBeginDrag = () => {
    isUserScrolling.current = true;
    stopAutoScroll();
  };

  const handleScrollEndDrag = () => {
    isUserScrolling.current = false;
    startAutoScroll();
  };

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / pageWidth);
    setActiveIndex(Math.min(newIndex, banners.length - 1));
  };

  const renderBannerItem = useCallback(
    ({ item }: { item: Banner }) => {
      return (
        <View style={[styles.page, { width: pageWidth }]}>
          <TouchableOpacity
            activeOpacity={item.link ? 0.9 : 1}
            disabled={!item.link}
            onPress={() => onPressBanner(item)}
            style={[styles.bannerCard, { width: bannerWidth, height: bannerHeight }]}
          >
            <Image
              source={{ uri: getImageUrl(item.image) }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
        </View>
      );
    },
    [bannerHeight, bannerWidth, onPressBanner, pageWidth],
  );

  const keyExtractor = useCallback((item: Banner) => item.id.toString(), []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  if (banners.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={banners}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderBannerItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
      />

      {banners.length > 1 && (
        <View style={styles.dotsContainer}>
          {banners.map((banner, index) => (
            <View
              key={banner.id}
              style={[styles.dot, activeIndex === index && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.xl,
  },
  page: {
    alignItems: "center",
  },
  bannerCard: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: Colors.white,
    shadowColor: "#050505",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.04)",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#FDFBF7",
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginHorizontal: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: "#064E3B",
  },
});
