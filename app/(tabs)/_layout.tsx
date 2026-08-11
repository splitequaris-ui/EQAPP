import React, { useRef } from "react";
import { Text, View, Pressable, Animated } from "react-native";
import { Tabs } from "expo-router";
import { LayoutDashboard, Users, QrCode, Wallet, User, Sun, Moon } from "lucide-react-native";
import { useTheme } from "../../lib/ThemeContext";
import EquarisWalletLogo from "../../components/EquarisWalletLogo";

function ThemeToggleButton() {
  const { setPreference, isDark, colors } = useTheme();
  const animVal = useRef(new Animated.Value(0)).current;

  const toggleTheme = () => {
    // Animate rotation & scale
    animVal.setValue(0);
    Animated.spring(animVal, {
      toValue: 1,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();

    // Only 2 options in header: light and dark
    const nextTheme = isDark ? "light" : "dark";
    setPreference(nextTheme);
  };

  const spin = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const scale = animVal.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.25, 1],
  });

  const Icon = isDark ? Moon : Sun;
  const color = isDark ? "#f0ebe0" : colors.primary;

  return (
    <Pressable
      onPress={toggleTheme}
      style={({ pressed }) => ({
        marginRight: 14,
        padding: 8,
        borderRadius: 20,
        opacity: pressed ? 0.7 : 1,
      })}
      hitSlop={8}
    >
      <Animated.View style={{ transform: [{ rotate: spin }, { scale }] }}>
        <Icon size={22} color={color} />
      </Animated.View>
    </Pressable>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();

  const headerTitleStyle = {
    fontSize: 24,
    fontWeight: "800" as const,
    color: colors.primary,
    letterSpacing: -0.4,
  };

  const sharedHeaderStyle = {
    backgroundColor: colors.headerBackground,
    borderBottomColor: colors.headerBorder,
    borderBottomWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
  };

  return (
    <Tabs
      screenOptions={{
        animation: "fade",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.headerBorder,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 0,
        },
        headerStyle: sharedHeaderStyle,
        headerTitleStyle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerStyle: sharedHeaderStyle,
          headerTitle: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <EquarisWalletLogo size={34} />
              <Text style={{ fontSize: 26, fontWeight: "800", color: colors.primary, letterSpacing: -0.4 }}>
                Equaris
              </Text>
            </View>
          ),
          headerRight: () => <ThemeToggleButton />,
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          headerTitle: () => <Text style={headerTitleStyle}>My Groups</Text>,
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: "Network",
          headerTitle: () => <Text style={headerTitleStyle}>Network Hub</Text>,
          tabBarIcon: ({ color, size }) => <QrCode size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="money"
        options={{
          title: "Money",
          headerTitle: () => <Text style={headerTitleStyle}>Money</Text>,
          tabBarIcon: ({ color, size }) => <Wallet size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          headerTitle: () => <Text style={headerTitleStyle}>Profile</Text>,
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
