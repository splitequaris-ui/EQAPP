import React, { useState, useMemo, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator, Clipboard, Share, Animated } from "react-native";
import { useApp } from "../../lib/AppContext";
import { calculateBalances } from "../../lib/settleEngine";
import { db } from "../../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { Typography } from "../../constants/typography";
import { TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, Layers, Plus, Calendar, Play, Pause } from "lucide-react-native";
import { useTheme } from "../../lib/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function MoneyScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user, groups, allExpenses, subscriptions, navigate } = useApp();
  const [activeTab, setActiveTab] = useState<"reports" | "subs">("reports");
  const styles = useMemo(() => createStyles(colors), [colors]);

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
  }, [activeTab]);

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

  const exportStatementToClipboard = async () => {
    if (allExpenses.length === 0) {
      Alert.alert("Info", "No transactions to export.");
      return;
    }
    const headers = "Date,Title,Amount,Category,SplitType\n";
    const rows = allExpenses.map(e => `${e.date},${e.title},${e.amount},${e.category},${e.splitType}`).join("\n");
    const csvContent = headers + rows;
    
    Clipboard.setString(csvContent);
    
    try {
      await Share.share({
        title: "Exported Expenses CSV",
        message: csvContent,
      });
    } catch (err) {
      console.error("Failed to share CSV content:", err);
      Alert.alert("Success", "Consolidated ledger data copied to clipboard in CSV format.");
    }
  };

  return (
    <View style={styles.container}>
      {/* Segmented Control */}
      <View style={styles.segmentedWrapper}>
        <View style={styles.segmentedControl}>
          <Pressable
            style={[styles.segmentBtn, activeTab === "reports" && styles.segmentBtnActive]}
            onPress={() => setActiveTab("reports")}
          >
            <Text style={[styles.segmentText, activeTab === "reports" && styles.segmentTextActive]}>Analytics</Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, activeTab === "subs" && styles.segmentBtnActive]}
            onPress={() => setActiveTab("subs")}
          >
            <Text style={[styles.segmentText, activeTab === "subs" && styles.segmentTextActive]}>Subscriptions</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateYAnim }] }}>
          {activeTab === "reports" ? (
            <View style={styles.tabContent}>
              {/* Overview Stats */}
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel} numberOfLines={1}>MONTHLY FLOW</Text>
                  <Text 
                    style={styles.statValue} 
                    numberOfLines={1} 
                    adjustsFontSizeToFit={true} 
                    minimumFontScale={0.6}
                  >
                    ₹{Math.round(totalSpentThisMonth).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel} numberOfLines={1}>YOU OWE</Text>
                  <Text 
                    style={[styles.statValue, { color: colors.destructive }]} 
                    numberOfLines={1} 
                    adjustsFontSizeToFit={true} 
                    minimumFontScale={0.6}
                  >
                    ₹{Math.round(youOwe).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel} numberOfLines={1}>OWED TO YOU</Text>
                  <Text 
                    style={[styles.statValue, { color: colors.success }]} 
                    numberOfLines={1} 
                    adjustsFontSizeToFit={true} 
                    minimumFontScale={0.6}
                  >
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
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={styles.catLabel}>{cat.toUpperCase()}</Text>
                          <Text style={styles.catValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            ₹{amt.toLocaleString("en-IN")} ({pct}%)
                          </Text>
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
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                          <Layers size={16} color={colors.primary} />
                          <Text style={styles.contextName} numberOfLines={1}>{g.name}</Text>
                        </View>
                        <Text style={styles.contextSpend} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          ₹{groupSpend.toLocaleString("en-IN")} ({pct}%)
                        </Text>
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
                <Text 
                  style={styles.subCostValue} 
                  numberOfLines={1} 
                  adjustsFontSizeToFit={true} 
                  minimumFontScale={0.7}
                >
                  ₹{Math.round(totalMonthlySubCost).toLocaleString("en-IN")}
                </Text>
                <Pressable style={styles.addSubBtn} onPress={() => navigate("/subscriptions/new")}>
                  <Plus size={16} color={colors.primaryForeground} />
                  <Text style={styles.addSubText}>Add Subscription</Text>
                </Pressable>
              </View>

              {/* Subscriptions List */}
              <Text style={styles.sectionTitle}>Active Subscriptions ({subscriptions.length})</Text>
              {subscriptions.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Calendar size={32} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
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
                      style={[
                        styles.toggleBtn,
                        { backgroundColor: sub.status === "active" ? (isDark ? "#3b2b1a" : "#fef3c7") : (isDark ? "#1a3a2b" : "#e0f2fe") }
                      ]}
                      onPress={() => toggleSubStatus(sub.id, sub.status)}
                    >
                      {sub.status === "active" ? (
                        <Pause size={14} color={isDark ? "#fbbf24" : "#b45309"} />
                      ) : (
                        <Play size={14} color={isDark ? "#38bdf8" : "#0369a1"} />
                      )}
                    </Pressable>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

import { AppColors } from "../../constants/colors";

function createStyles(colors: AppColors) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  segmentedWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  segmentBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  segmentTextActive: {
    color: colors.primaryForeground,
    fontWeight: "700",
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  tabContent: {
    gap: 20,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.glassCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
    minHeight: 80,
    justifyContent: "center",
  },
  statLabel: {
    fontSize: 9,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    fontWeight: Typography.fontWeight.semibold,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 15,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
    width: "100%",
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.glassCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  cardTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "800",
    color: colors.foreground,
    marginBottom: 16,
    letterSpacing: -0.2,
  },
  categoryRow: {
    marginBottom: 16,
  },
  catLabel: {
    fontSize: 11,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
    letterSpacing: 0.3,
  },
  catValue: {
    fontSize: 11,
    fontWeight: Typography.fontWeight.bold,
    color: colors.mutedForeground,
  },
  progressBg: {
    height: 6,
    backgroundColor: colors.background,
    borderRadius: 3,
    marginTop: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  contextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contextName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
  },
  contextSpend: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    fontWeight: "600",
  },
  exportBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: colors.glassCard,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  exportBtnText: {
    color: colors.primary,
    fontSize: Typography.fontSize.sm,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  subCostCard: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  subCostLabel: {
    fontSize: 10,
    color: colors.primaryForeground,
    opacity: 0.8,
    textTransform: "uppercase",
  },
  subCostValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: colors.primaryForeground,
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
    color: colors.primaryForeground,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: colors.foreground,
  },
  subCard: {
    backgroundColor: colors.glassCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  subName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: colors.foreground,
  },
  subCycle: {
    fontSize: 10,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  subDetails: {
    fontSize: Typography.fontSize.xs,
    color: colors.primary,
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: colors.foreground,
  },
  emptyDesc: {
    fontSize: Typography.fontSize.xs,
    color: colors.mutedForeground,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  emptyText: {
    textAlign: "center",
    color: colors.mutedForeground,
    fontSize: Typography.fontSize.xs,
    paddingVertical: 12,
  },
}); }
