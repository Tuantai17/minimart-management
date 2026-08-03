/**
 * MapPickerModal — Chọn địa chỉ trên bản đồ
 *
 * Dùng Leaflet + OpenStreetMap tiles (miễn phí, không cần API key)
 * Reverse geocode bằng Goong API để lấy địa chỉ Việt Nam chính xác.
 *
 * Giao tiếp giữa iframe (Leaflet) ↔ React Native qua postMessage.
 */
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../constants";
import {
  getCurrentCoordinates,
  reverseGeocodeToText,
} from "../../services/location.service";

// ============================================================
// Types
// ============================================================
export interface MapPickerResult {
  latitude: number;
  longitude: number;
  address_text: string;
}

interface Props {
  visible: boolean;
  initialLat?: number;
  initialLng?: number;
  onClose: () => void;
  onConfirm: (result: MapPickerResult) => void;
}

// ============================================================
// Tọa độ mặc định: TP.HCM
// ============================================================
const DEFAULT_LAT = 10.7769;
const DEFAULT_LNG = 106.7009;

// ============================================================
// HTML chứa Leaflet Map (tự chứa hoàn toàn trong iframe)
// ============================================================
const buildMapHTML = (lat: number, lng: number) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .crosshair {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -100%);
      z-index: 1000; pointer-events: none; font-size: 40px; color: #E53935;
      text-shadow: 0 4px 8px rgba(0,0,0,0.4);
      transition: transform 0.2s ease-out;
    }
    .crosshair.moving {
      transform: translate(-50%, -130%);
    }
    .info-bar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000;
      background: rgba(255,255,255,0.95); backdrop-filter: blur(8px);
      padding: 12px 16px; border-top: 1px solid #eee;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px; color: #333;
    }
    .info-bar .coords {
      font-size: 11px; color: #888; margin-top: 2px; font-family: monospace;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="crosshair">📍</div>
  <div class="info-bar" id="infoBar">
    <div>Chạm vào bản đồ để chọn vị trí giao hàng</div>
  </div>

  <script>
    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap, © CartoDB'
    }).addTo(map);

    sendCoords(${lat}, ${lng});

    var crosshair = document.querySelector('.crosshair');

    map.on('movestart', function() {
      if (crosshair) crosshair.classList.add('moving');
    });

    map.on('move', function() {
      var center = map.getCenter();
      updateInfoBar(center.lat, center.lng);
    });

    map.on('moveend', function() {
      if (crosshair) crosshair.classList.remove('moving');
      var center = map.getCenter();
      sendCoords(center.lat, center.lng);
    });

    window.addEventListener('message', function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === 'CENTER_TO') {
          map.setView([data.latitude, data.longitude], 15);
        }
      } catch (e) {}
    });

    document.addEventListener('message', function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === 'CENTER_TO') {
          map.setView([data.latitude, data.longitude], 15);
        }
      } catch (e) {}
    });

    function updateInfoBar(lat, lng) {
      document.getElementById('infoBar').innerHTML =
        '<div><b>Đang chọn vị trí...</b></div>' +
        '<div class="coords">(' + lat.toFixed(6) + ', ' + lng.toFixed(6) + ')</div>';
    }

    function sendCoords(lat, lng) {
      document.getElementById('infoBar').innerHTML =
        '<div><b>Đã chọn vị trí</b></div>' +
        '<div class="coords">(' + lat.toFixed(6) + ', ' + lng.toFixed(6) + ')</div>';

      var payload = JSON.stringify({
        type: 'MAP_PICK',
        latitude: lat,
        longitude: lng,
      });

      // Gửi tọa độ lên Web Iframe
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }

      // Gửi tọa độ lên React Native WebView
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(payload);
      }
    }
  </script>
</body>
</html>
`;

// ============================================================
// Component
// ============================================================
export default function MapPickerModal({
  visible,
  initialLat,
  initialLng,
  onClose,
  onConfirm,
}: Props) {
  const lat = initialLat ?? DEFAULT_LAT;
  const lng = initialLng ?? DEFAULT_LNG;

  const [selectedCoords, setSelectedCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [addressText, setAddressText] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isCenteringCurrentLocation, setIsCenteringCurrentLocation] =
    useState(false);
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeWebViewRef = useRef<WebView | null>(null);
  const mapHtml = useMemo(() => buildMapHTML(lat, lng), [lat, lng]);

  // Reset state khi mở modal
  useEffect(() => {
    if (visible) {
      setSelectedCoords({ latitude: lat, longitude: lng });
      setAddressText("");
      setIsGeocoding(false);
      // Reverse geocode vị trí ban đầu
      handleReverseGeocode(lat, lng);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse geocode
  const handleReverseGeocode = useCallback(
    async (latitude: number, longitude: number) => {
      setIsGeocoding(true);
      try {
        const text = await reverseGeocodeToText(latitude, longitude);
        setAddressText(text);
      } catch {
        setAddressText("Vị trí hiện tại");
      } finally {
        setIsGeocoding(false);
      }
    },
    [],
  );

  const scheduleReverseGeocode = useCallback(
    (latitude: number, longitude: number) => {
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }

      geocodeTimeoutRef.current = setTimeout(() => {
        void handleReverseGeocode(latitude, longitude);
      }, 1200);
    },
    [handleReverseGeocode],
  );

  const handleMapMessagePayload = useCallback(
    (payload: unknown) => {
      try {
        const data =
          typeof payload === "string" ? JSON.parse(payload) : payload;

        if (
          data &&
          typeof data === "object" &&
          "type" in data &&
          data.type === "MAP_PICK" &&
          "latitude" in data &&
          "longitude" in data &&
          typeof data.latitude === "number" &&
          typeof data.longitude === "number"
        ) {
          setSelectedCoords({
            latitude: data.latitude,
            longitude: data.longitude,
          });
          scheduleReverseGeocode(data.latitude, data.longitude);
        }
      } catch {
        // ignore malformed message
      }
    },
    [scheduleReverseGeocode],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;

    const handler = (event: MessageEvent) => {
      handleMapMessagePayload(event.data);
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    };
  }, [handleMapMessagePayload, visible]);

  useEffect(() => {
    if (!visible) {
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
    }
  }, [visible]);

  const handleUseCurrentLocation = useCallback(async () => {
    setIsCenteringCurrentLocation(true);

    try {
      const coords = await getCurrentCoordinates();

      if (!coords) {
        setAddressText("Không thể lấy vị trí hiện tại. Vui lòng thử lại.");
        return;
      }

      setSelectedCoords(coords);
      void handleReverseGeocode(coords.latitude, coords.longitude);

      if (Platform.OS !== "web") {
        nativeWebViewRef.current?.postMessage(
          JSON.stringify({
            type: "CENTER_TO",
            latitude: coords.latitude,
            longitude: coords.longitude,
          }),
        );
      }
    } finally {
      setIsCenteringCurrentLocation(false);
    }
  }, [handleReverseGeocode]);

  // Xác nhận chọn vị trí
  const handleConfirm = () => {
    if (!selectedCoords) return;
    onConfirm({
      latitude: selectedCoords.latitude,
      longitude: selectedCoords.longitude,
      address_text: addressText || "Vị trí trên bản đồ",
    });
  };

  const modalContent = (
    <View style={[
      styles.container,
      Platform.OS === "web" && {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        elevation: 99999,
      } as any
    ]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chọn trên bản đồ</Text>
        <TouchableOpacity
          onPress={() => void handleUseCurrentLocation()}
          style={styles.currentLocationBtn}
          disabled={isCenteringCurrentLocation}
        >
          {isCenteringCurrentLocation ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="locate" size={20} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Map surface */}
      <View style={styles.mapContainer}>
        {Platform.OS === "web" ? (
          <iframe
            title="map-picker"
            srcDoc={mapHtml}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        ) : (
          <WebView
            ref={nativeWebViewRef}
            originWhitelist={["*"]}
            source={{ html: mapHtml }}
            onMessage={(event) => handleMapMessagePayload(event.nativeEvent.data)}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.mapLoadingState}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.mapLoadingText}>Đang tải bản đồ...</Text>
              </View>
            )}
          />
        )}
      </View>

      {/* Bottom sheet — Thông tin vị trí đã chọn */}
      <View style={styles.bottomSheet}>
        {/* Địa chỉ */}
        <View style={styles.addressRow}>
          <View style={styles.addressIconCircle}>
            <Ionicons name="location" size={18} color="#E53935" />
          </View>
          <View style={styles.addressInfo}>
            {isGeocoding ? (
              <View style={styles.geocodingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.geocodingText}>
                  Đang tìm địa chỉ...
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.addressMainText} numberOfLines={2}>
                  {addressText || "Chạm vào bản đồ để chọn vị trí"}
                </Text>
                {selectedCoords && (
                  <Text style={styles.coordsText}>
                    ({selectedCoords.latitude.toFixed(5)},{" "}
                    {selectedCoords.longitude.toFixed(5)})
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        {/* Nút xác nhận */}
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            (!selectedCoords || isGeocoding) && styles.confirmBtnDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!selectedCoords || isGeocoding}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
          <Text style={styles.confirmBtnText}>Chọn vị trí này</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (Platform.OS === "web") {
    return visible ? modalContent : null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {modalContent}
    </Modal>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    ...Shadow.small,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    backgroundColor: "#F5F5F5",
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
  },

  // Map
  mapContainer: {
    flex: 1,
  },

  mapLoadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#F8FAFC",
  },
  mapLoadingText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  currentLocationBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
    backgroundColor: "#EEF2FF",
  },

  // Bottom sheet
  bottomSheet: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    ...Shadow.medium,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  addressIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFEBEE",
    alignItems: "center",
    justifyContent: "center",
  },
  addressInfo: {
    flex: 1,
  },
  addressMainText: {
    fontSize: FontSize.base,
    fontWeight: "500",
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  coordsText: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  geocodingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  geocodingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  // Confirm button
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.textLight,
  },
  confirmBtnText: {
    fontSize: FontSize.base,
    fontWeight: "700",
    color: Colors.white,
  },
});
