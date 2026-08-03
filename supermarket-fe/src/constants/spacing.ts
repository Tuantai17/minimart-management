import { Platform } from "react-native";

/** Spacing, sizing, radius tokens */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const FontSize = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  title: 32,
} as const;

export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const IconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
  xxl: 32,
} as const;

export const buildShadow = (
  y: number,
  blur: number,
  opacity: number,
  elevation: number,
) =>
  Platform.select({
    web: {
      boxShadow: `0px ${y}px ${blur * 2}px rgba(0, 0, 0, ${opacity})`,
    },
    default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
      elevation,
    },
  });

export const Shadow = {
  small: buildShadow(1, 2, 0.08, 2),
  medium: buildShadow(2, 4, 0.1, 4),
  large: buildShadow(4, 8, 0.15, 8),
} as const;
