import * as Location from "expo-location";
import { Platform } from "react-native";
import { Config } from "../constants";

const GOONG_API_KEY = process.env.EXPO_PUBLIC_GOONG_API_KEY?.trim() || "";
let hasWarnedMissingGoongKey = false;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

type ReverseGeocodeDetails = {
  province: string;
  district: string;
  street: string;
};

const isValidText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const firstText = (...values: unknown[]): string => {
  const found = values.find(isValidText);
  return found ? found.trim() : "";
};

const getGoongApiKey = (): string | null => {
  if (
    GOONG_API_KEY &&
    GOONG_API_KEY !== "your_goong_api_key" &&
    !GOONG_API_KEY.includes("your_") &&
    !GOONG_API_KEY.includes("placeholder")
  ) {
    return GOONG_API_KEY;
  }

  if (!hasWarnedMissingGoongKey) {
    console.warn(
      "[LocationService] Missing or invalid EXPO_PUBLIC_GOONG_API_KEY. Goong geocoding is disabled.",
    );
    hasWarnedMissingGoongKey = true;
  }

  return null;
};

const getWebCoordinates = async (): Promise<Coordinates | null> => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => {
        console.warn("[LocationService] Browser GPS error:", error);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 8000,
      },
    );
  });
};

export const getCurrentCoordinates = async (): Promise<Coordinates | null> => {
  try {
    if (Platform.OS === "web") {
      const webCoords = await getWebCoordinates();
      if (webCoords) return webCoords;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      return null;
    }

    const lastLoc = await Location.getLastKnownPositionAsync();
    if (lastLoc) {
      return {
        latitude: lastLoc.coords.latitude,
        longitude: lastLoc.coords.longitude,
      };
    }

    const loc = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout getting location")), 8000),
      ),
    ]);

    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
  } catch (err) {
    console.warn("[LocationService] GPS error:", err);
    return null;
  }
};

export const reverseGeocodeToText = async (
  latitude: number,
  longitude: number,
): Promise<string> => {
  const apiKey = getGoongApiKey();

  if (!apiKey) {
    return await reverseGeocodeToTextOSM(latitude, longitude);
  }

  try {
    const url = `https://rsapi.goong.io/Geocode?latlng=${latitude},${longitude}&api_key=${apiKey}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`[LocationService] Goong reverse geocode HTTP ${res.status}`);
      return await reverseGeocodeToTextOSM(latitude, longitude);
    }

    const data = await res.json();
    const addr = data?.results?.[0]?.formatted_address;
    if (isValidText(addr)) return addr.trim();
  } catch (err) {
    console.warn("[LocationService] Goong reverse geocode error, falling back to OSM:", err);
    return await reverseGeocodeToTextOSM(latitude, longitude);
  }

  return "Vị trí đã chọn";
};

const reverseGeocodeToTextOSM = async (lat: number, lon: number): Promise<string> => {
  const fallbackText = `Vị trí đã chọn (${lat.toFixed(6)}, ${lon.toFixed(6)})`;

  try {
    const url = `${Config.API_BASE_URL}/location/reverse-geocode/?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return isValidText(data?.display_name) ? data.display_name.trim() : fallbackText;
    }
    console.warn(`[LocationService] OSM reverse text HTTP ${res.status}`);
  } catch (err) {
    console.warn("[LocationService] OSM reverse text error:", err);
  }

  return fallbackText;
};

export const reverseGeocodeToDetails = async (
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeDetails | null> => {
  const apiKey = getGoongApiKey();

  if (!apiKey) {
    return await reverseGeocodeToDetailsOSM(latitude, longitude);
  }

  try {
    const url = `https://rsapi.goong.io/Geocode?latlng=${latitude},${longitude}&api_key=${apiKey}`;
    const res = await fetch(url);

    if (!res.ok) {
      return await reverseGeocodeToDetailsOSM(latitude, longitude);
    }

    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return await reverseGeocodeToDetailsOSM(latitude, longitude);

    const compound = result.compound;
    if (compound) {
      return normalizeDetails({
        province: compound.province,
        district: compound.district,
        street: [compound.street, compound.commune].filter(Boolean).join(", "),
        displayName: result.formatted_address,
      });
    }

    if (isValidText(result.formatted_address)) {
      const parts = result.formatted_address.split(",").map((part: string) => part.trim()).filter(Boolean);
      return normalizeDetails({
        province: parts.at(-1),
        district: parts.at(-2),
        street: parts.slice(0, -2).join(", "),
        displayName: result.formatted_address,
      });
    }
  } catch (err) {
    console.warn("[LocationService] Goong reverse details error, falling back to OSM:", err);
    return await reverseGeocodeToDetailsOSM(latitude, longitude);
  }

  return await reverseGeocodeToDetailsOSM(latitude, longitude);
};

const normalizeProvince = (value: string): string =>
  value
    .replace(/^Thành phố\s+/i, "TP. ")
    .replace(/^Tỉnh\s+/i, "")
    .trim();

const extractProvinceFromDisplayName = (displayName: unknown): string => {
  if (!isValidText(displayName)) return "";

  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  const province = parts
    .slice()
    .reverse()
    .find((part) => /^Thành phố\s+/i.test(part) || /^Tỉnh\s+/i.test(part));

  return province || "";
};

const normalizeDetails = ({
  province,
  district,
  street,
  displayName,
}: {
  province?: unknown;
  district?: unknown;
  street?: unknown;
  displayName?: unknown;
}): ReverseGeocodeDetails | null => {
  const normalizedProvince = normalizeProvince(firstText(province));
  const normalizedDistrict = firstText(district);
  const normalizedStreet = firstText(street, displayName);

  if (!normalizedProvince && !normalizedDistrict && !normalizedStreet) {
    return null;
  }

  return {
    province: normalizedProvince,
    district: normalizedDistrict,
    street: normalizedStreet,
  };
};

const reverseGeocodeToDetailsOSM = async (
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeDetails | null> => {
  try {
    const url = `${Config.API_BASE_URL}/location/reverse-geocode/?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[LocationService] Nominatim details HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!data || data.source === "fallback") {
      return normalizeDetails({
        street: data?.display_name || `Vị trí đã chọn (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
      });
    }

    const addr = data.address || {};
    const province = firstText(
      addr.state,
      addr.province,
      addr.municipality,
      extractProvinceFromDisplayName(data.display_name),
      addr.city,
    );
    const district = firstText(
      addr.city_district,
      addr.district,
      addr.county,
      addr.city,
      addr.town,
      addr.suburb,
      addr.quarter,
    );
    const street = [
      addr.house_number || addr.building,
      addr.road || addr.pedestrian || addr.footway,
      addr.neighbourhood || addr.village || addr.hamlet,
    ]
      .filter(isValidText)
      .join(" ");

    return normalizeDetails({
      province,
      district,
      street,
      displayName: data.display_name,
    });
  } catch (err) {
    console.warn("[LocationService] Nominatim details error:", err);
  }

  return null;
};

export const geocodeAddress = async (
  addressText: string,
): Promise<{ lat: number; lng: number } | null> => {
  const apiKey = getGoongApiKey();

  if (!apiKey) {
    return null;
  }

  try {
    const url = `https://rsapi.goong.io/geocode?address=${encodeURIComponent(addressText)}&api_key=${apiKey}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`[LocationService] Goong geocode HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const location = data?.results?.[0]?.geometry?.location;
    if (location) {
      return { lat: location.lat, lng: location.lng };
    }
  } catch (err) {
    console.warn("[LocationService] Goong geocode error:", err);
  }

  return null;
};
