import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator, Clipboard } from "react-native";
import { useApp } from "../../lib/AppContext";
import { calculateBalances } from "../../lib/settleEngine";
import { db } from "../../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, Layers, Plus, Calendar, Play, Pause } from "lucide-react-native";

export default function MoneyScreen() {
  const { user, groups, allExpenses, subscriptions, navigate } = useApp();
  const [activeTab, setActiveTab] = useState<"reports" | "subs">("reports");

  // --- Reports calculations ---
  const currentMonthExpenses = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${currentYear}-${currentMonth}`;
    return allExpenses.filter((e) => e.date.startsWith(prefix) && e.category !== "settlement");
  }, [allExpenses]);

  const totalSpentThisMonth = useMemo(() => {
    return currentMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [currentMonthExpenses]);

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

  const categoryBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    currentMonthExpenses.forEach((e) => {
      const cat = e.category || "Other";
      totals[cat] = (totals[cat] || 0) + (e.amount || 0);
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [currentMonthExpenses]);

  // --- Subscriptions calculations ---
  const totalMonthlySubCost = useMemo(() => {
    return subscriptions
      .filter((s) => s.status === "active")
      .reduce((sum, s) => {
        let monthlyAmount = s.amount;
        if (s.billingCycle === "weekly") {
          monthlyAmount = s.amount * 4.33;
        } else if (s.billingCycle === "quarterly") {
          monthlyAmount = s.amount / 3;
        } else if (s.billingCycle === "yearly") {
          monthlyAmount = s.amount / 12;
        } else if (s.billingCycle === "custom" && s.customCycleDays) {
          monthlyAmount = (s.amount / s.customCycleDays) * 30.4;
        }

        if (s.splitType !== "solo" && s.splitMembers) {
          const myShare = s.splitMembers.find((m) => m.userId === user?.uid)?.share || 0;
          if (s.splitType === "equal") {
            return sum + (s.amount / s.splitMembers.length);
          }
          return sum + myShare;
        }
        return sum + monthlyAmount;
      }, 0);
  }, [subscriptions, user]);

  const toggleSubStatus = async (subId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    try {
      await updateDoc(doc(db, "subscriptions", subId), {
        status: newStatus
      });
      Alert.alert("Success", `Subscription ${newStatus === "active" ? "resumed" : "paused"} successfully.`);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to update subscription status.");
    }
  };

  const exportStatementToClipboard = () => {
    if (allExpenses.length === 0) {
      Alert.alert("Info", "No transactions to export.");
      return;
    }
    const headers = "Date,Title,Amount,Category,SplitType\n";
    const rows = allExpenses.map(e => `${e.date},${e.title},${e.amount},${e.category},${e.splitType}`).join("\n");
    Clipboard.setString(headers + rows);
    Alert.alert("Success", "Consolidated ledger data copied to clipboard in CSV format.");
  };

  return (
    <View style={styles.container}>
      {/* Top Tabs */}
      <View style={styles.tabHeader}>
        <Pressable
          style={[styles.tabBtn, activeTab === "reports" && styles.tabBtnActive]}
          onPress={() => setActiveTab("reports")}
        >
          <Text style={[styles.tabText, activeTab === "reports" && styles.tabTextActive]}>Analytics</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "subs" && styles.tabBtnActive]}
          onPress={() => setActiveTab("subs")}
        >
          <Text style={[styles.tabText, activeTab === "subs" && styles.tabTextActive]}>Subscriptions</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {activeTab === "reports" ? (
          <View style={styles.tabContent}>
            {/* Overview Stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Monthly Flow</Text>
                <Text style={styles.statValue}>₹{Math.round(totalSpentThisMonth).toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>You Owe</Text>
                <Text style={[styles.statValue, { color: Colors.destructive }]}>
                  ₹{Math.round(youOwe).toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Owed to You</Text>
                <Text style={[styles.statValue, { color: Colors.success }]}>
                  ₹{Math.round(youAreOwed).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>

            {/* Category Breakdown */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Category Breakdown</Text>
              {categoryBreakdown.length === 0 ? (
                <Text style={styles.emptyText}>No data for the current billing cycle.</Text>
              ) : (
                categoryBreakdown.map(([cat, amt]) => {
                  const pct = Math.round((amt / (totalSpentThisMonth || 1)) * 100);
                  return (
                    <View key={cat} style={styles.categoryRow}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={styles.catLabel}>{cat.toUpperCase()}</Text>
                        <Text style={styles.catValue}>₹{amt} ({pct}%)</Text>
                      </View>
                      <View style={styles.progressBg}>
                        <View style={[styles.progressFill, { width: `${pct}%` }]} />
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Context distribution */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Context Distribution</Text>
              {groups.length === 0 ? (
                <Text style={styles.emptyText}>No active group contexts found.</Text>
              ) : (
                groups.map((g) => {
                  const groupSpend = allExpenses
                    .filter((e) => e.groupId === g.id && e.category !== "settlement")
                    .reduce((sum, e) => sum + (e.amount || 0), 0);
                  const pct = totalSpentThisMonth > 0 ? Math.round((groupSpend / totalSpentThisMonth) * 100) : 0;
                  return (
                    <View key={g.id} style={styles.contextRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Layers size={16} color={Colors.primary} />
                        <Text style={styles.contextName}>{g.name}</Text>
                      </View>
                      <Text style={styles.contextSpend}>₹{groupSpend} ({pct}%)</Text>
                    </View>
                  );
                })
              )}
            </View>

            <Pressable style={styles.exportBtn} onPress={exportStatementToClipboard}>
              <Text style={styles.exportBtnText}>Export Consolidated Ledger CSV</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.tabContent}>
            {/* Subscriptions Hub */}
            <View style={styles.subCostCard}>
              <Text style={styles.subCostLabel}>Monthly Subscriptions cost</Text>
              <Text style={styles.subCostValue}>₹{Math.round(totalMonthlySubCost).toLocaleString("en-IN")}</Text>
              <Pressable style={styles.addSubBtn} onPress={() => navigate("/subscriptions/new")}>
                <Plus size={16} color={Colors.primaryForeground} />
                <Text style={styles.addSubText}>Add Subscription</Text>
              </Pressable>
            </View>

            {/* Subscriptions List */}
            <Text style={styles.sectionTitle}>Active Subscriptions ({subscriptions.length})</Text>
            {subscriptions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Calendar size={32} color={Colors.mutedForeground} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyTitle}>No Subscriptions Tracked</Text>
                <Text style={styles.emptyDesc}>Add recurring billings like Netflix, Spotify to auto-log split splits.</Text>
              </View>
            ) : (
              subscriptions.map((sub) => (
                <Pressable
                  key={sub.id}
                  style={styles.subCard}
                  onPress={() => navigate("/subscriptions/[id]", { id: sub.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subName}>{sub.name}</Text>
                    <Text style={styles.subCycle}>{sub.billingCycle.toUpperCase()} • Renewal: {sub.nextRenewalDate}</Text>
                    <Text style={styles.subDetails}>₹{sub.amount} ({sub.splitType})</Text>
                  </View>
                  <Pressable
                    style={[styles.toggleBtn, { backgroundColor: sub.status === "active" ? "#fef3c7" : "#e0f2fe" }]}
                    onPress={() => toggleSubStatus(sub.id, sub.status)}
                  >
                    {sub.status === "active" ? (
                      <Pause size={14} color="#b45309" />
                    ) : (
                      <Play size={14} color="#0369a1" />
                    )}
                  </Pressable>
                </Pressable>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabHeader: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    padding: 8,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  tabTextActive: {
    color: Colors.primaryForeground,
  },
  scroll: {
    padding: 20,
  },
  tabContent: {
    gap: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    color: Colors.mutedForeground,
    textTransform: "uppercase",
    fontWeight: Typography.fontWeight.semibold,
  },
  statValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  cardTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
    marginBottom: 12,
  },
  categoryRow: {
    marginBottom: 12,
  },
  catLabel: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.mutedForeground,
  },
  catValue: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  progressBg: {
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    marginTop: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
  },
  contextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  contextName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  contextSpend: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
  },
  exportBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: Colors.card,
  },
  exportBtnText: {
    color: Colors.foreground,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    fontWeight: Typography.fontWeight.bold,
  },
  subCostCard: {
    backgroundColor: Colors.primary,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
  },
  subCostLabel: {
    fontSize: 10,
    color: Colors.primaryForeground,
    opacity: 0.8,
    textTransform: "uppercase",
  },
  subCostValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primaryForeground,
    marginVertical: 10,
  },
  addSubBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addSubText: {
    color: Colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  subCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  subName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  subCycle: {
    fontSize: 10,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  subDetails: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: "semibold",
    marginTop: 4,
  },
  toggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  emptyDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  emptyText: {
    textAlign: "center",
    color: Colors.mutedForeground,
    fontSize: Typography.fontSize.xs,
    paddingVertical: 12,
  },
});
