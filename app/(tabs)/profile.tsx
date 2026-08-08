import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Platform, Modal } from "react-native";
import { useApp } from "../../lib/AppContext";
import { logoutUser } from "../../lib/firebase";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Mail, Phone, AtSign, CreditCard, Pencil, Check, X, LogOut } from "lucide-react-native";

export default function ProfileScreen() {
  const { user, profile, updateFullProfile } = useApp();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [upiId, setUpiId] = useState("");
  const [paymentPref, setPaymentPref] = useState<"cash" | "upi">("upi");
  const [confirmVisible, setConfirmVisible] = useState(false);

  const hydrate = () => {
    const parts = (profile?.name || "").split(" ");
    setFirstName(parts[0] || "");
    setSurname(profile?.surname || parts.slice(1).join(" ") || "");
    setNickname(profile?.nickname || "");
    setPhone(profile?.phone || "");
    setUpiId(profile?.upiId || "");
    setPaymentPref(profile?.paymentPreference || "upi");
  };

  useEffect(() => {
    hydrate();
  }, [profile]);

  const handleSave = async () => {
    const fn = firstName.trim();
    const sn = surname.trim();
    if (!fn) {
      Alert.alert("Error", "First name cannot be empty.");
      return;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phone.trim() && phoneDigits.length < 7) {
      Alert.alert("Error", "Please enter a valid phone number.");
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.username}>@{profile?.username || "username"}</Text>
          {!editing ? (
            <Pressable style={styles.editBtn} onPress={() => setEditing(true)}>
              <Pencil size={16} color={Colors.primary} />
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={styles.miniBtn} onPress={hydrate}>
                <X size={16} color={Colors.destructive} />
              </Pressable>
              <Pressable style={styles.miniBtn} onPress={handleSave}>
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.success} />
                ) : (
                  <Check size={16} color={Colors.success} />
                )}
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Mail size={16} color={Colors.mutedForeground} />
            <Text style={styles.infoText}>{user?.email}</Text>
          </View>

          {editing ? (
            <View style={styles.editForm}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={[styles.input, { opacity: 0.6 }]}
                  value={firstName}
                  editable={false}
                  placeholder="First Name"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Surname</Text>
                <TextInput
                  style={[styles.input, { opacity: 0.6 }]}
                  value={surname}
                  editable={false}
                  placeholder="Surname"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nickname</Text>
                <TextInput
                  style={[styles.input, { opacity: 0.6 }]}
                  value={nickname}
                  editable={false}
                  placeholder="Nickname"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={[styles.input, { opacity: 0.6 }]}
                  value={phone}
                  editable={false}
                  placeholder="Phone number"
                  placeholderTextColor={Colors.mutedForeground}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>UPI ID - Optional</Text>
                <TextInput
                  style={styles.input}
                  value={upiId}
                  onChangeText={setUpiId}
                  placeholder="UPI ID"
                  placeholderTextColor={Colors.mutedForeground}
                  autoCapitalize="none"
                />
              </View>
            </View>
          ) : (
            <View style={styles.profileDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Full Name</Text>
                <Text style={styles.detailValue}>{profile?.name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Nickname</Text>
                <Text style={styles.detailValue}>{profile?.nickname || "Not set"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Phone</Text>
                <Text style={styles.detailValue}>{profile?.phone || "Not set"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>UPI ID</Text>
                <Text style={styles.detailValue}>{profile?.upiId || "Not set"}</Text>
              </View>
            </View>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.9 }]}
          onPress={() => setConfirmVisible(true)}
        >
          <LogOut size={16} color={Colors.primaryForeground} style={{ marginRight: 6 }} />
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
              backgroundColor: "#F4EFE6",
              borderRadius: 28,
              borderWidth: 1,
              borderColor: "#E8E2D5",
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
                color: "#2B2927",
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: -0.5
              }}>Sign Out?</Text>
              <Text style={{
                fontSize: 14,
                color: "#5C5955",
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
                    borderColor: "#C5BFA5",
                    justifyContent: "center",
                    alignItems: "center"
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: "900",
                    color: "#5C5955",
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: Colors.background,
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
  },
  username: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  infoSection: {
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.mutedForeground,
  },
  profileDetails: {
    gap: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  detailLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
  },
  detailValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.foreground,
  },
  editForm: {
    gap: 12,
  },
  inputContainer: {
    gap: 4,
  },
  label: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: Colors.mutedForeground,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: Typography.fontSize.sm,
    color: Colors.foreground,
    backgroundColor: Colors.background,
  },
  logoutBtn: {
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  logoutText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
});
