import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";

const Colors = {
  primary: "#2E7D32", // Xanh lá chủ đạo
  textBlack: "#1A202C",
  textGray: "#718096",
  white: "#FFFFFF", // Phải là màu trắng tinh để đồng bộ với viền của ảnh GIF
};

export default function SplashScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(20)).current; // Thêm hiệu ứng trượt nhẹ lên

  useEffect(() => {
    // Hiệu ứng hiện dần và trượt nhẹ logo lên
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideUpAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Thanh tiến trình chạy mượt
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2500,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => {
      router.replace("/(tabs)/home");
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      {/* Khối nội dung chính nằm giữa màn hình */}
      <Animated.View
        style={[
          styles.centerBlock,
          { opacity: fadeAnim, transform: [{ translateY: slideUpAnim }] },
        ]}
      >
        {/* 1. Ảnh GIF nằm trên cùng */}
        <Image
          source={require("../../assets/images/giphy1.gif")}
          style={styles.gifIcon}
          resizeMode="contain"
        />

        {/* 2. Tên App và Slogan nằm ngay dưới ảnh */}
        <View style={styles.textGroup}>
          <View style={styles.titleRow}>
            <Text style={styles.titleBlack}>Siêu Thị </Text>
            <Text style={styles.titleGreen}>Mini</Text>
          </View>
          <Text style={styles.subtitle}>Đi chợ nhanh – giao tận nơi</Text>
        </View>
      </Animated.View>

      {/* Khối Loading được neo chặt ở dưới đáy màn hình */}
      <Animated.View style={[styles.bottomBlock, { opacity: fadeAnim }]}>
        <Text style={styles.loadingText}>ĐANG TẢI...</Text>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[styles.progressFill, { width: progressWidth }]}
          />
        </View>
        <Text style={styles.versionText}>v1.2.0 • Hoàn hảo từng bữa ăn</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white, // Cực kỳ quan trọng: Nền trắng giúp GIF mất viền
  },

  /* Căn giữa cụm Logo và Tên App */
  centerBlock: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 60, // Đẩy cụm này xuống một chút cho cân đối
  },
  gifIcon: {
    width: 220, // Thu nhỏ lại một chút để nhìn tinh tế hơn
    height: 220,
    marginBottom: 20, // Khoảng cách từ GIF tới tên App
  },
  textGroup: {
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleBlack: {
    fontSize: 36,
    fontWeight: "900",
    color: Colors.textBlack,
    letterSpacing: -0.5,
  },
  titleGreen: {
    fontSize: 36,
    fontWeight: "900",
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textGray,
    marginTop: 6,
    fontWeight: "500",
    letterSpacing: 0.2,
  },

  /* Cụm Loading nằm dưới đáy */
  bottomBlock: {
    alignItems: "center",
    paddingBottom: 50, // Căn lề dưới cho khỏi sát mép đt
    paddingHorizontal: 60,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "bold",
    color: Colors.textGray, // Đổi sang xám để không chói
    marginBottom: 10,
    letterSpacing: 1.2,
  },
  progressTrack: {
    width: "100%",
    height: 6, // Thanh loading rất mỏng, thanh lịch
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
    marginBottom: 16,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 10,
  },
  versionText: {
    fontSize: 12,
    color: "#CBD5E1", // Màu xám rất nhạt cho version
  },
});
