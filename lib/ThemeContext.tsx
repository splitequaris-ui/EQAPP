import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Appearance, ColorSchemeName, Animated, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lightColors, darkColors, AppColors } from "../constants/colors";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  isDark: boolean;
  colors: AppColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  setPreference: () => { },
  isDark: false,
  colors: lightColors,
});

const STORAGE_KEY = "@equaris_theme_pref";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme()
  );

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const isDark =
    preference === "dark" ||
    (preference === "system" && systemScheme === "dark");

  const prevIsDarkRef = useRef(isDark);

  useEffect(() => {
    prevIsDarkRef.current = isDark;
  }, [isDark]);

  const triggerThemeTransition = useCallback(() => {
    fadeAnim.setValue(0.7);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setPreferenceState(saved);
      }
    });
  }, []);

  // Listen to system theme changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
      const nextIsDark =
        preference === "dark" ||
        (preference === "system" && colorScheme === "dark");
      if (nextIsDark !== prevIsDarkRef.current) {
        triggerThemeTransition();
      }
    });
    return () => sub.remove();
  }, [preference, triggerThemeTransition]);

  const setPreference = useCallback((newPref: ThemePreference) => {
    const nextIsDark =
      newPref === "dark" ||
      (newPref === "system" && systemScheme === "dark");

    // Only trigger animation if the visual theme actually changes
    if (nextIsDark !== prevIsDarkRef.current) {
      triggerThemeTransition();
    }

    prevIsDarkRef.current = nextIsDark;
    setPreferenceState(newPref);
    AsyncStorage.setItem(STORAGE_KEY, newPref);
  }, [systemScheme, triggerThemeTransition]);

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ preference, setPreference, isDark, colors }}>
      <Animated.View style={[styles.flex, { opacity: fadeAnim }]}>
        {children}
      </Animated.View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

export function useTheme() {
  return useContext(ThemeContext);
}
