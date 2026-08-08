import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useApp } from "../../lib/AppContext";
import { db } from "../../lib/firebase";
import { doc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { ArrowLeft, Trash2, Calendar, Play, Pause, AlertCircle } from "lucide-react-native";

export default function SubscriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { subscriptions, groups } = useApp();
  const sub = subscriptions.find((s) => s.id === id);

  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        const list: any[] = [];
        for (const g of groups) {
          const q = query(collection(db, `groups/${g.id}/expenses`), where("subscriptionId", "==", id));
          const snap = await getDocs(q);
          snap.forEach((docSnap) => {
            list.push({ ...docSnap.data(), groupName: g.name });
          });
        }
        list.sort((a, b) => b.date.localeCompare(a.date));
        setHistory(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [id, groups]);

  if (!sub) {
    return (
      <View style={styles.loadingContainer}>
        <AlertCircle size={32} color={Colors.destructive} />
        <Text style={styles.notFoundText}>Subscription Not Found</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const group = sub.contextId ? groups.find((g) => g.id === sub.contextId) : null;

  const toggleStatus = async () => {
    const newStatus = sub.status === "active" ? "paused" : "active";
    try {
      await updateDoc(doc(db, "subscriptions", sub.id), {
        status: newStatus,
      });
      Alert.alert("Success", `Subscription ${newStatus === "active" ? "resumed" : "paused"} successfully.`);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to update status.");
    }
  };

  const handleDelete = () => {
    const onDelete = async () => {
      try {
        await deleteDoc(doc(db, "subscriptions", sub.id));
        Alert.alert("Success", "Subscription deleted.");
        router.back();
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Failed to delete subscription.");
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm("Cancel Subscription\n\nAre you sure you want to stop tracking this subscription?");
      if (confirmed) {
        onDelete();
      }
    } else {
      Alert.alert(
        "Cancel Subscription",
        "Are you sure you want to stop tracking this subscription?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: onDelete,
          },
        ]
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Subscription Details</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.subName}>{sub.name}</Text>
        <Text style={styles.subAmount}>₹{sub.amount} / {sub.billingCycle}</Text>

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Text style={styles.label}>Status</Text>
            <Text style={[styles.value, { color: sub.status === "active" ? Colors.success : Colors.mutedForeground }]}>
              {sub.status.toUpperCase()}
            </Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.label}>Next Renewal</Text>
            <Text style={styles.value}>{sub.nextRenewalDate}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.label}>Split Context</Text>
            <Text style={styles.value}>{group ? group.name : "Solo"}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: sub.status === "active" ? "#fef3c7" : "#d1fae5" }]}
            onPress={toggleStatus}
          >
            {sub.status === "active" ? (
              <>
                <Pause size={16} color="#b45309" />
                <Text style={[styles.actionBtnText, { color: "#b45309" }]}>Pause Billing</Text>
              </>
            ) : (
              <>
                <Play size={16} color="#065f46" />
                <Text style={[styles.actionBtnText, { color: "#065f46" }]}>Resume Billing</Text>
              </>
            )}
          </Pressable>

          <Pressable style={[styles.actionBtn, { backgroundColor: "#fee2e2" }]} onPress={handleDelete}>
            <Trash2 size={16} color={Colors.destructive} />
            <Text style={[styles.actionBtnText, { color: Colors.destructive }]}>Delete</Text>
          </Pressable>
        </View>
      </View>

      {/* History */}
      <Text style={styles.sectionTitle}>History of Auto-Logs</Text>
      <View style={styles.card}>
        {loadingHistory ? (
          <ActivityIndicator color={Colors.primary} />
        ) : history.length === 0 ? (
          <Text style={styles.emptyText}>No historical logs detected.</Text>
        ) : (
          history.map((h, idx) => (
            <View key={h.id} style={[styles.historyRow, idx > 0 && styles.historyBorder]}>
              <View>
                <Text style={styles.historyTitle}>{h.title}</Text>
                <Text style={styles.historyMeta}>{h.groupName} • {h.date}</Text>
              </View>
              <Text style={styles.historyAmount}>₹{h.amount}</Text>
            </View>
          ))
        )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
    gap: 12,
  },
  notFoundText: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: Colors.foreground,
  },
  backLink: {
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
  },
  backLinkText: {
    color: Colors.primary,
    fontWeight: "bold",
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
    padding: 20,
    marginBottom: 20,
  },
  subName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: "bold",
    color: Colors.foreground,
    textAlign: "center",
  },
  subAmount: {
    fontSize: Typography.fontSize.xl,
    fontWeight: "bold",
    color: Colors.primary,
    textAlign: "center",
    marginVertical: 10,
  },
  grid: {
    marginVertical: 15,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 15,
  },
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
  },
  value: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "semibold",
    color: Colors.foreground,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: "bold",
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: "bold",
    color: Colors.foreground,
    marginBottom: 10,
  },
  emptyText: {
    textAlign: "center",
    color: Colors.mutedForeground,
    fontSize: Typography.fontSize.xs,
    paddingVertical: 15,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  historyBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  historyTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "semibold",
    color: Colors.foreground,
  },
  historyMeta: {
    fontSize: Typography.fontSize.xs,
    color: Colors.mutedForeground,
    marginTop: 2,
  },
  historyAmount: {
    fontSize: Typography.fontSize.sm,
    fontWeight: "bold",
    color: Colors.foreground,
  },
});
