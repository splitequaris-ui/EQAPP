import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useApp } from "../lib/AppContext";
import { db, auth as firebaseAuth } from "../lib/firebase";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import { dbSetDoc, dbGetDoc } from "../lib/firestoreQuery";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { logoutUser } from "../lib/firebase";
import { AlertCircle, Check, ChevronRight, CreditCard, LogOut, Phone, User } from "lucide-react-native";

export default function OnboardingScreen() {
  const { user, profile, updateFullProfile } = useApp();
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [upiId, setUpiId] = useState("");
  const [paymentPref, setPaymentPref] = useState<"cash" | "upi">("upi");

  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      if (profile.name) {
        const parts = profile.name.split(" ");
        setFirstName(parts[0] || "");
        if (parts.length > 1) {
          setSurname(parts.slice(1).join(" ") || "");
        }
      }
      if (profile.upiId) setUpiId(profile.upiId);
      if (profile.username) setUsername(profile.username);
      if (profile.nickname) setNickname(profile.nickname);
      if (profile.phone) setPhone(profile.phone);
      if (profile.paymentPreference) setPaymentPref(profile.paymentPreference);
    }
  }, [profile]);

  const checkUsernameUniqueness = async () => {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!clean) {
      setUsernameAvailable(null);
      return;
    }
    if (clean.length < 3) {
      setUsernameError("Username must be at least 3 characters.");
      setUsernameAvailable(false);
      return;
    }

    setCheckingUsername(true);
    setUsernameError(null);
    try {
      const snap = await dbGetDoc("usernames", clean);
      if (snap && snap.exists()) {
        const ownerUid = snap.data()?.uid;
        if (ownerUid === user?.uid) {
          setUsernameAvailable(true);
        } else {
          setUsernameAvailable(false);
          setUsernameError("This username is already taken.");
        }
      } else {
        const q = query(collection(db, "users"), where("username", "==", clean));
        const qSnap = await getDocs(q);
        let existsInUsers = false;
        qSnap.forEach((docSnap) => {
          if (docSnap.id !== user?.uid) {
            existsInUsers = true;
          }
        });

        if (existsInUsers) {
          setUsernameAvailable(false);
          setUsernameError("This username is already taken.");
        } else {
          setUsernameAvailable(true);
        }
      }
    } catch (err) {
      console.error(err);
      setUsernameError("Error connecting to check server.");
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleUsernameChange = (val: string) => {
    const cleanVal = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(cleanVal);
    setUsernameAvailable(null);
    setUsernameError(null);
  };

  const handleOnboardSubmit = async () => {
    if (!user) return;
    setErrorMsg(null);

    const fName = firstName.trim();
    const lName = surname.trim();
    const uName = username.trim().toLowerCase();
    const vpa = upiId.trim();
    const nick = nickname.trim();
    const phoneVal = phone.trim();

    if (!fName || !lName) {
      setErrorMsg("Please enter both your First Name and Surname.");
      return;
    }

    const phoneDigits = phoneVal.replace(/\D/g, "");
    if (phoneDigits.length < 7) {
      setErrorMsg("Please enter a valid phone number.");
      return;
    }

    if (!uName) {
      setErrorMsg("Choose a unique username.");
      return;
    }

    if (usernameAvailable === false || usernameError) {
      setErrorMsg("Please select an available unique username.");
      return;
    }

    setSaving(true);
    try {
      // Re-verify availability
      const snap = await dbGetDoc("usernames", uName);
      if (snap && snap.exists() && snap.data()?.uid !== user.uid) {
        setUsernameAvailable(false);
        setErrorMsg("This username was captured just now. Please try another one.");
        setSaving(false);
        return;
      }

      await setDoc(doc(db, "usernames", uName), {
        uid: user.uid,
        name: `${fName} ${lName}`,
        photoURL: user.photoURL || "",
      });

      const cleanedProfile = {
        uid: user.uid,
        name: `${fName} ${lName}`,
        surname: lName,
        nickname: nick || fName,
        phone: phoneVal,
        username: uName,
        upiId: vpa,
        paymentPreference: paymentPref,
        email: user.email || "",
        photoURL: user.photoURL || "",
        isOnboarded: true,
        friends: profile?.friends || [],
        sentRequests: profile?.sentRequests || [],
        receivedRequests: profile?.receivedRequests || [],
        themePreference: "light" as const,
        createdAt: profile?.createdAt || new Date().toISOString()
      };

      await dbSetDoc("users", user.uid, cleanedProfile);

      const publicProfile = {
        uid: user.uid,
        name: cleanedProfile.name,
        photoURL: cleanedProfile.photoURL,
        username: cleanedProfile.username,
        surname: cleanedProfile.surname,
        nickname: cleanedProfile.nickname,
      };
      await dbSetDoc("profiles", user.uid, publicProfile);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Server write failed. Please try saving again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>Equaris Mobile</Text>
          <Pressable style={styles.logoutButton} onPress={() => logoutUser()}>
            <LogOut size={14} color={Colors.destructive} style={{ marginRight: 4 }} />
            <Text style={styles.logoutText}>Abort</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Complete Account Setup</Text>
          <Text style={styles.subtitle}>
            Welcome to Equaris! Setup your user identity credentials so your peers can split and settle with you.
          </Text>

          <View style={styles.form}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={[styles.inputContainer, { flex: 1 }]}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="e.g. Parth"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>
              <View style={[styles.inputContainer, { flex: 1 }]}>
                <Text style={styles.label}>Surname</Text>
                <TextInput
                  style={styles.input}
                  value={surname}
                  onChangeText={setSurname}
                  placeholder="e.g. Tyagi"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Nickname</Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="How we'll call you"
                placeholderTextColor={Colors.mutedForeground}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. +91 9876543210"
                placeholderTextColor={Colors.mutedForeground}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputContainer}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.label}>Unique Username</Text>
                {username.trim().length >= 3 && (
                  <Pressable onPress={checkUsernameUniqueness} disabled={checkingUsername}>
                    <Text style={styles.checkText}>
                      {checkingUsername ? "Checking..." : "[ Verify Available ]"}
                    </Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={handleUsernameChange}
                placeholder="e.g. parth_tyagi"
                placeholderTextColor={Colors.mutedForeground}
                autoCapitalize="none"
              />
              {usernameAvailable !== null && (
                <Text style={[styles.hint, { color: usernameAvailable ? Colors.success : Colors.destructive }]}>
                  {usernameAvailable ? "Username is available!" : usernameError || "Username is taken."}
                </Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>UPI ID (VPA) - Optional</Text>
              <TextInput
                style={styles.input}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="e.g. parth@paytm"
                placeholderTextColor={Colors.mutedForeground}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Preferred Settlement Mode</Text>
              <View style={styles.prefRow}>
                <Pressable
                  style={[styles.prefBtn, paymentPref === "upi" && styles.prefBtnActive]}
                  onPress={() => setPaymentPref("upi")}
                >
                  <CreditCard size={16} color={paymentPref === "upi" ? Colors.primaryForeground : Colors.foreground} />
                  <Text style={[styles.prefText, paymentPref === "upi" && styles.prefTextActive]}>UPI</Text>
                </Pressable>
                <Pressable
                  style={[styles.prefBtn, paymentPref === "cash" && styles.prefBtnActive]}
                  onPress={() => setPaymentPref("cash")}
                >
                  <Text style={[styles.prefText, paymentPref === "cash" && styles.prefTextActive]}>Cash</Text>
                </Pressable>
              </View>
            </View>

            {errorMsg && (
              <View style={styles.errorAlert}>
                <AlertCircle size={16} color={Colors.destructive} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]}
              onPress={handleOnboardSubmit}
              disabled={saving || checkingUsername}
            >
              {saving ? (
                <ActivityIndicator color={Colors.primaryForeground} />
              ) : (
                <>
                  <Text style={styles.submitText}>Confirm & Start splitting</Text>
                  <ChevronRight size={18} color={Colors.primaryForeground} />
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    padding: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerSubtitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.mutedForeground,
    textTransform: "uppercase",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  logoutText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.destructive,
    fontWeight: Typography.fontWeight.semibold,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.mutedForeground,
    marginBottom: 20,
    lineHeight: 18,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    gap: 6,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.foreground,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: Typography.fontSize.sm,
    color: Colors.foreground,
    backgroundColor: Colors.background,
  },
  checkText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
  },
  hint: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  prefRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 3,
    backgroundColor: Colors.background,
  },
  prefBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  prefBtnActive: {
    backgroundColor: Colors.primary,
  },
  prefText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  prefTextActive: {
    color: Colors.primaryForeground,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fdf2f2",
    borderColor: "#fde8e8",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  errorText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.destructive,
    fontWeight: Typography.fontWeight.semibold,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  submitText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },
});
