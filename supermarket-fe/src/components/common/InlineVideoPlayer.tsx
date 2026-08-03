import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import WebView from "react-native-webview";

/**
 * Component phát video inline trên cả web và native.
 *
 * - **Web:** dùng thẻ `<video>` HTML5 trực tiếp.
 * - **Native:** dùng `react-native-webview` để render HTML5 video bên trong WebView.
 *
 * Tham số:
 * - `uri` — URL tuyệt đối của video.
 * - `height` — chiều cao tùy chỉnh (mặc định 180).
 * - `autoplay` — tự động phát video khi hiển thị (mặc định false).
 */

interface VideoPlayerProps {
  uri: string;
  height?: number;
  autoplay?: boolean;
}

/** HTML template tối giản để WebView phát video trên native. */
const buildVideoHtml = (videoUrl: string, autoplay: boolean): string => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0F172A;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #0F172A;
    }
  </style>
</head>
<body>
  <video
    src="${videoUrl}"
    controls
    playsinline
    preload="${autoplay ? "auto" : "metadata"}"
    controlslist="nodownload"
    ${autoplay ? "autoplay" : ""}
  ></video>
</body>
</html>
`;

export default function InlineVideoPlayer({
  uri,
  height = 180,
  autoplay = false,
}: VideoPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // ─── Web: render thẻ <video> trực tiếp ───
  if (Platform.OS === "web") {
    return (
      <video
        src={uri}
        controls
        playsInline
        autoPlay={autoplay}
        muted={autoplay}
        preload={autoplay ? "auto" : "metadata"}
        style={{
          width: "100%",
          height,
          backgroundColor: "#0F172A",
          objectFit: "contain",
        }}
      />
    );
  }

  // ─── Native: render video qua WebView ───
  if (hasError) {
    return (
      <TouchableOpacity
        style={[styles.fallback, { height }]}
        activeOpacity={0.8}
        onPress={() => setHasError(false)}
      >
        <Ionicons name="reload-circle" size={32} color="#94A3B8" />
        <Text style={styles.fallbackText}>Không tải được video</Text>
        <Text style={styles.fallbackSubtext}>Nhấn để thử lại</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html: buildVideoHtml(uri, autoplay) }}
        style={styles.webview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        onHttpError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#94A3B8" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 8,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  fallback: {
    width: "100%",
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 12,
  },
  fallbackText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#94A3B8",
    textAlign: "center",
    fontWeight: "500",
  },
  fallbackSubtext: {
    fontSize: 11,
    lineHeight: 16,
    color: "#64748B",
    textAlign: "center",
  },
});
