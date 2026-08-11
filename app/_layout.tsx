import React, { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import { AppProvider, useApp } from "../lib/AppContext";
import { ThemeProvider, useTheme } from "../lib/ThemeContext";
import { ActivityIndicator, View } from "react-native";

import { SafeAreaProvider } from "react-native-safe-area-context";

function AppContent() {
  const { user, profile, isLoadingAuth } = useApp();
  const { colors } = useTheme();
  const segments = useSegments();

  useEffect(() => {
    if (isLoadingAuth) return;

    const inAuthGroup = (segments[0] as string) === "(auth)";
    const inOnboarding = (segments[0] as string) === "onboarding";

    if (!user) {
      if (!inAuthGroup) {
        router.replace("/(auth)/login");
      }
    } else if (!profile || !profile.isOnboarded) {
      if (!inOnboarding) {
        router.replace("/onboarding");
      }
    } else {
      if (inAuthGroup || inOnboarding || (segments.length as number) === 0) {
        router.replace("/(tabs)");
      }
    }
  }, [user, profile, isLoadingAuth, segments]);

  if (isLoadingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade_from_bottom",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="subscription/new" options={{ headerShown: false }} />
      <Stack.Screen name="subscription/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="settlements" options={{ headerShown: false }} />
      <Stack.Screen name="reports" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
