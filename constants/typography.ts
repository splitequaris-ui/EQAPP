import { Platform } from "react-native";

export const Typography = {
  fontFamily: {
    sans: Platform.select({ ios: "System", android: "sans-serif" }) || "sans-serif",
    mono: Platform.select({ ios: "Courier", android: "monospace" }) || "monospace",
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 30,
  },
  fontWeight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
};
