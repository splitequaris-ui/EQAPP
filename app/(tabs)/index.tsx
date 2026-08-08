import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Modal, Alert } from "react-native";
import { useApp } from "../../lib/AppContext";
import { calculateBalances } from "../../lib/settleEngine";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { fetchInsights } from "../../lib/api";
import { db } from "../../lib/firebase";
import { dbGetDoc, dbSetDoc } from "../../lib/firestoreQuery";
import { query, collection, where, getDocs } from "firebase/firestore";
import { 
  TrendingUp, 
  TrendingDown, 
  Lightbulb, 
  AlertTriangle, 
  Wallet, 
  Palmtree, 
  Plus, 
  RefreshCw,
  Users,
  PieChart,
  MoreVertical,
  X
} from "lucide-react-native";

const INSIGHT_ICON: Record<string, React.ElementType> = {
  warning: AlertTriangle,
  budget: Wallet,
  tip: Lightbulb,
  chill: Palmtree,
};

export default function DashboardScreen() {
  const { user, profile, groups, allExpenses, navigate } = useApp();
  const [aiInsights, setAiInsights] = useState<{ type: string; title: string; message: string }[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Quick Add Expense States
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [friendUsername, setFriendUsername] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [whoPaid, setWhoPaid] = useState<"me" | "friend">("me");
  const [splitOption, setSplitOption] = useState<"equal" | "lend" | "borrow">("equal");
  const [loggingSplit, setLoggingSplit] = useState(false);

  const handleLogQuickSplit = async () => {
    if (!user || !profile) return;
    const cleanUsername = friendUsername.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "");
    const amountVal = parseFloat(quickAmount);
    if (!cleanUsername) {
      Alert.alert("Error", "Please enter friend's username.");
      return;
    }
    if (!quickTitle.trim()) {
      Alert.alert("Error", "Please enter a description.");
      return;
    }
    if (isNaN(amountVal) || amountVal <= 0) {
      Alert.alert("Error", "Please enter a valid amount.");
      return;
    }

    setLoggingSplit(true);
    try {
      // 1. Resolve username to uid
      const unameSnap = await dbGetDoc("usernames", cleanUsername);
      if (!unameSnap || !unameSnap.exists()) {
        Alert.alert("Error", `@${cleanUsername} is not registered on Equaris.`);
        setLoggingSplit(false);
        return;
      }
      const friendUid = unameSnap.data()?.uid;
      if (friendUid === user.uid) {
        Alert.alert("Error", "You cannot split an expense with yourself.");
        setLoggingSplit(false);
        return;
      }

      // 2. Fetch target user profile
      const fUserSnap = await dbGetDoc("profiles", friendUid);
      const friendName = fUserSnap?.exists() ? (fUserSnap.data()?.nickname || fUserSnap.data()?.name) : `user_${cleanUsername}`;

      // 3. Find or Create direct split group
      let activeDirectGroup = groups.find(
        (g) =>
          g.isDirectSplit &&
          g.members.includes(user.uid) &&
          g.members.includes(friendUid)
      );

      let targetGroupId = activeDirectGroup?.id;

      if (!targetGroupId) {
        targetGroupId = `group_${Date.now()}`;
        const newGroup = {
          id: targetGroupId,
          name: `Direct Split: ${friendName}`,
          description: `Direct expense splits between you and @${cleanUsername}`,
          createdBy: user.uid,
          members: [user.uid, friendUid],
          memberNames: {
            [user.uid]: profile.nickname || profile.name || "You",
            [friendUid]: friendName,
          },
          isDirectSplit: true,
          budget: null,
          status: "active",
          createdAt: new Date().toISOString(),
        };
        await dbSetDoc("groups", targetGroupId, newGroup);
      }

      // 4. Calculate splits payload
      let payer = whoPaid === "me" ? user.uid : friendUid;
      let splitsList: any[] = [];

      if (splitOption === "equal") {
        const share = Math.round((amountVal / 2) * 100) / 100;
        splitsList = [
          { uid: user.uid, amount: share },
          { uid: friendUid, amount: share },
        ];
      } else if (splitOption === "lend") {
        payer = user.uid;
        splitsList = [
          { uid: user.uid, amount: 0 },
          { uid: friendUid, amount: amountVal },
        ];
      } else if (splitOption === "borrow") {
        payer = friendUid;
        splitsList = [
          { uid: user.uid, amount: amountVal },
          { uid: friendUid, amount: 0 },
        ];
      }

      const expenseId = `exp_${Date.now()}`;
      await dbSetDoc(`groups/${targetGroupId}/expenses`, expenseId, {
        id: expenseId,
        groupId: targetGroupId,
        title: quickTitle.trim(),
        amount: amountVal,
        paidBy: payer,
        category: "others",
        date: new Date().toISOString().substring(0, 10),
        notes: `Quick split with @${cleanUsername}`,
        splitType: "custom",
        splits: splitsList,
        createdAt: new Date().toISOString(),
      });

      Alert.alert("Success", "Split transaction logged successfully!");
      setShowQuickAddModal(false);
      setFriendUsername("");
      setQuickTitle("");
      setQuickAmount("");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to log direct split.");
    } finally {
      setLoggingSplit(false);
    }
  };

  const activeGroupIds = useMemo(
    () => new Set(groups.map((g) => g.id)),
    [groups]
  );

  const spendExpenses = useMemo(
    () => allExpenses.filter((e) => e.category !== "settlement" && activeGroupIds.has(e.groupId)),
    [allExpenses, activeGroupIds]
  );

  const totalSpent = useMemo(
    () => spendExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    [spendExpenses]
  );

  const { youOwe, youAreOwed } = useMemo(() => {
    let owe = 0;
    let owed = 0;
    if (user) {
      groups.forEach((g) => {
        const groupExpenses = allExpenses.filter((e) => e.groupId === g.id);
        if (groupExpenses.length === 0) return;
        const balances = calculateBalances(g.members, groupExpenses);
        const net = balances[user.uid] || 0;
        if (net < -0.01) owe += Math.abs(net);
        else if (net > 0.01) owed += net;
      });
    }
    return {
      youOwe: Math.round(owe * 100) / 100,
      youAreOwed: Math.round(owed * 100) / 100,
    };
  }, [user, groups, allExpenses]);

  const totalBudget = useMemo(
    () => groups.reduce((sum, g) => sum + (g.budget || 0), 0),
    [groups]
  );

  const memberNames = useMemo(() => {
    const names: Record<string, string> = {};
    groups.forEach((g) => {
      Object.assign(names, g.memberNames || {});
    });
    return names;
  }, [groups]);

  const loadInsights = async () => {
    if (spendExpenses.length === 0) {
      setAiInsights([
        {
          type: "chill",
          title: "Clean Slate",
          message: "No transactions logged yet. Budget is completely untouched.",
        },
      ]);
      return;
    }
    setLoadingInsights(true);
    try {
      const data = await fetchInsights(
        spendExpenses.map((e) => ({
          amount: e.amount,
          category: e.category,
          paidBy: e.paidBy,
          title: e.title,
        })),
        totalBudget,
        memberNames
      );
      setAiInsights(data || []);
    } catch (err) {
      console.warn("Failed to load insights, using fallback", err);
      // Fallback
      setAiInsights([
        {
          type: "tip",
          title: "Optimize Splits",
          message: "Keep checking your group settlement recommendations to clear debts easily.",
        },
      ]);
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, [spendExpenses.length, totalBudget]);

  const recentExpenses = useMemo(() => {
    return spendExpenses
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [spendExpenses]);

  const netBalance = youAreOwed - youOwe;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Editorial Overview Section */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <View style={[styles.header, { marginBottom: 0 }]}>
          <Text style={styles.overviewLabel}>OVERVIEW</Text>
          <Text style={styles.nameText}>Hi, {profile?.nickname || profile?.name || "User"}</Text>
          <Text style={styles.descriptionText}>
            Track clearly, split fairly, and settle up in seconds. No awkward reminders — only good times.
          </Text>
        </View>
        <Pressable 
          style={styles.threeDotsBtn} 
          onPress={() => {
            Alert.alert("Menu", "", [
              { text: "Settle", onPress: () => navigate("/network") },
              { text: "Cancel", style: "cancel" }
            ]);
          }}
        >
          <MoreVertical size={20} color={Colors.foreground} />
        </Pressable>
      </View>

      {/* Editorial Header Quick Action Buttons */}
      <View style={styles.webActionsRow}>
        <Pressable 
          style={[styles.webActionBtn, { backgroundColor: Colors.primary }]} 
          onPress={() => setShowQuickAddModal(true)}
        >
          <Plus size={16} color={Colors.primaryForeground} style={{ marginRight: 4 }} />
          <Text style={[styles.webActionText, { color: Colors.primaryForeground }]}>Add Expense</Text>
        </Pressable>
        <Pressable 
          style={[styles.webActionBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.primary }]} 
          onPress={() => navigate("/network")}
        >
          <Users size={16} color={Colors.primary} style={{ marginRight: 4 }} />
          <Text style={[styles.webActionText, { color: Colors.primary }]}>Manage network</Text>
        </Pressable>
      </View>

      {/* Premium Dashboard Metrics Cards */}
      <View style={styles.metricsGrid}>
        {/* Metric 1: Total Group Spend */}
        <View style={styles.metricCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={styles.metricLabel}>TOTAL GROUP SPEND</Text>
            <Text style={{ fontSize: 14, color: Colors.foreground }}>₹</Text>
          </View>
          <Text style={styles.metricAmount}>₹{totalSpent.toLocaleString("en-IN")}</Text>
          <Text style={styles.metricSubtitle}>BUDGET HEALTH</Text>
          <View style={[styles.progressBarBg, { marginTop: 6, height: 4 }]}>
            <View 
              style={[
                styles.progressBarFill, 
                { 
                  width: `${Math.min(100, totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0)}%`,
                  backgroundColor: totalSpent > totalBudget && totalBudget > 0 ? Colors.destructive : Colors.success
                }
              ]} 
            />
          </View>
        </View>

        {/* Metric 2: You Owe */}
        <View style={styles.metricCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={styles.metricLabel}>YOU OWE</Text>
            <TrendingDown size={14} color={Colors.destructive} />
          </View>
          <Text style={[styles.metricAmount, { color: Colors.destructive }]}>₹{youOwe.toLocaleString("en-IN")}</Text>
          <Text style={styles.metricSubtitle}>Total outstanding bills</Text>
        </View>

        {/* Metric 3: You Are Owed */}
        <View style={styles.metricCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={styles.metricLabel}>YOU ARE OWED</Text>
            <TrendingUp size={14} color={Colors.success} />
          </View>
          <Text style={[styles.metricAmount, { color: Colors.success }]}>₹{youAreOwed.toLocaleString("en-IN")}</Text>
          <Text style={styles.metricSubtitle}>Reimbursement suggestions</Text>
        </View>
      </View>

      {/* Active Group Spend & Limits Card */}
      <Text style={styles.sectionTitle}>Active Group Spend & Limits</Text>
      <Text style={styles.sectionSubtitle}>Real-time status of your active group budget limits.</Text>
      
      {groups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No active group pools. Create one under Groups tab!</Text>
        </View>
      ) : (
        groups.map((g) => {
          const groupExpenses = spendExpenses.filter((e) => e.groupId === g.id);
          const groupSpent = groupExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
          const budgetLimit = g.budget || 50000; // fallback limit
          const pct = Math.round((groupSpent / budgetLimit) * 100);
          return (
            <Pressable 
              key={g.id} 
              style={styles.groupPoolCard}
              onPress={() => navigate("/groups/[id]", { id: g.id })}
            >
              <Text style={styles.poolTag}>GROUP POOL</Text>
              <Text style={styles.poolName}>{g.name}</Text>
              
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, marginBottom: 4 }}>
                <Text style={styles.poolMetaText}>SPENT: ₹{groupSpent.toLocaleString("en-IN")}</Text>
                <Text style={styles.poolMetaText}>LIMIT: ₹{budgetLimit.toLocaleString("en-IN")}</Text>
              </View>
              
              <View style={[styles.progressBarBg, { height: 6, marginBottom: 12 }]}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: groupSpent > budgetLimit ? Colors.destructive : Colors.success
                    }
                  ]} 
                />
              </View>
              
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.poolLinkText}>View Group Details</Text>
                <TrendingUp size={14} color={Colors.mutedForeground} />
              </View>
            </Pressable>
          );
        })
      )}

      {/* AI Insights Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>AI Insights</Text>
        <Pressable onPress={loadInsights} disabled={loadingInsights}>
          {loadingInsights ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <RefreshCw size={14} color={Colors.mutedForeground} />
          )}
        </Pressable>
      </View>

      <View style={styles.insightsCard}>
        {aiInsights.map((insight, idx) => {
          const Icon = INSIGHT_ICON[insight.type] || Lightbulb;
          return (
            <View key={idx} style={[styles.insightRow, idx > 0 && styles.insightBorder]}>
              <View style={[styles.insightIconBg, { backgroundColor: insight.type === "warning" ? "#fdf2f2" : "#f0fdf4" }]}>
                <Icon size={14} color={insight.type === "warning" ? Colors.destructive : Colors.success} />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightMessage}>{insight.message}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Recent Splits List */}
      <Text style={styles.sectionTitle}>Recent Splits</Text>
      <View style={styles.listCard}>
        {recentExpenses.length === 0 ? (
          <Text style={styles.emptyText}>No recent split transactions.</Text>
        ) : (
          recentExpenses.map((item, index) => {
            const groupName = groups.find((g) => g.id === item.groupId)?.name || "Group";
            return (
              <View key={item.id} style={[styles.expenseItem, index > 0 && styles.insightBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseTitle}>{item.title}</Text>
                  <Text style={styles.expenseMeta}>{groupName} • {item.date}</Text>
                </View>
                <Text style={styles.expenseAmount}>₹{item.amount}</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Quick Add Expense Modal (from the fourth screenshot) */}
      <Modal visible={showQuickAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Add Expense</Text>
              <Pressable onPress={() => {
                setShowQuickAddModal(false);
                setFriendUsername("");
                setQuickTitle("");
                setQuickAmount("");
              }}>
                <X size={20} color={Colors.foreground} />
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Directly split a bill with any registered user by their username.
            </Text>

            <ScrollView contentContainerStyle={{ gap: 16, width: "100%", paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Friend's Username</Text>
                <TextInput
                  style={styles.input}
                  value={friendUsername}
                  onChangeText={setFriendUsername}
                  placeholder="@username"
                  placeholderTextColor={Colors.mutedForeground}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={styles.input}
                  value={quickTitle}
                  onChangeText={setQuickTitle}
                  placeholder="e.g., Lunch, Groceries, Movie"
                  placeholderTextColor={Colors.mutedForeground}
                />
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <Text style={styles.label}>Amount (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={quickAmount}
                    onChangeText={setQuickAmount}
                    placeholder="0.00"
                    placeholderTextColor={Colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputContainer, { flex: 1 }]}>
                  <Text style={styles.label}>Who Paid?</Text>
                  <View style={styles.dropdownContainer}>
                    <Pressable 
                      style={styles.dropdownBtn}
                      onPress={() => {
                        setWhoPaid(whoPaid === "me" ? "friend" : "me");
                      }}
                    >
                      <Text style={styles.dropdownBtnText}>
                        {whoPaid === "me" ? "I paid" : "They paid"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Splitting Option</Text>
                <View style={styles.dropdownContainer}>
                  <Pressable 
                    style={styles.dropdownBtn}
                    onPress={() => {
                      setSplitOption(splitOption === "equal" ? "lend" : splitOption === "lend" ? "borrow" : "equal");
                    }}
                  >
                    <Text style={styles.dropdownBtnText}>
                      {splitOption === "equal" ? "Split Equally (50/50)" : splitOption === "lend" ? "You paid, they owe full" : "They paid, you owe full"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16, marginTop: 15 }}>
                <Pressable onPress={() => setShowQuickAddModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable 
                  style={styles.logSplitBtn} 
                  onPress={handleLogQuickSplit}
                  disabled={loggingSplit}
                >
                  {loggingSplit ? (
                    <ActivityIndicator color={Colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={styles.logSplitBtnText}>Log Split</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: Colors.background,
    flexGrow: 1,
  },
  header: {
    marginBottom: 20,
    gap: 4,
    flex: 1,
    paddingRight: 10,
  },
  threeDotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    width: "100%",
    alignItems: "flex-start",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 10,
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  modalSubtitle: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginBottom: 16,
    lineHeight: 16,
  },
  inputContainer: {
    width: "100%",
    gap: 6,
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
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: Typography.fontSize.sm,
    color: Colors.foreground,
    backgroundColor: Colors.background,
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.background,
    overflow: "hidden",
  },
  dropdownBtn: {
    height: 40,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  dropdownBtnText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.foreground,
  },
  cancelBtnText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.mutedForeground,
  },
  logSplitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logSplitBtnText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
  },
  overviewLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  nameText: {
    fontSize: Typography.fontSize.xl,
    fontWeight: "900",
    color: Colors.foreground,
  },
  descriptionText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    lineHeight: 18,
    marginTop: 4,
  },
  webActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  webActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
  },
  webActionText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  metricsGrid: {
    gap: 16,
    marginBottom: 24,
  },
  metricCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  metricLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  metricAmount: {
    fontSize: Typography.fontSize.xl,
    fontWeight: "900",
    color: Colors.foreground,
    marginVertical: 4,
  },
  metricSubtitle: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginBottom: 12,
  },
  groupPoolCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 24,
  },
  poolTag: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.mutedForeground,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  poolName: {
    fontSize: 16,
    fontWeight: "900",
    color: Colors.foreground,
    marginTop: 4,
  },
  poolMetaText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.mutedForeground,
  },
  poolLinkText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  insightsCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 24,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
  },
  insightBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  insightIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  insightMessage: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
    lineHeight: 16,
  },
  listCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20,
  },
  emptyText: {
    textAlign: "center",
    color: Colors.mutedForeground,
    fontSize: Typography.fontSize.sm,
    paddingVertical: 12,
  },
  expenseItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  expenseTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.foreground,
  },
  expenseMeta: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  analyticsCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 24,
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
