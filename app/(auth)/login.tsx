import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { useApp } from "../../lib/AppContext";
import { AlertCircle, Lock, Mail, User } from "lucide-react-native";

export default function LoginScreen() {
  const { navigate } = useApp();
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
    };
    return map[code] || err?.message || "Authentication failed.";
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

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.logoText}>Equaris</Text>
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
            <AlertCircle size={16} color={Colors.destructive} style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        )}

        <View style={styles.form}>
          {mode === "signup" && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Name</Text>
              <View style={styles.inputWrapper}>
                <User size={18} color={Colors.mutedForeground} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Your name"
                  placeholderTextColor={Colors.mutedForeground}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Mail size={18} color={Colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Lock size={18} color={Colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.mutedForeground}
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
              authLoading && { backgroundColor: Colors.muted }
            ]}
            onPress={handleEmailAuth}
            disabled={authLoading}
          >
            {authLoading ? (
              <ActivityIndicator color={Colors.primaryForeground} />
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

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.primary,
    marginBottom: 8,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.foreground,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.mutedForeground,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fdf2f2",
    borderColor: "#fde8e8",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    flex: 1,
    fontSize: Typography.fontSize.xs,
    color: Colors.destructive,
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
    color: Colors.foreground,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: "100%",
    color: Colors.foreground,
    fontSize: Typography.fontSize.base,
  },
  passwordHint: {
    fontSize: 10,
    color: Colors.mutedForeground,
    marginTop: 2,
    lineHeight: 12,
  },
  button: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: Colors.primaryForeground,
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
    color: Colors.mutedForeground,
  },
  footerLink: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
  },
});
