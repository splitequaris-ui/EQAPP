import React, { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import { AppProvider, useApp } from "../lib/AppContext";
import { ActivityIndicator, View } from "react-native";
import { Colors } from "../constants/colors";

function AppContent() {
  const { user, profile, isLoadingAuth } = useApp();
  const segments = useSegments();

  useEffect(() => {
    if (isLoadingAuth) return;

    const inAuthGroup = (segments[0] as string) === "(auth)";
    const inOnboarding = (segments[0] as string) === "onboarding";

    if (!user) {
      // Redirect to login if not authenticated
      if (!inAuthGroup) {
        router.replace("/(auth)/login");
      }
    } else if (!profile || !profile.isOnboarded) {
      // Redirect to onboarding if profile is not completed
      if (!inOnboarding) {
        router.replace("/onboarding");
      }
    } else {
      // Redirect to tabs if authenticated and onboarded
      if (inAuthGroup || inOnboarding || (segments.length as number) === 0) {
        router.replace("/(tabs)");
      }
    }
  }, [user, profile, isLoadingAuth, segments]);

  if (isLoadingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
