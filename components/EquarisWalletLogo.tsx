import React from "react";
import { Image, View, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";

interface EquarisWalletLogoProps {
  size?: number;
  style?: any;
}

export default function EquarisWalletLogo({ size = 36, style }: EquarisWalletLogoProps) {
  let isDark = false;
  try {
    const theme = useTheme();
    isDark = theme?.isDark ?? false;
  } catch (e) {
    isDark = false;
  }

  return (
    <View style={[{ width: size, height: size, justifyContent: "center", alignItems: "center" }, style]}>
      <Image
        source={
          isDark
            ? require("../assets/logo-dark-transparent.png")
            : require("../assets/logo-transparent.png")
        }
        style={{ width: size, height: size, resizeMode: "contain" }}
      />
    </View>
  );
}
