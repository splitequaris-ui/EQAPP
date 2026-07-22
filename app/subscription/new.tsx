import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, ActivityIndicator } from "react-native";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { dbSetDoc } from "../../lib/firestoreQuery";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { router } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";

export default function NewSubscriptionScreen() {
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
          <ArrowLeft size={20} color={Colors.foreground} />
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
            placeholderTextColor={Colors.mutedForeground}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Amount (INR / Cycle)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 649"
            placeholderTextColor={Colors.mutedForeground}
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
            placeholderTextColor={Colors.mutedForeground}
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
            placeholderTextColor={Colors.mutedForeground}
            multiline
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.primaryForeground} />
          ) : (
            <>
              <Check size={18} color={Colors.primaryForeground} />
              <Text style={styles.submitText}>Save Subscription</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 45,
    backgroundColor: Colors.background,
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
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 16,
  },
  inputContainer: {
    gap: 4,
  },
  label: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: Colors.foreground,
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
  cycleRow: {
    flexDirection: "row",
    gap: 8,
  },
  cycleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  cycleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  cycleBtnText: {
    fontSize: 10,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  cycleBtnTextActive: {
    color: Colors.primaryForeground,
  },
  groupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  groupBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  groupBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  groupBtnText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.foreground,
  },
  groupBtnTextActive: {
    color: Colors.primaryForeground,
    fontWeight: "bold",
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  submitText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
});
