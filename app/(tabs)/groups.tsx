import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, ActivityIndicator, Alert, Platform, Image, KeyboardAvoidingView, Animated } from "react-native";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { dbSetDoc, dbDeleteDoc, dbGetDocsInBatches } from "../../lib/firestoreQuery";
import { useTheme } from "../../lib/ThemeContext";
import { AppColors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { 
  Users, 
  Plus, 
  X, 
  ChevronRight, 
  Trash2, 
  Plane, 
  Home, 
  GraduationCap, 
  Rocket, 
  Sparkles,
  ShieldAlert,
  Check
} from "lucide-react-native";

const CONTEXT_PRESETS = {
  trip: { label: "Trip", icon: Plane, desc: "Vacations, road trips" },
  roommates: { label: "Roommates", icon: Home, desc: "Shared rent, utilities" },
  student: { label: "Student", icon: GraduationCap, desc: "Hostels, roommate splits" },
  startup: { label: "Startup", icon: Rocket, desc: "Software, shared tools" },
  group: { label: "Custom", icon: Users, desc: "Outings, dining, custom splits" }
};

import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function GroupsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
  const { user, profile, groups, navigate } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailySpendCap, setDailySpendCap] = useState("");
  const [category, setCategory] = useState<keyof typeof CONTEXT_PRESETS>("trip");

  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedGroupName, setSelectedGroupName] = useState("");

  const [creationStep, setCreationStep] = useState<1 | 2>(1);

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

  // Fetch profiles for the user's friends list
  useEffect(() => {
    if (!user || !profile?.friends || profile.friends.length === 0) {
      setFriendsList([]);
      return;
    }
    const loadFriends = async () => {
      setLoadingFriends(true);
      try {
        const list = await dbGetDocsInBatches("profiles", "uid", profile.friends || []);
        setFriendsList(list || []);
      } catch (err) {
        console.error("Failed to load friends profiles", err);
      } finally {
        setLoadingFriends(false);
      }
    };
    if (showModal) {
      loadFriends();
    }
  }, [user, profile?.friends, showModal]);

  const handleCreateGroup = async () => {
    if (!user || !profile) return;
    if (!name.trim()) {
      Alert.alert("Error", "Group Name is required.");
      return;
    }

    setSaving(true);
    const groupId = `group_${Date.now()}`;
    const members = [user.uid, ...selectedFriends.map((f) => f.uid)];
    const memberNames = {
      [user.uid]: profile.nickname || profile.name || "You",
      ...selectedFriends.reduce((acc, f) => {
        acc[f.uid] = f.nickname || f.name || f.username || "Friend";
        return acc;
      }, {} as Record<string, string>)
    };

    const payload = {
      id: groupId,
      name: name.trim(),
      description: description.trim(),
      createdBy: user.uid,
      members,
      memberNames,
      budget: parseFloat(budget) || 0,
      type: category,
      currency: "INR",
      createdAt: new Date().toISOString(),
    };

    try {
      await dbSetDoc("groups", groupId, payload);
      // Log activity
      const actId = `act_${Date.now()}`;
      await dbSetDoc(`groups/${groupId}/activities`, actId, {
        id: actId,
        groupId,
        category: "group_created",
        message: `Group "${payload.name}" created by ${memberNames[user.uid]}.`,
        actorId: user.uid,
        createdAt: new Date().toISOString(),
      });

      setShowModal(false);
      setName("");
      setDescription("");
      setBudget("");
      setSelectedFriends([]);
      setCreationStep(1);
      // Open the new group
      navigate("/groups/[id]", { id: groupId });
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to create group. Please check connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = (groupId: string, groupName: string) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setConfirmVisible(true);
  };

  const toggleSelectFriend = (friend: any) => {
    if (selectedFriends.some((f) => f.uid === friend.uid)) {
      setSelectedFriends(selectedFriends.filter((f) => f.uid !== friend.uid));
    } else {
      setSelectedFriends([...selectedFriends, friend]);
    }
  };

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: translateYAnim }] }}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>My Groups</Text>
          <Pressable 
            style={styles.createBtn} 
            onPress={() => {
              setCreationStep(1);
              setShowModal(true);
            }}
          >
            <Plus size={16} color={colors.primaryForeground} />
            <Text style={styles.createBtnText}>Create Group</Text>
          </Pressable>
        </View>

        {groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Users size={40} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>No Groups Yet</Text>
            <Text style={styles.emptyDesc}>Create a group or ask a friend to add you to start splitting.</Text>
          </View>
        ) : (
          groups.map((group) => {
            const preset = CONTEXT_PRESETS[group.type as keyof typeof CONTEXT_PRESETS] || CONTEXT_PRESETS.group;
            const Icon = preset.icon;
            return (
              <Pressable
                key={group.id}
                style={styles.groupCard}
                onPress={() => navigate("/groups/[id]", { id: group.id })}
              >
                <View style={styles.groupIconBg}>
                  <Icon size={20} color={colors.primary} />
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.groupDesc}>{group.description || preset.desc}</Text>
                  <Text style={styles.membersCount}>{group.members?.length || 1} Members</Text>
                </View>
                <View style={styles.cardRight}>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteGroup(group.id, group.name)}
                  >
                    <Trash2 size={16} color={colors.destructive} />
                  </Pressable>
                  <ChevronRight size={18} color={colors.mutedForeground} />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Creation Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>CREATE CONTEXT LEDGER</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <X size={20} color={colors.foreground} />
              </Pressable>
            </View>

            {creationStep === 1 ? (
              <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">
                <Text style={styles.monoStepLabel}>1. SELECT CONTEXT TYPE</Text>
                
                <View style={styles.contextTypesList}>
                  {Object.entries(CONTEXT_PRESETS).map(([key, value]) => {
                    const PresetIcon = value.icon;
                    return (
                      <Pressable
                        key={key}
                        style={styles.contextTypeCard}
                        onPress={() => {
                          setCategory(key as keyof typeof CONTEXT_PRESETS);
                          setCreationStep(2);
                        }}
                      >
                        <View style={styles.contextIconBubble}>
                          <PresetIcon size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.contextCardTitle}>{value.label.toUpperCase()}</Text>
                          <Text style={styles.contextCardDesc}>{value.desc}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">
                <View style={styles.inputContainer}>
                  <Text style={styles.monoLabel}>CONTEXT NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Goa Trip, 221B Flat, Buildmint Ops"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.monoLabel}>DESCRIPTION</Text>
                  <TextInput
                    style={[styles.input, { height: 64, textAlignVertical: "top", paddingTop: 8 }]}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    placeholder="e.g. Rent splits, hostel mesh, or operations budget"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>

                <View style={styles.rowTwoCol}>
                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <Text style={styles.monoLabel}>CURRENCY</Text>
                    <View style={styles.dropdownPicker}>
                      <Text style={styles.dropdownPickerText}>INR (₹)</Text>
                    </View>
                  </View>

                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <Text style={styles.monoLabel}>BUDGET CAP</Text>
                    <TextInput
                      style={styles.input}
                      value={budget}
                      onChangeText={setBudget}
                      placeholder="e.g. 50000"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.rowTwoCol}>
                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <Text style={styles.monoLabel}>START DATE</Text>
                    <TextInput
                      style={styles.input}
                      value={startDate}
                      onChangeText={setStartDate}
                      placeholder="mm/dd/yyyy"
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>

                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <Text style={styles.monoLabel}>END DATE</Text>
                    <TextInput
                      style={styles.input}
                      value={endDate}
                      onChangeText={setEndDate}
                      placeholder="mm/dd/yyyy"
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.monoLabel}>DAILY SPEND CAP</Text>
                  <TextInput
                    style={styles.input}
                    value={dailySpendCap}
                    onChangeText={setDailySpendCap}
                    placeholder="e.g. 5000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={styles.monoLabel}>SELECT VERIFIED MEMBERS</Text>
                    <Text style={[styles.monoLabel, { color: colors.primary }]}>[ YOU ARE AUTOMATICALLY MEMBER 1 ]</Text>
                  </View>

                  {loadingFriends ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
                  ) : friendsList.length === 0 ? (
                    <View style={styles.noConnectionsBox}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <ShieldAlert size={18} color="#d97706" />
                        <Text style={styles.noConnTitle}>NO CONNECTIONS VERIFIED</Text>
                      </View>
                      <Text style={styles.noConnDesc}>
                        Only mutually accepted friends are eligible to join sharing contexts. Connect with members first!
                      </Text>
                      <Pressable
                        style={styles.gotoConnBtn}
                        onPress={() => {
                          setShowModal(false);
                          navigate("/network");
                        }}
                      >
                        <Text style={styles.gotoConnText}>[ GOTO CONNECTIONS CENTER ]</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.friendsListContainer}>
                      {friendsList.map((friend) => {
                        const isSelected = selectedFriends.some((f) => f.uid === friend.uid);
                        const displayName = friend.nickname || friend.name || friend.username || "Friend";
                        const displayHandle = friend.username ? `@${friend.username}` : "";
                        const photoUri = friend.photoURL || friend.avatarUrl || friend.photo || friend.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=3e8e7e&color=fff&bold=true`;

                        return (
                          <Pressable
                            key={friend.uid}
                            style={[styles.friendRowCard, isSelected && styles.friendRowCardSelected]}
                            onPress={() => toggleSelectFriend(friend)}
                          >
                            <View style={styles.friendAvatarBubble}>
                              <Image source={{ uri: photoUri }} style={styles.avatarImg} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.friendRowName}>{displayName}</Text>
                              {displayHandle ? <Text style={styles.friendRowHandle}>{displayHandle}</Text> : null}
                            </View>
                            <View style={[styles.selectCheckbox, isSelected && styles.selectCheckboxActive]}>
                              {isSelected ? <Check size={14} color={colors.primaryForeground} /> : null}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View style={styles.modalFooterRow}>
                  <Pressable
                    style={styles.cancelModalBtn}
                    onPress={() => setCreationStep(1)}
                  >
                    <Text style={styles.cancelModalText}>BACK</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.submitLedgerBtn, saving && { opacity: 0.7 }]}
                    onPress={handleCreateGroup}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <Text style={styles.submitLedgerText}>CREATE LEDGER</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
            }}>Delete this group?</Text>
            <Text style={{
              fontSize: 14,
              color: colors.mutedForeground,
              lineHeight: 20,
              marginBottom: 24
            }}>This action cannot be undone. This group, along with all its expenses, settlements, and activity logs, will be permanently deleted.</Text>
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
                    await dbDeleteDoc("groups", selectedGroupId);
                  } catch (err) {
                    console.error(err);
                    Alert.alert("Error", "Failed to delete group.");
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
                }}>Delete Group</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  </Animated.View>
);
}

function createStyles(colors: AppColors) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
  },
  createBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createBtnText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },
  emptyCard: {
    backgroundColor: colors.glassCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
  },
  emptyDesc: {
    fontSize: Typography.fontSize.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.glassCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  groupIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
  },
  groupDesc: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  membersCount: {
    fontSize: 10,
    color: colors.primary,
    fontFamily: Typography.fontFamily.mono,
    marginTop: 4,
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deleteBtn: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 15,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
  },
  modalForm: {
    gap: 16,
    paddingBottom: 40,
  },
  inputContainer: {
    gap: 6,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: colors.foreground,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: Typography.fontSize.sm,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  monoStepLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  contextTypesList: {
    gap: 12,
  },
  contextTypeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.glassCard,
  },
  contextIconBubble: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  contextCardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.foreground,
    letterSpacing: 0.5,
  },
  contextCardDesc: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
    lineHeight: 16,
  },
  monoLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  rowTwoCol: {
    flexDirection: "row",
    gap: 12,
  },
  dropdownPicker: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  dropdownPickerText: {
    fontSize: Typography.fontSize.sm,
    color: colors.foreground,
    fontWeight: "600",
  },
  noConnectionsBox: {
    backgroundColor: "#fffdf0",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 14,
    padding: 14,
    marginVertical: 4,
  },
  noConnTitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: "#d97706",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  noConnDesc: {
    fontSize: Typography.fontSize.xs,
    color: "#92400e",
    lineHeight: 18,
    marginVertical: 4,
  },
  gotoConnBtn: {
    backgroundColor: "#d97706",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: 8,
  },
  gotoConnText: {
    color: "#ffffff",
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    fontWeight: "bold",
  },
  friendsListContainer: {
    gap: 8,
  },
  friendRowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.background,
  },
  friendRowCardSelected: {
    borderColor: colors.primary,
    backgroundColor: "#f5ebea",
  },
  friendAvatarBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.foreground,
  },
  friendRowName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: colors.foreground,
  },
  friendRowHandle: {
    fontSize: Typography.fontSize.xs,
    color: colors.primary,
    fontWeight: "bold",
  },
  selectCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  selectCheckboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalFooterRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  cancelModalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  cancelModalText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: colors.foreground,
    fontFamily: Typography.fontFamily.mono,
  },
  submitLedgerBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitLedgerText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    fontFamily: Typography.fontFamily.mono,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  presetItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: colors.foreground,
  },
  presetLabelActive: {
    color: colors.primaryForeground,
  },
  emptyFriends: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    fontStyle: "italic",
  },
  friendsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  friendItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  friendItemSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  friendName: {
    fontSize: Typography.fontSize.xs,
    color: colors.foreground,
  },
  friendNameSelected: {
    color: colors.primaryForeground,
    fontWeight: "bold",
  },
  submitBtn: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 15,
  },
  submitText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
}); }
