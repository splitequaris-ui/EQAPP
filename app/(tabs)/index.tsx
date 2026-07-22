import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useApp } from "../../lib/AppContext";
import { calculateBalances } from "../../lib/settleEngine";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { fetchInsights } from "../../lib/api";
import { FlashList } from "@shopify/flash-list";
import { 
  TrendingUp, 
  TrendingDown, 
  Lightbulb, 
  AlertTriangle, 
  Wallet, 
  Palmtree, 
  Plus, 
  RefreshCw,
  Users
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
      {/* Welcome Section */}
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Welcome back,</Text>
        <Text style={styles.nameText}>{profile?.nickname || profile?.name || "User"}</Text>
      </View>

      {/* Main Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Overall Balance</Text>
        <Text style={[styles.balanceAmount, { color: netBalance >= 0 ? Colors.success : Colors.destructive }]}>
          {netBalance >= 0 ? `+₹${netBalance.toLocaleString("en-IN")}` : `-₹${Math.abs(netBalance).toLocaleString("en-IN")}`}
        </Text>

        <View style={styles.balanceRow}>
          <View style={styles.balanceSubCol}>
            <View style={styles.subLabelRow}>
              <TrendingUp size={16} color={Colors.success} />
              <Text style={styles.subLabel}>You are owed</Text>
            </View>
            <Text style={[styles.subValue, { color: Colors.success }]}>
              ₹{youAreOwed.toLocaleString("en-IN")}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.balanceSubCol}>
            <View style={styles.subLabelRow}>
              <TrendingDown size={16} color={Colors.destructive} />
              <Text style={styles.subLabel}>You owe</Text>
            </View>
            <Text style={[styles.subValue, { color: Colors.destructive }]}>
              ₹{youOwe.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
      </View>

      {/* Quick Action Shortcuts */}
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionBtn} onPress={() => navigate("/groups")}>
          <Users size={20} color={Colors.primary} />
          <Text style={styles.actionBtnText}>My Groups</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => navigate("/money")}>
          <Wallet size={20} color={Colors.primary} />
          <Text style={styles.actionBtnText}>Subscriptions</Text>
        </Pressable>
      </View>

      {/* AI Insights Card */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Spending Insights</Text>
        <Pressable onPress={loadInsights} disabled={loadingInsights}>
          {loadingInsights ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <RefreshCw size={16} color={Colors.mutedForeground} />
          )}
        </Pressable>
      </View>

      <View style={styles.insightsCard}>
        {aiInsights.map((insight, idx) => {
          const Icon = INSIGHT_ICON[insight.type] || Lightbulb;
          return (
            <View key={idx} style={[styles.insightRow, idx > 0 && styles.insightBorder]}>
              <View style={[styles.insightIconBg, { backgroundColor: insight.type === "warning" ? "#fdf2f2" : "#f0fdf4" }]}>
                <Icon size={16} color={insight.type === "warning" ? Colors.destructive : Colors.success} />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightMessage}>{insight.message}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Recent Activity List */}
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
  },
  welcomeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.mutedForeground,
  },
  nameText: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  balanceCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  balanceLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primaryForeground,
    opacity: 0.8,
    textTransform: "uppercase",
    fontWeight: Typography.fontWeight.semibold,
  },
  balanceAmount: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: Typography.fontWeight.bold,
    marginVertical: 10,
  },
  balanceRow: {
    flexDirection: "row",
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: "rgba(246, 240, 226, 0.15)",
    paddingTop: 15,
    width: "100%",
  },
  balanceSubCol: {
    flex: 1,
    alignItems: "center",
  },
  subLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  subLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primaryForeground,
    opacity: 0.8,
  },
  subValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(246, 240, 226, 0.15)",
    height: "100%",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  actionBtnText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.foreground,
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
});
