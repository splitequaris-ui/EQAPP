import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Modal, Image } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { writeBatch, doc } from "firebase/firestore";
import { dbSetDoc, dbDeleteDoc } from "../../lib/firestoreQuery";
import { calculateBalances, generateSettlementSuggestions } from "../../lib/settleEngine";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  CheckCircle, 
  ChevronRight,
  Info,
  DollarSign,
  X
} from "lucide-react-native";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { 
    user, 
    profile, 
    activeGroup, 
    activeGroupExpenses, 
    activeGroupSettlements, 
    activeGroupActivities,
    setActiveGroupId
  } = useApp();

  useEffect(() => {
    if (id) {
      setActiveGroupId(id);
    }
    return () => {
      setActiveGroupId(null);
    };
  }, [id]);

  const [activeTab, setActiveTab] = useState<"expenses" | "balances" | "settle" | "timeline">("expenses");
  
  // Add expense state
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expPaidBy, setExpPaidBy] = useState(user?.uid || "");
  const [expCategory, setExpCategory] = useState("food");
  const [expDate, setExpDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [savingExpense, setSavingExpense] = useState(false);

  // Pay QR modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedRepayment, setSelectedRepayment] = useState<any>(null);

  const groupBalances = useMemo(() => {
    if (!activeGroup) return {};
    return calculateBalances(activeGroup.members, activeGroupExpenses);
  }, [activeGroup, activeGroupExpenses]);

  const suggestions = useMemo(() => {
    if (!activeGroup || !id) return [];
    return generateSettlementSuggestions(id, groupBalances);
  }, [activeGroup, groupBalances, id]);

  const handleAddExpense = async () => {
    if (!user || !profile || !activeGroup || !id) return;
    const amountVal = parseFloat(expAmount);
    if (!expTitle.trim()) {
      Alert.alert("Error", "Please enter expense description.");
      return;
    }
    if (isNaN(amountVal) || amountVal <= 0) {
      Alert.alert("Error", "Please enter a valid positive amount.");
      return;
    }

    setSavingExpense(true);
    const expId = `expense_${Date.now()}`;
    const share = amountVal / activeGroup.members.length;
    const splits = activeGroup.members.map((mId) => ({
      uid: mId,
      amount: Math.round(share * 100) / 100,
      checked: true
    }));

    const payload = {
      id: expId,
      groupId: id,
      title: expTitle.trim(),
      amount: amountVal,
      paidBy: expPaidBy,
      category: expCategory,
      date: expDate,
      splitType: "equal" as const,
      splits,
      createdAt: new Date().toISOString(),
    };

    try {
      await dbSetDoc(`groups/${id}/expenses`, expId, payload);
      
      // Log activity
      const actId = `act_${Date.now()}`;
      await dbSetDoc(`groups/${id}/activities`, actId, {
        id: actId,
        groupId: id,
        category: "expense_added",
        message: `${profile.nickname || profile.name} logged split "${payload.title}" of ₹${payload.amount}.`,
        actorId: user.uid,
        createdAt: new Date().toISOString(),
      });

      setShowAddExpense(false);
      setExpTitle("");
      setExpAmount("");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to log expense.");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = (expId: string, title: string) => {
    Alert.alert(
      "Delete Expense",
      `Are you sure you want to delete "${title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            if (!id) return;
            try {
              await dbDeleteDoc(`groups/${id}/expenses`, expId);
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to delete expense.");
            }
          }
        }
      ]
    );
  };

  const handleSettleSuggestion = async (sugg: any) => {
    setSelectedRepayment(sugg);
    setShowPayModal(true);
  };

  const confirmSettlement = async () => {
    if (!selectedRepayment || !id || !user) return;
    try {
      const settleId = `settle_${Date.now()}`;
      const payload = {
        id: settleId,
        groupId: id,
        fromUid: selectedRepayment.fromUid,
        toUid: selectedRepayment.toUid,
        amount: selectedRepayment.amount,
        status: "settled" as const,
        createdAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
      };

      const batch = writeBatch(db);
      // Write to settlements subcollection
      const settleRef = doc(db, `groups/${id}/settlements`, settleId);
      batch.set(settleRef, payload);

      // Log as a special category "settlement" expense to update balance engine
      const expId = `expense_settle_${Date.now()}`;
      const expenseRef = doc(db, `groups/${id}/expenses`, expId);
      batch.set(expenseRef, {
        id: expId,
        groupId: id,
        title: `Settled up: ${activeGroup?.memberNames[selectedRepayment.fromUid]} → ${activeGroup?.memberNames[selectedRepayment.toUid]}`,
        amount: selectedRepayment.amount,
        paidBy: selectedRepayment.fromUid,
        category: "settlement",
        date: new Date().toISOString().substring(0, 10),
        splitType: "exact",
        splits: [
          { uid: selectedRepayment.toUid, amount: selectedRepayment.amount }
        ],
        createdAt: new Date().toISOString()
      });

      // Activity
      const actId = `act_${Date.now()}`;
      const actRef = doc(db, `groups/${id}/activities`, actId);
      batch.set(actRef, {
        id: actId,
        groupId: id,
        category: "settlement_marked",
        message: `${activeGroup?.memberNames[selectedRepayment.fromUid]} settled ₹${selectedRepayment.amount} to ${activeGroup?.memberNames[selectedRepayment.toUid]}.`,
        actorId: user.uid,
        createdAt: new Date().toISOString(),
      });

      await batch.commit();
      setShowPayModal(false);
      setSelectedRepayment(null);
      Alert.alert("Success", "Settlement logged successfully.");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to confirm settlement.");
    }
  };

  const getUpiUrl = (upi: string, name: string, amount: number) => {
    return `upi://pay?pa=${upi}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
  };

  if (!activeGroup) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupName}>{activeGroup.name}</Text>
          <Text style={styles.groupDesc} numberOfLines={1}>{activeGroup.description || "Active split pool"}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(["expenses", "balances", "sett", "timeline"] as const).map((tab) => {
          const active = activeTab === tab;
          const labels = { expenses: "Expenses", balances: "Balances", sett: "Settle Up", timeline: "Timeline" };
          return (
            <Pressable
              key={tab}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{labels[tab]}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {activeTab === "expenses" && (
          <View style={styles.content}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Expenses list</Text>
              <Pressable style={styles.addBtn} onPress={() => setShowAddExpense(true)}>
                <Plus size={16} color={Colors.primaryForeground} />
                <Text style={styles.addBtnText}>Add Expense</Text>
              </Pressable>
            </View>

            {activeGroupExpenses.length === 0 ? (
              <Text style={styles.emptyText}>No expenses logged in this group.</Text>
            ) : (
              activeGroupExpenses.map((item) => {
                const paidByLabel = activeGroup.memberNames[item.paidBy] || "Someone";
                return (
                  <View key={item.id} style={styles.expenseCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.expTitle}>{item.title}</Text>
                      <Text style={styles.expMeta}>Paid by {paidByLabel} • {item.date}</Text>
                      <Text style={styles.expCategory}>{item.category.toUpperCase()}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={styles.expAmount}>₹{item.amount}</Text>
                      {item.paidBy === user?.uid && (
                        <Pressable onPress={() => handleDeleteExpense(item.id, item.title)}>
                          <Trash2 size={16} color={Colors.destructive} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === "balances" && (
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Group Balances</Text>
            <View style={styles.balanceList}>
              {activeGroup.members.map((memberId) => {
                const name = activeGroup.memberNames[memberId] || "Member";
                const bal = groupBalances[memberId] || 0;
                return (
                  <View key={memberId} style={styles.balanceRow}>
                    <Text style={styles.balanceMember}>{name}</Text>
                    <Text style={[styles.balanceVal, { color: bal >= 0 ? Colors.success : Colors.destructive }]}>
                      {bal >= 0 ? `+₹${bal}` : `-₹${Math.abs(bal)}`}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {activeTab === "sett" && (
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Suggested Settlements</Text>
            {suggestions.length === 0 ? (
              <Text style={styles.emptyText}>Everyone is fully settled up!</Text>
            ) : (
              suggestions.map((sugg, idx) => {
                const from = sugg.fromUid === user?.uid ? "You" : activeGroup.memberNames[sugg.fromUid];
                const to = sugg.toUid === user?.uid ? "you" : activeGroup.memberNames[sugg.toUid];
                return (
                  <View key={idx} style={styles.suggestionCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggText}>
                        {from} owe(s) {to} <Text style={{ fontWeight: "bold" }}>₹{sugg.amount}</Text>
                      </Text>
                    </View>
                    {sugg.fromUid === user?.uid && (
                      <Pressable style={styles.settleBtn} onPress={() => handleSettleSuggestion(sugg)}>
                        <Text style={styles.settleBtnText}>Pay</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === "timeline" && (
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Timeline Feed</Text>
            {activeGroupActivities.length === 0 ? (
              <Text style={styles.emptyText}>No recent timeline entries.</Text>
            ) : (
              activeGroupActivities.map((act) => (
                <View key={act.id} style={styles.actRow}>
                  <Text style={styles.actMsg}>{act.message}</Text>
                  <Text style={styles.actDate}>{new Date(act.createdAt).toLocaleString()}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Expense Modal */}
      <Modal visible={showAddExpense} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Expense</Text>
              <Pressable onPress={() => setShowAddExpense(false)}>
                <X size={20} color={Colors.foreground} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={styles.input}
                  value={expTitle}
                  onChangeText={setExpTitle}
                  placeholder="e.g. Dinner at Taj"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Amount (INR)</Text>
                <TextInput
                  style={styles.input}
                  value={expAmount}
                  onChangeText={setExpAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.mutedForeground}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Category</Text>
                <View style={styles.categoryGrid}>
                  {["food", "travel", "rent", "entertainment", "healthcare", "others"].map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.catBtn, expCategory === cat && styles.catBtnActive]}
                      onPress={() => setExpCategory(cat)}
                    >
                      <Text style={[styles.catBtnText, expCategory === cat && styles.catBtnTextActive]}>
                        {cat.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]}
                onPress={handleAddExpense}
                disabled={savingExpense}
              >
                {savingExpense ? (
                  <ActivityIndicator color={Colors.primaryForeground} />
                ) : (
                  <Text style={styles.submitText}>Save & Split equally</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* UPI QR Payment Modal */}
      <Modal visible={showPayModal} animationType="fade" transparent>
        <View style={styles.qrOverlay}>
          <View style={styles.qrContent}>
            <View style={styles.qrHeader}>
              <Text style={styles.qrTitle}>Repay Settle Dues</Text>
              <Pressable onPress={() => setShowPayModal(false)}>
                <X size={20} color={Colors.foreground} />
              </Pressable>
            </View>

            {selectedRepayment && (
              <View style={{ alignItems: "center", gap: 12 }}>
                <Text style={styles.qrDesc}>
                  Scan to pay {activeGroup.memberNames[selectedRepayment.toUid]} ₹{selectedRepayment.amount}
                </Text>
                
                {/* Fallback mock QR code generation linking to standard UPI pay spec */}
                <Image
                  source={{ 
                    uri: `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(
                      getUpiUrl("repay@upi", activeGroup.memberNames[selectedRepayment.toUid], selectedRepayment.amount)
                    )}`
                  }} 
                  style={styles.qrImg} 
                />

                <Text style={styles.qrInfo}>After completing payment, tap Confirm to update ledger balances.</Text>
                
                <Pressable style={styles.confirmSettleBtn} onPress={confirmSettlement}>
                  <Text style={styles.confirmSettleText}>Confirm Repayed</Text>
                </Pressable>
              </View>
            )}
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
    paddingTop: 45,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
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
  groupName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  groupDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    padding: 6,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.foreground,
  },
  tabTextActive: {
    color: Colors.primaryForeground,
  },
  scroll: {
    padding: 20,
  },
  content: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  emptyText: {
    textAlign: "center",
    color: Colors.mutedForeground,
    fontSize: Typography.fontSize.sm,
    paddingVertical: 30,
  },
  expenseCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  expTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  expMeta: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  expCategory: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
    marginTop: 6,
  },
  expAmount: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  balanceList: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  balanceMember: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "semibold",
    color: Colors.foreground,
  },
  balanceVal: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
  },
  suggText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.foreground,
  },
  settleBtn: {
    backgroundColor: Colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  settleBtnText: {
    color: Colors.successForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  actRow: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
  },
  actMsg: {
    fontSize: Typography.fontSize.xs,
    color: Colors.foreground,
    lineHeight: 16,
  },
  actDate: {
    fontSize: 9,
    color: Colors.mutedForeground,
    marginTop: 4,
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
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: Colors.foreground,
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
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  catBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  catBtnText: {
    fontSize: 10,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  catBtnTextActive: {
    color: Colors.primaryForeground,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  submitText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  qrOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  qrContent: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    width: "100%",
    alignItems: "center",
  },
  qrHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 10,
    marginBottom: 15,
  },
  qrTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  qrDesc: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "semibold",
    color: Colors.foreground,
    textAlign: "center",
  },
  qrImg: {
    width: 180,
    height: 180,
    borderRadius: 10,
    marginVertical: 15,
  },
  qrInfo: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 15,
  },
  confirmSettleBtn: {
    backgroundColor: Colors.success,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  confirmSettleText: {
    color: Colors.successForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
});
