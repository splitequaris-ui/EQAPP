import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Modal, Image, Linking, Platform, KeyboardAvoidingView, Animated } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { writeBatch, doc } from "firebase/firestore";
import { dbSetDoc, dbDeleteDoc, dbGetDoc, dbGetDocsInBatches } from "../../lib/firestoreQuery";
import { calculateBalances, generateSettlementSuggestions } from "../../lib/settleEngine";
import { useTheme } from "../../lib/ThemeContext";
import { AppColors } from "../../constants/colors";
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
import QRCode from "react-native-qrcode-svg";

import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { 
    user, 
    profile, 
    activeGroup, 
    activeGroupExpenses, 
    activeGroupSettlements, 
    activeGroupActivities,
    setActiveGroupId
  } = useApp();

  const [activeTab, setActiveTab] = useState<"expenses" | "balances" | "sett" | "timeline" | "analytics">("expenses");
  
  const subTabFadeAnim = useRef(new Animated.Value(0)).current;
  const subTabTranslateYAnim = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    subTabFadeAnim.setValue(0);
    subTabTranslateYAnim.setValue(6);
    Animated.parallel([
      Animated.timing(subTabFadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(subTabTranslateYAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTab]);

  useEffect(() => {
    if (id) {
      setActiveGroupId(id);
    }
    return () => {
      setActiveGroupId(null);
    };
  }, [id]);

  // Add expense state
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expPaidBy, setExpPaidBy] = useState(user?.uid || "");
  const [expCategory, setExpCategory] = useState("food");
  const [expDate, setExpDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [savingExpense, setSavingExpense] = useState(false);

  // Pay QR & Delete modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [showEndSplitModal, setShowEndSplitModal] = useState(false);
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [targetDeleteExpense, setTargetDeleteExpense] = useState<{ id: string; title: string } | null>(null);
  const [selectedRepayment, setSelectedRepayment] = useState<any>(null);
  const [recipientProfile, setRecipientProfile] = useState<any | null>(null);
  const [fetchingRecipient, setFetchingRecipient] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!activeGroup?.members || activeGroup.members.length === 0) return;
    const fetchProfiles = async () => {
      try {
        const [usersList, profilesList] = await Promise.all([
          dbGetDocsInBatches("users", "uid", activeGroup.members),
          dbGetDocsInBatches("profiles", "uid", activeGroup.members)
        ]);

        const map: Record<string, any> = {};
        (profilesList || []).forEach((p: any) => {
          if (p?.uid) map[p.uid] = p;
        });
        (usersList || []).forEach((u: any) => {
          if (u?.uid) {
            map[u.uid] = { ...map[u.uid], ...u };
          }
        });
        setMemberProfiles(map);
      } catch (err) {
        console.error("Failed to load member profiles", err);
      }
    };
    fetchProfiles();
  }, [activeGroup?.members]);

  const getAvatarUrl = (mId: string, mName: string) => {
    const prof = memberProfiles[mId];
    const photo = prof?.photoURL || prof?.avatarUrl || prof?.photo || prof?.avatar;
    if (photo && photo.trim().length > 0) return photo;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(mName)}&background=3e8e7e&color=fff&bold=true`;
  };

  const groupBalances = useMemo(() => {
    if (!activeGroup) return {};
    return calculateBalances(activeGroup.members, activeGroupExpenses);
  }, [activeGroup, activeGroupExpenses]);

  const suggestions = useMemo(() => {
    if (!activeGroup || !id) return [];
    return generateSettlementSuggestions(id, groupBalances);
  }, [activeGroup, groupBalances, id]);

  const totalSpent = useMemo(() => {
    return activeGroupExpenses
      .filter((e) => e.category !== "settlement")
      .reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [activeGroupExpenses]);

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
    setTargetDeleteExpense({ id: expId, title });
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
    }
  }, [selectedRepayment]);

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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const budgetCap = activeGroup?.budget || 50000;
  const utilizationPercent = budgetCap > 0 ? Math.round((totalSpent / budgetCap) * 100) : 0;
  const isOverBudget = totalSpent > budgetCap;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <ScrollView contentContainerStyle={styles.scroll} stickyHeaderIndices={[]}>
        {/* Navigation & Header */}
        <View style={styles.topNavRow}>
          <Pressable onPress={() => router.push("/(tabs)/groups")} style={styles.allGroupsBtn}>
            <ArrowLeft size={16} color={colors.foreground} />
            <Text style={styles.allGroupsText}>ALL GROUPS</Text>
          </Pressable>
        </View>

        {/* Group Name & Status */}
        <View style={styles.groupHeaderBox}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={styles.groupMainTitle}>{activeGroup.name}</Text>
            <View style={styles.activePillBadge}>
              <Text style={styles.activePillText}>ACTIVE</Text>
            </View>
          </View>
          {activeGroup.description ? (
            <Text style={styles.groupMainSub}>{activeGroup.description}</Text>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.groupActionsRow}>
            <Pressable style={styles.endSplitBtn} onPress={() => setShowEndSplitModal(true)}>
              <Text style={styles.endSplitText}>END SPLIT</Text>
            </Pressable>
            
            <Pressable 
              style={styles.deleteGroupBtn} 
              onPress={() => setShowDeleteGroupModal(true)}
            >
              <Text style={styles.deleteGroupText}>DELETE GROUP</Text>
            </Pressable>
          </View>
        </View>

        {/* Group Budget Insights Overview Card (Screenshot #1) */}
        <View style={styles.budgetInsightsCard}>
          <View style={styles.budgetCardHeaderRow}>
            <Text style={styles.monoCardLabel}>MEMBERS ({activeGroup.members.length})</Text>
            
            {/* Overlapping Member Avatars Stack */}
            <View style={styles.avatarStackRow}>
              {activeGroup.members.slice(0, 5).map((mId, i) => {
                const mName = activeGroup.memberNames[mId] || "User";
                const avatarUri = getAvatarUrl(mId, mName);
                return (
                  <View key={mId} style={[styles.stackAvatarCircle, { zIndex: 10 - i, marginLeft: i > 0 ? -10 : 0 }]}>
                    <Image source={{ uri: avatarUri }} style={{ width: 30, height: 30, borderRadius: 15 }} />
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.cardDividerLine} />

          {/* Budget Spend Row */}
          <View style={styles.budgetStatsRow}>
            <Text style={styles.monoCardLabel}>BUDGET SPENT:</Text>
            <Text 
              style={[styles.budgetAmountVal, isOverBudget && { color: colors.destructive }]}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.65}
            >
              ₹{totalSpent.toLocaleString("en-IN")} / {utilizationPercent}% ₹{budgetCap.toLocaleString("en-IN")}
            </Text>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarWrapper}>
            <View 
              style={[
                styles.progressBarFillBar, 
                { width: `${Math.min(utilizationPercent, 100)}%` },
                isOverBudget ? { backgroundColor: colors.destructive } : { backgroundColor: colors.success }
              ]} 
            />
          </View>

          {/* Status Warning */}
          <View style={styles.budgetStatusRow}>
            <Text style={[styles.budgetStatusText, isOverBudget && { color: colors.destructive }]}>
              {isOverBudget ? "⚠️ OVER BUDGET LIMIT" : "✓ WITHIN BUDGET LIMIT"}
            </Text>
          </View>
        </View>

        {/* Group Total Spend Box */}
        <View style={styles.totalSpendCard}>
          <Text style={styles.monoCardLabel}>GROUP TOTAL SPEND</Text>
          <Text 
            style={styles.totalSpendAmountText}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
            minimumFontScale={0.65}
          >
            ₹{totalSpent.toLocaleString("en-IN")}
          </Text>
        </View>

        {/* Tabs Row – horizontal scroll so tabs never clip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScrollWrapper}
          contentContainerStyle={styles.tabsRow}
        >
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
        </ScrollView>

        <Animated.View style={{ opacity: subTabFadeAnim, transform: [{ translateY: subTabTranslateYAnim }] }}>
          {activeTab === "expenses" && (
            <View style={styles.content}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Expenses list</Text>
                <Pressable style={styles.addBtn} onPress={() => setShowAddExpense(true)}>
                  <Plus size={16} color={colors.primaryForeground} />
                  <Text style={styles.addBtnText}>Add Expense</Text>
                </Pressable>
              </View>

              {activeGroupExpenses.length === 0 ? (
                <Text style={styles.emptyText}>No expenses logged in this group.</Text>
              ) : (
                activeGroupExpenses.map((item) => {
                  const paidByLabel = activeGroup.memberNames[item.paidBy] || "Someone";
                  const isSettlement = item.category === "settlement" || item.title.toLowerCase().includes("settle");
                  const cleanTitle = isSettlement
                    ? item.title.replace(/^Settled up \([^)]+\):\s*/i, "Settlement: ")
                    : item.title;

                  return (
                    <View key={item.id} style={styles.cleanExpenseCard}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={styles.cleanExpTitle} numberOfLines={1}>
                          {cleanTitle}
                        </Text>
                        <Text 
                          style={styles.cleanExpAmount} 
                          numberOfLines={1} 
                          adjustsFontSizeToFit={true} 
                          minimumFontScale={0.7}
                        >
                          ₹{item.amount ? item.amount.toLocaleString("en-IN") : "0"}
                        </Text>
                      </View>

                      <Text style={styles.cleanExpMeta}>
                        Paid by {paidByLabel} • {item.date}
                      </Text>

                      <View style={styles.cardFooterRow}>
                        {isSettlement ? (
                          <View style={styles.settlementPill}>
                            <Text style={styles.settlementPillText}>SETTLEMENT</Text>
                          </View>
                        ) : (
                          <View style={styles.categoryPill}>
                            <Text style={styles.categoryPillText}>{(item.category || "General").toUpperCase()}</Text>
                          </View>
                        )}

                        <Pressable 
                          onPress={() => handleDeleteExpense(item.id, item.title)}
                          style={styles.cardDeleteBtn}
                          hitSlop={8}
                        >
                          <Trash2 size={14} color={colors.mutedForeground} />
                        </Pressable>
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
                    <Text style={[styles.balanceVal, { color: bal >= 0 ? colors.success : colors.destructive }]}>
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
              <PieChart size={20} color={colors.primary} />
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
        </Animated.View>
      </ScrollView>

      {/* Add Expense Modal */}
      <Modal visible={showAddExpense} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Expense</Text>
              <Pressable onPress={() => setShowAddExpense(false)}>
                <X size={20} color={colors.foreground} />
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
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Amount (INR)</Text>
                <TextInput
                  style={styles.input}
                  value={expAmount}
                  onChangeText={setExpAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
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
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.submitText}>Save & Split equally</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* UPI QR Payment Modal */}
      <Modal visible={showPayModal} animationType="fade" transparent>
        <View style={styles.qrOverlay}>
          <View style={styles.qrContent}>
            <View style={styles.qrHeader}>
              <Text style={styles.qrTitle}>Scan BHIM UPI repricement</Text>
              <Pressable onPress={() => setShowPayModal(false)}>
                <X size={20} color={colors.foreground} />
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
                    <ActivityIndicator size="large" color={colors.primary} />
                  </View>
                ) : (recipientProfile?.upiId) ? (
                  <View style={styles.qrBoxWrapper}>
                    <QRCode
                      value={getUpiUrl(recipientProfile.upiId, activeGroup.memberNames[selectedRepayment.toUid] || "Member", selectedRepayment.amount)}
                      size={180}
                      color={colors.foreground}
                      backgroundColor={colors.card}
                    />
                  </View>
                ) : (
                  <View style={{ height: 120, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 14, width: "100%", padding: 12, backgroundColor: colors.background }}>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>UPI QR Code not available. Recipient has not configured their UPI ID.</Text>
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

      {/* End Split Confirmation Modal (Screenshot #1) */}
      <Modal visible={showEndSplitModal} animationType="fade" transparent>
        <View style={styles.centeredModalOverlay}>
          <View style={styles.endSplitCard}>
            <Text style={styles.endSplitTitle}>End Split</Text>
            <Text style={styles.endSplitSub}>Group ledger calculation finalized.</Text>

            <View style={styles.endSplitBtnRow}>
              <Pressable
                style={styles.endSplitCancelBtn}
                onPress={() => setShowEndSplitModal(false)}
              >
                <Text style={styles.endSplitCancelText}>CANCEL</Text>
              </Pressable>

              <Pressable
                style={styles.endSplitConfirmBtn}
                onPress={() => {
                  setShowEndSplitModal(false);
                  Alert.alert("Success", "Group ledger calculation finalized.");
                }}
              >
                <Text style={styles.endSplitConfirmText}>CONFIRM</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Group Confirmation Modal */}
      <Modal visible={showDeleteGroupModal} animationType="fade" transparent>
        <View style={styles.centeredModalOverlay}>
          <View style={styles.endSplitCard}>
            <Text style={styles.endSplitTitle}>Delete Group?</Text>
            <Text style={styles.endSplitSub}>
              Are you sure you want to delete "{activeGroup.name}" permanently? This action cannot be undone.
            </Text>

            <View style={styles.endSplitBtnRow}>
              <Pressable
                style={styles.endSplitCancelBtn}
                onPress={() => setShowDeleteGroupModal(false)}
              >
                <Text style={styles.endSplitCancelText}>CANCEL</Text>
              </Pressable>

              <Pressable
                style={[styles.endSplitConfirmBtn, { backgroundColor: colors.destructive }]}
                onPress={async () => {
                  setShowDeleteGroupModal(false);
                  try {
                    await dbDeleteDoc("groups", activeGroup.id);
                    router.push("/(tabs)/groups");
                  } catch (err) {
                    console.error("Failed to delete group", err);
                  }
                }}
              >
                <Text style={[styles.endSplitConfirmText, { color: "#ffffff" }]}>DELETE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Expense Confirmation Modal */}
      <Modal visible={!!targetDeleteExpense} animationType="fade" transparent>
        <View style={styles.centeredModalOverlay}>
          <View style={styles.endSplitCard}>
            <Text style={styles.endSplitTitle}>Delete Expense?</Text>
            <Text style={styles.endSplitSub}>
              Are you sure you want to delete "{targetDeleteExpense?.title}"?
            </Text>

            <View style={styles.endSplitBtnRow}>
              <Pressable
                style={styles.endSplitCancelBtn}
                onPress={() => setTargetDeleteExpense(null)}
              >
                <Text style={styles.endSplitCancelText}>CANCEL</Text>
              </Pressable>

              <Pressable
                style={[styles.endSplitConfirmBtn, { backgroundColor: colors.destructive }]}
                onPress={async () => {
                  if (!targetDeleteExpense || !id) return;
                  const expId = targetDeleteExpense.id;
                  setTargetDeleteExpense(null);
                  try {
                    await dbDeleteDoc(`groups/${id}/expenses`, expId);
                  } catch (err) {
                    console.error("Failed to delete expense", err);
                  }
                }}
              >
                <Text style={[styles.endSplitConfirmText, { color: "#ffffff" }]}>DELETE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: AppColors) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 45,
  },
  topNavRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  allGroupsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.glassCard,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  allGroupsText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: colors.foreground,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  groupHeaderBox: {
    marginBottom: 16,
  },
  groupMainTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  activePillBadge: {
    backgroundColor: "#d1f2e8",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activePillText: {
    color: "#126b53",
    fontSize: 10,
    fontFamily: Typography.fontFamily.mono,
    fontWeight: "bold",
  },
  groupMainSub: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  groupActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  endSplitBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.glassCard,
  },
  endSplitText: {
    color: colors.destructive,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    fontWeight: "bold",
  },
  deleteGroupBtn: {
    backgroundColor: colors.destructive,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  deleteGroupText: {
    color: "#ffffff",
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    fontWeight: "bold",
  },
  budgetInsightsCard: {
    backgroundColor: colors.glassCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  budgetCardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monoCardLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  avatarStackRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stackAvatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  stackAvatarText: {
    fontSize: 12,
    fontWeight: "bold",
    color: colors.foreground,
  },
  cardDividerLine: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  budgetStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  budgetAmountVal: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    fontWeight: "bold",
    color: colors.foreground,
  },
  progressBarWrapper: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginVertical: 6,
  },
  progressBarFillBar: {
    height: "100%",
    borderRadius: 5,
  },
  budgetStatusRow: {
    marginTop: 6,
    alignItems: "flex-end",
  },
  budgetStatusText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.mono,
    fontWeight: "bold",
    color: colors.success,
  },
  totalSpendCard: {
    backgroundColor: colors.glassCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  totalSpendAmountText: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.foreground,
    marginTop: 4,
  },
  endSplitCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    width: "90%",
    maxWidth: 360,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  endSplitTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.foreground,
    marginBottom: 8,
  },
  endSplitSub: {
    fontSize: Typography.fontSize.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  endSplitBtnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  endSplitCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  endSplitCancelText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    fontFamily: Typography.fontFamily.mono,
    color: colors.foreground,
  },
  endSplitConfirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  endSplitConfirmText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    fontFamily: Typography.fontFamily.mono,
    color: colors.primaryForeground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  groupName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
  },
  groupDesc: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  tabsScrollWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginHorizontal: -16,
    marginTop: 12,
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 0,
    alignItems: "center",
  },
  tabItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  tabItemActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  content: {
    paddingHorizontal: 0,
    paddingTop: 16,
    gap: 12,
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
    color: colors.foreground,
  },
  addBtn: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  emptyText: {
    textAlign: "center",
    color: colors.mutedForeground,
    fontSize: Typography.fontSize.sm,
    paddingVertical: 30,
  },
  cleanExpenseCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 14,
  },
  cleanExpTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.foreground,
    flex: 1,
    lineHeight: 20,
  },
  cleanExpAmount: {
    fontSize: 17,
    fontWeight: "900",
    fontFamily: Typography.fontFamily.mono,
    color: colors.foreground,
  },
  cleanExpMeta: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 12,
    lineHeight: 16,
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  settlementPill: {
    backgroundColor: "#d1f2e8",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  settlementPillText: {
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: Typography.fontFamily.mono,
    color: "#065f46",
    letterSpacing: 0.5,
  },
  categoryPill: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: Typography.fontFamily.mono,
    color: colors.foreground,
    letterSpacing: 0.5,
  },
  cardDeleteBtn: {
    padding: 6,
    borderRadius: 8,
  },
  balanceList: {
    backgroundColor: colors.glassCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 0,
    overflow: "hidden",
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  balanceMember: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "semibold",
    color: colors.foreground,
  },
  balanceVal: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.glassCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 12,
    padding: 14,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  webSuggestionCard: {
    backgroundColor: colors.glassCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#2a2621",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  webSuggTag: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: colors.mutedForeground,
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  webSuggIconText: {
    fontSize: 16,
    color: colors.foreground,
    fontWeight: "bold",
  },
  webSuggTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: colors.foreground,
  },
  webSuggSubtitle: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  webSuggDivider: {
    height: 1,
    backgroundColor: colors.border,
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
    color: colors.foreground,
  },
  webSuggSubLabel: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  webShowQrBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  webShowQrText: {
    fontSize: 11,
    fontWeight: "bold",
    color: colors.foreground,
  },
  webMarkSettleBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.foreground,
  },
  webMarkSettleText: {
    fontSize: 11,
    fontWeight: "bold",
    color: colors.background,
  },
  repayInstantlyLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.mono,
    color: colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  repayDirectionText: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: colors.foreground,
    marginVertical: 2,
  },
  repayLargeAmount: {
    fontSize: Typography.fontSize.xl,
    fontWeight: "900",
    color: colors.foreground,
    marginBottom: 8,
  },
  qrBoxWrapper: {
    padding: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    marginBottom: 4,
  },
  qrInfoText: {
    fontSize: 11,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 16,
  },
  recipientUpiLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.mono,
    color: colors.mutedForeground,
    fontWeight: "bold",
  },
  recipientUpiInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: "100%",
  },
  recipientUpiText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: colors.foreground,
  },
  suggText: {
    fontSize: Typography.fontSize.sm,
    color: colors.foreground,
  },
  settleBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  settleBtnText: {
    color: colors.successForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  actRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  actMsg: {
    fontSize: Typography.fontSize.xs,
    color: colors.foreground,
    lineHeight: 16,
  },
  actDate: {
    fontSize: 9,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  centeredModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
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
    borderBottomColor: colors.border,
    paddingBottom: 12,
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: colors.foreground,
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
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  catBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catBtnText: {
    fontSize: 10,
    fontWeight: "bold",
    color: colors.foreground,
  },
  catBtnTextActive: {
    color: colors.primaryForeground,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  submitText: {
    color: colors.primaryForeground,
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
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderBottomColor: colors.border,
    paddingBottom: 10,
    marginBottom: 15,
  },
  qrTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: colors.foreground,
  },
  qrDesc: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "semibold",
    color: colors.foreground,
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
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 15,
  },
  confirmSettleBtn: {
    backgroundColor: colors.success,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  confirmSettleText: {
    color: colors.successForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  upiBtn: {
    backgroundColor: colors.primary,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginVertical: 4,
  },
  upiBtnText: {
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  analyticsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 20,
  },
  analyticsSub: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: colors.foreground,
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
    color: colors.mutedForeground,
  },
  analyticsVal: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: colors.foreground,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
}); }
