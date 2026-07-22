import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, ActivityIndicator, Alert } from "react-native";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { dbSetDoc, dbDeleteDoc, dbGetDocsInBatches } from "../../lib/firestoreQuery";
import { Colors } from "../../constants/colors";
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
  Sparkles
} from "lucide-react-native";

const CONTEXT_PRESETS = {
  trip: { label: "Trip", icon: Plane, desc: "Vacations, road trips" },
  roommates: { label: "Roommates", icon: Home, desc: "Shared rent, utilities" },
  student: { label: "Student", icon: GraduationCap, desc: "Hostels, roommate splits" },
  startup: { label: "Startup", icon: Rocket, desc: "Software, shared tools" },
  group: { label: "Custom", icon: Users, desc: "Outings, dining, custom splits" }
};

export default function GroupsScreen() {
  const { user, profile, groups, navigate } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [category, setCategory] = useState<keyof typeof CONTEXT_PRESETS>("trip");

  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [saving, setSaving] = useState(false);

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
    Alert.alert(
      "Delete Group",
      `Are you sure you want to delete "${groupName}"? All split ledger history will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              await dbDeleteDoc("groups", groupId);
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to delete group.");
            }
          }
        }
      ]
    );
  };

  const toggleSelectFriend = (friend: any) => {
    if (selectedFriends.some((f) => f.uid === friend.uid)) {
      setSelectedFriends(selectedFriends.filter((f) => f.uid !== friend.uid));
    } else {
      setSelectedFriends([...selectedFriends, friend]);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>My Groups</Text>
          <Pressable style={styles.createBtn} onPress={() => setShowModal(true)}>
            <Plus size={16} color={Colors.primaryForeground} />
            <Text style={styles.createBtnText}>Create Group</Text>
          </Pressable>
        </View>

        {groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Users size={40} color={Colors.mutedForeground} style={{ marginBottom: 10 }} />
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
                  <Icon size={20} color={Colors.primary} />
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
                    <Trash2 size={16} color={Colors.destructive} />
                  </Pressable>
                  <ChevronRight size={18} color={Colors.mutedForeground} />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Creation Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Group</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <X size={20} color={Colors.foreground} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Group Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Goa Trip 2026"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={styles.input}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What is this group for?"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Budget (INR)</Text>
                <TextInput
                  style={styles.input}
                  value={budget}
                  onChangeText={setBudget}
                  placeholder="e.g. 50000"
                  placeholderTextColor={Colors.mutedForeground}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Group Type</Text>
                <View style={styles.presetGrid}>
                  {Object.entries(CONTEXT_PRESETS).map(([key, value]) => {
                    const active = category === key;
                    const PresetIcon = value.icon;
                    return (
                      <Pressable
                        key={key}
                        style={[styles.presetItem, active && styles.presetItemActive]}
                        onPress={() => setCategory(key as keyof typeof CONTEXT_PRESETS)}
                      >
                        <PresetIcon size={16} color={active ? Colors.primaryForeground : Colors.foreground} />
                        <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>{value.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Friends list */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Add Friends</Text>
                {loadingFriends ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : friendsList.length === 0 ? (
                  <Text style={styles.emptyFriends}>No friends found in your network hub. Save peers first.</Text>
                ) : (
                  <View style={styles.friendsList}>
                    {friendsList.map((friend) => {
                      const selected = selectedFriends.some((f) => f.uid === friend.uid);
                      return (
                        <Pressable
                          key={friend.uid}
                          style={[styles.friendItem, selected && styles.friendItemSelected]}
                          onPress={() => toggleSelectFriend(friend)}
                        >
                          <Text style={[styles.friendName, selected && styles.friendNameSelected]}>
                            {friend.nickname || friend.name || `@${friend.username}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <Pressable
                style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]}
                onPress={handleCreateGroup}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.primaryForeground} />
                ) : (
                  <>
                    <Sparkles size={16} color={Colors.primaryForeground} />
                    <Text style={styles.submitText}>Create Group & Setup Ledger</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.foreground,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createBtnText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  emptyDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.mutedForeground,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  groupIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.background,
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
    color: Colors.foreground,
  },
  groupDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  membersCount: {
    fontSize: 10,
    color: Colors.primary,
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
    backgroundColor: Colors.card,
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
    borderBottomColor: Colors.border,
    paddingBottom: 15,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
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
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  presetItemActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  presetLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.foreground,
  },
  presetLabelActive: {
    color: Colors.primaryForeground,
  },
  emptyFriends: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    fontStyle: "italic",
  },
  friendsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  friendItem: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  friendItemSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  friendName: {
    fontSize: Typography.fontSize.xs,
    color: Colors.foreground,
  },
  friendNameSelected: {
    color: Colors.primaryForeground,
    fontWeight: "bold",
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 15,
  },
  submitText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },
});
