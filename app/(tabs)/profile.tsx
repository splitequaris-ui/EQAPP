import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Platform, Modal, Image as RNImage, Animated } from "react-native";
import { useApp } from "../../lib/AppContext";
import { logoutUser } from "../../lib/firebase";
import { useTheme } from "../../lib/ThemeContext";
import { AppColors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Mail, Phone, AtSign, CreditCard, Pencil, Check, X, LogOut, Sparkles, User, Lock, Image as ImageIcon, Sun, Moon, SunMoon } from "lucide-react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
  const { user, profile, updateFullProfile } = useApp();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [upiId, setUpiId] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [paymentPref, setPaymentPref] = useState<"cash" | "upi">("upi");
  const [confirmVisible, setConfirmVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    translateYAnim.setValue(6);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const hydrate = () => {
    const parts = (profile?.name || "").split(" ");
    setFirstName(parts[0] || "");
    setSurname(profile?.surname || parts.slice(1).join(" ") || "");
    setNickname(profile?.nickname || parts[0] || "");
    setPhone(profile?.phone || "");
    setUpiId(profile?.upiId || "");
    setPaymentPref(profile?.paymentPreference || "upi");
    setPhotoURL(profile?.photoURL || user?.photoURL || "");
  };

  useEffect(() => {
    hydrate();
  }, [profile, user]);

  const handleSave = async () => {
    const fn = firstName.trim();
    const sn = surname.trim();
    if (!fn) {
      Alert.alert("Error", "First name cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      await updateFullProfile({
        name: sn ? `${fn} ${sn}` : fn,
        surname: sn,
        nickname: nickname.trim() || fn,
        phone: phone.trim(),
        upiId: upiId.trim(),
        photoURL: photoURL.trim(),
        paymentPreference: paymentPref,
      });
      setEditing(false);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to save profile changes.");
    } finally {
      setSaving(false);
    }
  };

  const displayName = nickname.trim() || profile?.nickname || profile?.name || "User";
  const avatarUri = photoURL.trim() || profile?.photoURL || user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=3e8e7e&color=fff&size=200&bold=true`;

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: translateYAnim }] }}>
      <ScrollView contentContainerStyle={styles.container}>
      {/* 1. Top Profile Hero Card (Screenshot #1) */}
      <View style={styles.heroCard}>
        <Pressable onPress={() => setEditing(true)} style={styles.avatarContainer}>
          <RNImage source={{ uri: avatarUri }} style={styles.heroAvatarImg} />
        </Pressable>

        <Text style={styles.heroNickname}>{displayName}</Text>
        <Text style={styles.heroUsername}>@{profile?.username || "username"}</Text>

        <View style={styles.callsYouPill}>
          <Sparkles size={14} color={colors.foreground} />
          <Text style={styles.callsYouText}>The app calls you "{displayName}"</Text>
        </View>
      </View>

      {/* 2. Personal Details Card (Screenshots #1 & #2) */}
      <View style={styles.detailsCard}>
        <View style={styles.detailsHeaderRow}>
          <Text style={styles.detailsCardTitle}>Personal Details</Text>
          
          {!editing ? (
            <Pressable style={styles.editPillBtn} onPress={() => setEditing(true)}>
              <Pencil size={14} color={colors.foreground} />
              <Text style={styles.editPillText}>Edit</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable style={styles.cancelPillBtn} onPress={hydrate}>
                <X size={14} color={colors.destructive} />
                <Text style={styles.cancelPillText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.savePillBtn} onPress={handleSave}>
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Check size={14} color="#ffffff" />
                    <Text style={styles.savePillText}>Save</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.detailsList}>
          {/* NICKNAME */}
          <View style={styles.detailRowItem}>
            <View style={styles.detailIconBubble}>
              <Sparkles size={18} color={colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailMonoLabel}>NICKNAME</Text>
              {editing ? (
                <TextInput
                  style={styles.detailInput}
                  value={nickname}
                  onChangeText={setNickname}
                  placeholder="Nickname"
                  placeholderTextColor={colors.mutedForeground}
                />
              ) : (
                <Text style={styles.detailBoldValue}>{profile?.nickname || displayName}</Text>
              )}
            </View>
          </View>
          <View style={styles.detailDivider} />

          {/* FULL NAME */}
          <View style={styles.detailRowItem}>
            <View style={styles.detailIconBubble}>
              <User size={18} color={colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailMonoLabel}>FULL NAME</Text>
              {editing ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    style={[styles.detailInput, { flex: 1 }]}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First Name"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <TextInput
                    style={[styles.detailInput, { flex: 1 }]}
                    value={surname}
                    onChangeText={setSurname}
                    placeholder="Surname"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              ) : (
                <Text style={styles.detailBoldValue}>{profile?.name || "Not set"}</Text>
              )}
            </View>
          </View>
          <View style={styles.detailDivider} />

          {/* EMAIL */}
          <View style={styles.detailRowItem}>
            <View style={styles.detailIconBubble}>
              <Mail size={18} color={colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailMonoLabel}>EMAIL</Text>
              <Text style={styles.detailBoldValue}>{user?.email || profile?.email || "Not set"}</Text>
            </View>
            <Lock size={16} color={colors.mutedForeground} />
          </View>
          <View style={styles.detailDivider} />

          {/* PHONE */}
          <View style={styles.detailRowItem}>
            <View style={styles.detailIconBubble}>
              <Phone size={18} color={colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailMonoLabel}>PHONE</Text>
              {editing ? (
                <TextInput
                  style={styles.detailInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                />
              ) : (
                <Text style={styles.detailBoldValue}>{profile?.phone || "7703801301"}</Text>
              )}
            </View>
          </View>
          <View style={styles.detailDivider} />

          {/* USERNAME */}
          <View style={styles.detailRowItem}>
            <View style={styles.detailIconBubble}>
              <AtSign size={18} color={colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailMonoLabel}>USERNAME</Text>
              <Text style={styles.detailBoldValue}>@{profile?.username || "username"}</Text>
            </View>
            <Lock size={16} color={colors.mutedForeground} />
          </View>
          <View style={styles.detailDivider} />

          {/* UPI ID */}
          <View style={styles.detailRowItem}>
            <View style={styles.detailIconBubble}>
              <CreditCard size={18} color={colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailMonoLabel}>UPI ID</Text>
              {editing ? (
                <TextInput
                  style={styles.detailInput}
                  value={upiId}
                  onChangeText={setUpiId}
                  placeholder="UPI ID"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                />
              ) : (
                <Text style={styles.detailBoldValue}>{profile?.upiId || "Not set"}</Text>
              )}
            </View>
          </View>
          <View style={styles.detailDivider} />

          {/* PREFERRED PAYMENT */}
          <View style={styles.detailRowItem}>
            <View style={styles.detailIconBubble}>
              <CreditCard size={18} color={colors.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailMonoLabel}>PREFERRED PAYMENT</Text>
              <Text style={styles.detailBoldValue}>{paymentPref.toUpperCase()}</Text>
            </View>
          </View>

          {/* PHOTO URL (when editing) */}
          {editing ? (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRowItem}>
                <View style={styles.detailIconBubble}>
                  <ImageIcon size={18} color={colors.foreground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailMonoLabel}>PROFILE PHOTO URL</Text>
                  <TextInput
                    style={styles.detailInput}
                    value={photoURL}
                    onChangeText={setPhotoURL}
                    placeholder="https://example.com/photo.jpg"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </>
          ) : null}
        </View>
      </View>

      {/* Appearance / Theme Section */}
      <View style={{ marginBottom: 16, paddingHorizontal: 0 }}>
        <Text style={[styles.detailMonoLabel, { marginBottom: 12 }]}>APPEARANCE</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {([
            { key: "light", label: "Light", Icon: Sun },
            { key: "dark",  label: "Dark",  Icon: Moon },
            { key: "system", label: "System", Icon: SunMoon },
          ] as const).map(({ key, label, Icon }) => {
            const active = preference === key;
            return (
              <Pressable
                key={key}
                onPress={() => setPreference(key)}
                style={[{
                  flex: 1,
                  flexDirection: "column",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  gap: 6,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : colors.card,
                }]}
              >
                <Icon size={18} color={active ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: active ? colors.primaryForeground : colors.mutedForeground,
                }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.9 }]}
        onPress={() => setConfirmVisible(true)}
      >
        <LogOut size={16} color={colors.primaryForeground} style={{ marginRight: 6 }} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>

        {/* Custom Confirmation Modal */}
        <Modal
          transparent={true}
          visible={confirmVisible}
          animationType="fade"
          onRequestClose={() => setConfirmVisible(false)}
        >
          <View style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center"
          }}>
            <View style={{
              width: "90%",
              maxWidth: 340,
              backgroundColor: colors.card,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 28,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 10
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: "900",
                color: colors.foreground,
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: -0.5
              }}>Sign Out?</Text>
              <Text style={{
                fontSize: 14,
                color: colors.mutedForeground,
                lineHeight: 20,
                marginBottom: 24
              }}>Are you sure you want to sign out? You will need to log back in to access your ledger.</Text>
              <View style={{
                flexDirection: "row",
                gap: 12,
                justifyContent: "space-between"
              }}>
                <Pressable
                  onPress={() => setConfirmVisible(false)}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: colors.border,
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: "900",
                    color: colors.mutedForeground,
                    textTransform: "uppercase",
                    letterSpacing: 0.5
                  }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    setConfirmVisible(false);
                    try {
                      await logoutUser();
                    } catch (err) {
                      console.error("Sign out failed:", err);
                      Alert.alert("Error", "Failed to sign out.");
                    }
                  }}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: "#E50000",
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: "900",
                    color: "#FFFFFF",
                    textTransform: "uppercase",
                    letterSpacing: 0.5
                  }}>Sign Out</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
    </ScrollView>
  </Animated.View>
  );
}

function createStyles(colors: AppColors) { return StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: colors.background,
    flexGrow: 1,
    paddingTop: 45,
  },
  heroCard: {
    backgroundColor: colors.glassCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: "hidden",
    backgroundColor: colors.secondary,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: colors.card,
  },
  heroAvatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  heroNickname: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  heroUsername: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  callsYouPill: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  callsYouText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: colors.foreground,
    fontWeight: "500",
  },
  detailsCard: {
    backgroundColor: colors.glassCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  detailsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  detailsCardTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: "900",
    color: colors.foreground,
  },
  editPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  editPillText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: colors.foreground,
    fontFamily: Typography.fontFamily.mono,
  },
  cancelPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  cancelPillText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: colors.destructive,
    fontFamily: Typography.fontFamily.mono,
  },
  savePillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.primary,
  },
  savePillText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: colors.primaryForeground,
    fontFamily: Typography.fontFamily.mono,
  },
  detailsList: {
    gap: 10,
  },
  detailRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  detailIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailMonoLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.mono,
    color: colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  detailBoldValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.foreground,
    marginTop: 2,
  },
  detailInput: {
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: Typography.fontSize.sm,
    color: colors.foreground,
    backgroundColor: colors.background,
    marginTop: 2,
    width: "100%",
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  logoutBtn: {
    backgroundColor: colors.destructive,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  logoutText: {
    color: "#ffffff",
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
}); }
