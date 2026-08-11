import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image, Dimensions, Platform, Alert } from "react-native";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useTheme } from "../../lib/ThemeContext";
import { AppColors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { useApp } from "../../lib/AppContext";
import { AlertCircle, Lock, Mail, User, ChevronLeft } from "lucide-react-native";
import GoogleLogo from "../../components/GoogleLogo";
import EquarisWalletLogo from "../../components/EquarisWalletLogo";

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { navigate } = useApp();
  const [stage, setStage] = useState<"welcome" | "auth">("welcome");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const getFriendlyError = (err: any): string => {
    const code: string = err?.code || "";
    const map: Record<string, string> = {
      "auth/user-not-found": "No account found with this email address.",
      "auth/wrong-password": "Incorrect password. Please try again.",
      "auth/invalid-credential": "Invalid email or password. Please check your credentials.",
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
      "auth/network-request-failed": "Network error. Check your connection.",
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    };
    return map[code] || err?.message || "Authentication failed.";
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (Platform.OS === "web") {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } else {
        Alert.alert(
          "Mobile Google Login",
          "Direct Google popup sign-in is supported on the web version of Equaris. Please log in with your email & password on mobile."
        );
      }
    } catch (err: any) {
      setAuthError(getFriendlyError(err));
      setStage("auth"); // Move to auth stage to show the error alert
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email.trim()) return setAuthError("Email is required.");
    if (!password.trim()) return setAuthError("Password is required.");
    if (mode === "signup" && !username.trim()) return setAuthError("Your name is required.");

    if (mode === "signup") {
      if (password.length < 8) {
        return setAuthError("Password must be at least 8 characters long.");
      }
      if (!/[A-Z]/.test(password)) {
        return setAuthError("Password must contain at least one uppercase letter.");
      }
      if (!/[a-z]/.test(password)) {
        return setAuthError("Password must contain at least one lowercase letter.");
      }
      if (!/[0-9]/.test(password)) {
        return setAuthError("Password must contain at least one number.");
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return setAuthError("Password must contain at least one special character.");
      }
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (username.trim()) {
          await updateProfile(cred.user, { displayName: username.trim() });
        }
      }
      // App state redirects automatically from root layout
    } catch (err: any) {
      setAuthError(getFriendlyError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  if (stage === "welcome") {
    return (
      <View style={styles.welcomeContainer}>
        <View style={styles.welcomeHeader}>
          <EquarisWalletLogo size={54} />
        </View>

        <View style={styles.illustrationContainer}>
          <Image
            source={require("../../src/assets/couple-illustration-trans.png")}
            style={styles.welcomeIllustration}
            resizeMode="contain"
          />
        </View>

        <View style={styles.welcomeContent}>
          <Text style={styles.welcomeTitle}>Share. Split. Settle.</Text>

          <View style={styles.welcomeButtonGroup}>
            <Pressable
              style={({ pressed }) => [
                styles.welcomeBtn,
                pressed && { opacity: 0.9 },
                authLoading && { backgroundColor: colors.muted }
              ]}
              onPress={handleGoogleSignIn}
              disabled={authLoading}
            >
              {authLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                  <GoogleLogo size={22} />
                  <Text style={[styles.welcomeBtnText, { marginLeft: 10 }]}>Continue with Google</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.welcomeBtn, pressed && { opacity: 0.9 }]}
              onPress={() => {
                setMode("signup");
                setStage("auth");
              }}
            >
              <View style={styles.signUpBtnContent}>
                <Text style={styles.welcomeBtnText}>Sign Up</Text>
              </View>
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              setMode("signin");
              setStage("auth");
            }}
            style={styles.welcomeLoginLink}
          >
            <Text style={styles.welcomeLoginText}>
              Already have an account? <Text style={styles.welcomeLoginHighlight}>Log In</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable style={styles.backBtn} onPress={() => setStage("welcome")}>
        <ChevronLeft size={20} color={colors.foreground} />
        <Text style={styles.backBtnText}>Back</Text>
      </Pressable>

      <View style={styles.card}>
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
            <EquarisWalletLogo size={40} />
            <Text style={styles.logoText}>Equaris</Text>
          </View>
          <Text style={styles.title}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "signin"
              ? "Sign in to track splits and settle up with your people."
              : "Start splitting expenses fairly in seconds."}
          </Text>
        </View>

        {authError && (
          <View style={styles.errorAlert}>
            <AlertCircle size={16} color={colors.destructive} style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        )}

        <View style={styles.form}>
          {mode === "signup" && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Name</Text>
              <View style={styles.inputWrapper}>
                <User size={18} color={colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Your name"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
            {mode === "signup" && (
              <Text style={styles.passwordHint}>
                Must be at least 8 characters with an uppercase letter, lowercase letter, number, and symbol.
              </Text>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.9 },
              authLoading && { backgroundColor: colors.muted }
            ]}
            onPress={handleEmailAuth}
            disabled={authLoading}
          >
            {authLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>
                {mode === "signin" ? "Sign In" : "Create Account"}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {mode === "signin" ? "New to Equaris? " : "Already have an account? "}
          </Text>
          <Pressable
            onPress={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setAuthError(null);
            }}
          >
            <Text style={styles.footerLink}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    card: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    header: {
      alignItems: "center",
      marginBottom: 24,
    },
    logoText: {
      fontFamily: Typography.fontFamily.sans,
      fontSize: Typography.fontSize.xxl,
      fontWeight: Typography.fontWeight.bold,
      color: colors.primary,
      marginBottom: 8,
    },
    title: {
      fontSize: Typography.fontSize.xl,
      fontWeight: Typography.fontWeight.semibold,
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 4,
    },
    subtitle: {
      fontSize: Typography.fontSize.sm,
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 10,
    },
    errorAlert: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.destructive + "15",
      borderColor: colors.destructive + "30",
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 20,
    },
    errorText: {
      flex: 1,
      fontSize: Typography.fontSize.xs,
      color: colors.destructive,
      fontWeight: Typography.fontWeight.medium,
    },
    form: {
      gap: 16,
    },
    inputContainer: {
      gap: 6,
    },
    label: {
      fontSize: Typography.fontSize.sm,
      fontWeight: Typography.fontWeight.medium,
      color: colors.foreground,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      height: 48,
    },
    inputIcon: {
      marginRight: 8,
    },
    input: {
      flex: 1,
      height: "100%",
      color: colors.foreground,
      fontSize: Typography.fontSize.base,
    },
    passwordHint: {
      fontSize: 10,
      color: colors.mutedForeground,
      marginTop: 2,
      lineHeight: 12,
    },
    button: {
      backgroundColor: colors.primary,
      height: 48,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 10,
    },
    buttonText: {
      color: colors.primaryForeground,
      fontSize: Typography.fontSize.base,
      fontWeight: Typography.fontWeight.semibold,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 24,
    },
    footerText: {
      fontSize: Typography.fontSize.sm,
      color: colors.mutedForeground,
    },
    footerLink: {
      fontSize: Typography.fontSize.sm,
      color: colors.primary,
      fontWeight: Typography.fontWeight.semibold,
    },
    welcomeContainer: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingVertical: 20,
      justifyContent: "space-between",
      alignItems: "center",
    },
    welcomeHeader: {
      width: "100%",
      alignItems: "center",
      paddingTop: 10,
      marginBottom: 5,
    },
    welcomeLogo: {
      width: 70,
      height: 70,
    },
    illustrationContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      width: "100%",
      marginVertical: 10,
    },
    welcomeIllustration: {
      width: "85%",
      height: undefined,
      aspectRatio: 494 / 545,
      maxHeight: 280,
    },
    welcomeContent: {
      width: "100%",
      alignItems: "center",
      paddingBottom: 15,
    },
    welcomeTitle: {
      fontSize: Typography.fontSize.xxl,
      fontWeight: "bold",
      color: colors.primary,
      marginBottom: 16,
      textAlign: "center",
    },
    welcomeButtonGroup: {
      width: "100%",
      gap: 12,
      marginBottom: 16,
    },
    welcomeBtn: {
      backgroundColor: colors.primary,
      height: 48,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    welcomeBtnText: {
      color: colors.primaryForeground,
      fontSize: Typography.fontSize.base,
      fontWeight: "bold",
    },
    signUpBtnContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    welcomeLoginLink: {
      paddingVertical: 6,
    },
    welcomeLoginText: {
      fontSize: Typography.fontSize.sm,
      color: colors.mutedForeground,
    },
    welcomeLoginHighlight: {
      color: colors.primary,
      fontWeight: "bold",
    },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
      alignSelf: "flex-start",
    },
    backBtnText: {
      fontSize: Typography.fontSize.sm,
      color: colors.foreground,
      marginLeft: 4,
      fontWeight: "bold",
    },
  });
}
