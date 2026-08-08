import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Modal, Image, Linking, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { writeBatch, doc } from "firebase/firestore";
import { dbSetDoc, dbDeleteDoc, dbGetDoc } from "../../lib/firestoreQuery";
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
  X,
  PieChart
} from "lucide-react-native";
import QRCode from "qrcode";

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

  const [activeTab, setActiveTab] = useState<"expenses" | "balances" | "sett" | "timeline" | "analytics">("expenses");
  
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
  const [recipientProfile, setRecipientProfile] = useState<any | null>(null);
  const [fetchingRecipient, setFetchingRecipient] = useState(false);
  const [upiQrUrl, setUpiQrUrl] = useState("");

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
    const onDelete = async () => {
      if (!id) return;
      try {
        await dbDeleteDoc(`groups/${id}/expenses`, expId);
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Failed to delete expense.");
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Delete Expense\n\nAre you sure you want to delete "${title}"?`);
      if (confirmed) {
        onDelete();
      }
    } else {
      Alert.alert(
        "Delete Expense",
        `Are you sure you want to delete "${title}"?`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Delete", 
            style: "destructive",
            onPress: onDelete
          }
        ]
      );
    }
  };

  const handleSettleSuggestion = async (sugg: any) => {
    setSelectedRepayment(sugg);
    setShowPayModal(true);
  };

  const confirmSettlement = async (paymentMode: string = "UPI") => {
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
        paymentMode,
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
        title: `Settled up (${paymentMode}): ${activeGroup?.memberNames[selectedRepayment.fromUid]} → ${activeGroup?.memberNames[selectedRepayment.toUid]}`,
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
        message: `${activeGroup?.memberNames[selectedRepayment.fromUid]} settled ₹${selectedRepayment.amount} to ${activeGroup?.memberNames[selectedRepayment.toUid]} via ${paymentMode}.`,
        actorId: user.uid,
        createdAt: new Date().toISOString(),
      });

      await batch.commit();
      setShowPayModal(false);
      setSelectedRepayment(null);
      Alert.alert("Success", `Settlement via ${paymentMode} logged successfully.`);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to confirm settlement.");
    }
  };

  const getUpiUrl = (upi: string, name: string, amount: number) => {
    return `upi://pay?pa=${upi}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
  };

  useEffect(() => {
    if (selectedRepayment?.toUid) {
      setFetchingRecipient(true);
      dbGetDoc("users", selectedRepayment.toUid)
        .then((docSnap) => {
          if (docSnap && docSnap.exists()) {
            setRecipientProfile(docSnap.data());
          } else {
            setRecipientProfile(null);
          }
        })
        .catch((err) => {
          console.error("Error fetching recipient profile:", err);
          setRecipientProfile(null);
        })
        .finally(() => {
          setFetchingRecipient(false);
        });
    } else {
      setRecipientProfile(null);
      setUpiQrUrl("");
    }
  }, [selectedRepayment]);

  useEffect(() => {
    if (selectedRepayment && activeGroup) {
      const upiId = recipientProfile?.upiId || "repay@upi";
      const name = activeGroup.memberNames[selectedRepayment.toUid] || "Member";
      const url = getUpiUrl(upiId, name, selectedRepayment.amount);
      QRCode.toDataURL(url, { margin: 1, width: 300 })
        .then((dataUrl) => setUpiQrUrl(dataUrl))
        .catch((err) => console.error("Error generating UPI QR:", err));
    }
  }, [selectedRepayment, recipientProfile, activeGroup]);

  const launchUpiApp = async () => {
    if (!selectedRepayment || !activeGroup) return;
    const upiId = recipientProfile?.upiId || "repay@upi";
    const name = activeGroup.memberNames[selectedRepayment.toUid] || "Member";
    const url = getUpiUrl(upiId, name, selectedRepayment.amount);
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(url);
      }
      // Auto settle immediately
      await confirmSettlement("UPI");
    } catch (err) {
      console.error("Failed to open UPI app", err);
      // Fallback: still settle it directly if they choose to do so, or warn them
      Alert.alert(
        "Direct UPI Launch failed",
        "Could not launch UPI payment app. Would you like to mark this as settled anyway?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Mark Settled", onPress: () => confirmSettlement("UPI") }
        ]
      );
    }
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
        {(["expenses", "balances", "sett", "timeline", "analytics"] as const).map((tab) => {
          const active = activeTab === tab;
          const labels = { expenses: "Expenses", balances: "Balances", sett: "Settle Up", timeline: "Timeline", analytics: "Analytics" };
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
                const fromName = activeGroup.memberNames[sugg.fromUid] || "Someone";
                const toName = activeGroup.memberNames[sugg.toUid] || "Someone";
                
                return (
                  <View key={idx} style={styles.webSuggestionCard}>
                    <Text style={styles.webSuggTag}>{activeGroup.name.toUpperCase()}</Text>
                    
                    <View style={styles.webSuggHeader}>
                      <View style={styles.webSuggIconBg}>
                        <Text style={styles.webSuggIconText}>₹</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.webSuggTitle}>{fromName} ➔ {toName}</Text>
                        <Text style={styles.webSuggSubtitle}>Peer payment suggestion</Text>
                      </View>
                    </View>

                    <View style={styles.webSuggDivider} />

                    <View style={styles.webSuggFooter}>
                      <View>
                        <Text style={styles.webSuggAmount}>₹{sugg.amount.toLocaleString("en-IN")}</Text>
                        <Text style={styles.webSuggSubLabel}>Repayment amount</Text>
                      </View>
                      
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                        <Pressable 
                          style={styles.webShowQrBtn} 
                          onPress={() => {
                            setSelectedRepayment(sugg);
                            setShowPayModal(true);
                          }}
                        >
                          <Text style={styles.webShowQrText}>Show QR</Text>
                        </Pressable>
                        <Pressable 
                          style={styles.webMarkSettleBtn} 
                          onPress={() => {
                            setSelectedRepayment(sugg);
                            confirmSettlement("Direct Settle");
                          }}
                        >
                          <Text style={styles.webMarkSettleText}>Mark Settle</Text>
                        </Pressable>
                      </View>
                    </View>
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

        {activeTab === "analytics" && (
          <View style={styles.content}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <PieChart size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Group Analytics</Text>
            </View>
            {activeGroupExpenses.filter(e => e.category !== "settlement").length === 0 ? (
              <Text style={styles.emptyText}>No spending data to analyze in this group.</Text>
            ) : (
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsSub}>Category Distribution Breakdown</Text>
                {(() => {
                  const spendExpenses = activeGroupExpenses.filter(e => e.category !== "settlement");
                  const totals = spendExpenses.reduce((acc, exp) => {
                    acc[exp.category] = (acc[exp.category] || 0) + (exp.amount || 0);
                    return acc;
                  }, {} as Record<string, number>);
                  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
                  const grandTotal = sorted.reduce((sum, item) => sum + item[1], 0);

                  return sorted.map(([cat, amount]) => {
                    const pct = Math.round((amount / grandTotal) * 100);
                    return (
                      <View key={cat} style={styles.analyticsRow}>
                        <View style={styles.analyticsTextRow}>
                          <Text style={styles.analyticsLabel}>{cat.toUpperCase()}</Text>
                          <Text style={styles.analyticsVal}>₹{amount.toLocaleString("en-IN")} ({pct}%)</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                          <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>
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
              <Text style={styles.qrTitle}>Scan BHIM UPI repricement</Text>
              <Pressable onPress={() => setShowPayModal(false)}>
                <X size={20} color={Colors.foreground} />
              </Pressable>
            </View>

            {selectedRepayment && (
              <View style={{ alignItems: "center", gap: 12, width: "100%" }}>
                <Text style={styles.repayInstantlyLabel}>REPAY INSTANTLY</Text>
                
                <Text style={styles.repayDirectionText}>
                  {(activeGroup.memberNames[selectedRepayment.fromUid] || "Someone")} ➔ {(activeGroup.memberNames[selectedRepayment.toUid] || "Someone")}
                </Text>

                <Text style={styles.repayLargeAmount}>
                  ₹{selectedRepayment.amount.toLocaleString("en-IN")}
                </Text>
                
                {fetchingRecipient ? (
                  <View style={{ height: 180, justifyContent: "center" }}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                  </View>
                ) : (upiQrUrl && recipientProfile?.upiId) ? (
                  <View style={styles.qrBoxWrapper}>
                    <Image source={{ uri: upiQrUrl }} style={styles.qrImg as any} />
                  </View>
                ) : (
                  <View style={{ height: 120, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: 14, width: "100%", padding: 12, backgroundColor: Colors.background }}>
                    <Text style={{ fontSize: 11, color: Colors.mutedForeground, textAlign: "center" }}>UPI QR Code not available. Recipient has not configured their UPI ID.</Text>
                  </View>
                )}

                <Text style={styles.qrInfoText}>
                  Scan with GPay, PhonePe, Paytm, or any banking app. Once completed, tap below to balance the accounting ledger.
                </Text>

                <View style={{ width: "100%", marginTop: 4, gap: 6 }}>
                  <Text style={styles.recipientUpiLabel}>Recipient UPI Id:</Text>
                  <View style={styles.recipientUpiInput}>
                    <Text style={styles.recipientUpiText}>
                      {recipientProfile?.upiId || "No UPI VPA configured"}
                    </Text>
                  </View>
                </View>
                
                <View style={{ flexDirection: "row", gap: 12, width: "100%", marginTop: 12 }}>
                  <Pressable 
                    style={[styles.webShowQrBtn, { flex: 1, height: 44, justifyContent: "center" }]} 
                    onPress={launchUpiApp}
                    disabled={!recipientProfile?.upiId}
                  >
                    <Text style={[styles.webShowQrText, { fontSize: 13, textAlign: "center" }]}>Launch UPI app</Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.webMarkSettleBtn, { flex: 1, height: 44, justifyContent: "center" }]} 
                    onPress={() => confirmSettlement("Direct UPI Settle")}
                  >
                    <Text style={[styles.webMarkSettleText, { fontSize: 13, textAlign: "center" }]}>Mark as Settled</Text>
                  </Pressable>
                </View>
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
  webSuggestionCard: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  webSuggTag: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  webSuggHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  webSuggIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  webSuggIconText: {
    fontSize: 16,
    color: Colors.foreground,
    fontWeight: "bold",
  },
  webSuggTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  webSuggSubtitle: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  webSuggDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  webSuggFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  webSuggAmount: {
    fontSize: 16,
    fontWeight: "900",
    color: Colors.foreground,
  },
  webSuggSubLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  webShowQrBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  webShowQrText: {
    fontSize: 11,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  webMarkSettleBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.foreground,
  },
  webMarkSettleText: {
    fontSize: 11,
    fontWeight: "bold",
    color: Colors.background,
  },
  repayInstantlyLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  repayDirectionText: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: Colors.foreground,
    marginVertical: 2,
  },
  repayLargeAmount: {
    fontSize: Typography.fontSize.xl,
    fontWeight: "900",
    color: Colors.foreground,
    marginBottom: 8,
  },
  qrBoxWrapper: {
    padding: 12,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    marginBottom: 4,
  },
  qrInfoText: {
    fontSize: 11,
    color: Colors.mutedForeground,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 16,
  },
  recipientUpiLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.mutedForeground,
    fontWeight: "bold",
  },
  recipientUpiInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: "100%",
  },
  recipientUpiText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.foreground,
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
  upiBtn: {
    backgroundColor: Colors.primary,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginVertical: 4,
  },
  upiBtnText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  analyticsCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20,
  },
  analyticsSub: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
    marginBottom: 16,
  },
  analyticsRow: {
    marginBottom: 16,
  },
  analyticsTextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  analyticsLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "600",
    color: Colors.mutedForeground,
  },
  analyticsVal: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
});
