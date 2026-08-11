import React, { useState, useMemo } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { AppColors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { ArrowLeft, Check } from "lucide-react-native";
import { useTheme } from "../../lib/ThemeContext";
import { useApp } from "../../lib/AppContext";
import { dbSetDoc } from "../../lib/firestoreQuery";

export default function NewSubscriptionScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, profile, groups } = useApp();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [nextRenewalDate, setNextRenewalDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [splitType, setSplitType] = useState<"solo" | "equal">("solo");
  const [selectedContextId, setSelectedContextId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    const amountVal = parseFloat(amount);
    if (!name.trim()) {
      Alert.alert("Error", "Please enter subscription name.");
      return;
    }
    if (isNaN(amountVal) || amountVal <= 0) {
      Alert.alert("Error", "Please enter a valid amount.");
      return;
    }
    if (splitType === "equal" && !selectedContextId) {
      Alert.alert("Error", "Please select a group context to split this subscription.");
      return;
    }

    setSaving(true);
    const subId = `sub_${Date.now()}`;
    const activeCtx = selectedContextId ? groups.find((g) => g.id === selectedContextId) : null;

    const payload = {
      id: subId,
      ownerId: user.uid,
      contextId: selectedContextId || "",
      name: name.trim(),
      amount: amountVal,
      currency: "INR",
      billingCycle,
      nextRenewalDate,
      splitType: splitType === "solo" ? ("solo" as const) : ("equal" as const),
      splitMembers: activeCtx 
        ? activeCtx.members.map((mId) => ({ userId: mId, share: amountVal / activeCtx.members.length }))
        : [],
      category: "OTT" as const,
      status: "active" as const,
      reminderDaysBefore: 3,
      autoLogExpense: splitType === "equal",
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    try {
      await dbSetDoc("subscriptions", subId, payload);
      Alert.alert("Success", "Subscription added successfully!");
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to add subscription.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Subscription</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Subscription Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Netflix Premium"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Amount (INR / Cycle)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 649"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Billing Cycle</Text>
          <View style={styles.cycleRow}>
            {(["weekly", "monthly", "yearly"] as const).map((cycle) => (
              <Pressable
                key={cycle}
                style={[styles.cycleBtn, billingCycle === cycle && styles.cycleBtnActive]}
                onPress={() => setBillingCycle(cycle)}
              >
                <Text style={[styles.cycleBtnText, billingCycle === cycle && styles.cycleBtnTextActive]}>
                  {cycle.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Next Renewal Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={nextRenewalDate}
            onChangeText={setNextRenewalDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Split Type</Text>
          <View style={styles.cycleRow}>
            <Pressable
              style={[styles.cycleBtn, splitType === "solo" && styles.cycleBtnActive]}
              onPress={() => setSplitType("solo")}
            >
              <Text style={[styles.cycleBtnText, splitType === "solo" && styles.cycleBtnTextActive]}>SOLO</Text>
            </Pressable>
            <Pressable
              style={[styles.cycleBtn, splitType === "equal" && styles.cycleBtnActive]}
              onPress={() => setSplitType("equal")}
            >
              <Text style={[styles.cycleBtnText, splitType === "equal" && styles.cycleBtnTextActive]}>SPLIT EQUALLY</Text>
            </Pressable>
          </View>
        </View>

        {splitType === "equal" && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Select Group Context</Text>
            <View style={styles.groupGrid}>
              {groups.map((g) => (
                <Pressable
                  key={g.id}
                  style={[styles.groupBtn, selectedContextId === g.id && styles.groupBtnActive]}
                  onPress={() => setSelectedContextId(g.id)}
                >
                  <Text style={[styles.groupBtnText, selectedContextId === g.id && styles.groupBtnTextActive]}>
                    {g.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional billing details"
            placeholderTextColor={colors.mutedForeground}
            multiline
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Check size={18} color={colors.primaryForeground} />
              <Text style={styles.submitText}>Save Subscription</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: AppColors) { return StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 45,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: "bold",
    color: colors.foreground,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 16,
  },
  inputContainer: {
    gap: 4,
  },
  label: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: colors.foreground,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: Typography.fontSize.sm,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  cycleRow: {
    flexDirection: "row",
    gap: 8,
  },
  cycleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: colors.background,
  },
  cycleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cycleBtnText: {
    fontSize: 10,
    fontWeight: "bold",
    color: colors.foreground,
  },
  cycleBtnTextActive: {
    color: colors.primaryForeground,
  },
  groupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  groupBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  groupBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  groupBtnText: {
    fontSize: Typography.fontSize.xs,
    color: colors.foreground,
  },
  groupBtnTextActive: {
    color: colors.primaryForeground,
    fontWeight: "bold",
  },
  submitBtn: {
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  submitText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
}); }
