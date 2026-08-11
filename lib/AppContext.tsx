import React, { createContext, useContext, useState, useEffect } from "react";
import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where, doc, updateDoc, orderBy, limit } from "firebase/firestore";
import { auth, db } from "./firebase";
import { Group, Expense, Settlement, Activity, UserProfile, Subscription } from "../types";
import { dbSetDoc, dbGetDoc, dbUpdateDoc } from "./firestoreQuery";
import { router } from "expo-router";
import { Alert, Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "./ThemeContext";
import { AppColors, Colors } from "../constants/colors";
import { Typography } from "../constants/typography";

interface AppContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  isLoadingAuth: boolean;
  navigate: (path: string, params?: Record<string, any>) => void;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  allExpenses: Expense[];
  subscriptions: Subscription[];
  setSubscriptions: React.Dispatch<React.SetStateAction<Subscription[]>>;
  activeGroupId: string | null;
  setActiveGroupId: (id: string | null) => void;
  activeGroup: Group | null;
  activeGroupExpenses: Expense[];
  activeGroupSettlements: Settlement[];
  activeGroupActivities: Activity[];
  refreshUserData: () => Promise<void>;
  updateProfileUpi: (upi: string) => Promise<void>;
  refetchActiveGroupData: () => void;
  theme: "light";
  setTheme: (t: "light") => void;
  updateFullProfile: (updates: Partial<UserProfile>) => Promise<void>;
  loadMoreExpenses: () => void;
  loadMoreActivities: () => void;
  hasMoreExpenses: boolean;
  hasMoreActivities: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [globalAlert, setGlobalAlert] = useState<any | null>(null);

  useEffect(() => {
    Alert.alert = (title, message, buttons) => {
      setGlobalAlert({ title, message, buttons });
    };
  }, []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [activeGroupExpenses, setActiveGroupExpenses] = useState<Expense[]>([]);
  const [activeGroupSettlements, setActiveGroupSettlements] = useState<Settlement[]>([]);
  const [activeGroupActivities, setActiveGroupActivities] = useState<Activity[]>([]);

  const [expenseLimit, setExpenseLimit] = useState(20);
  const [activityLimit, setActivityLimit] = useState(20);
  const [hasMoreExpenses, setHasMoreExpenses] = useState(true);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);

  const loadMoreExpenses = () => setExpenseLimit((prev) => prev + 20);
  const loadMoreActivities = () => setActivityLimit((prev) => prev + 20);

  useEffect(() => {
    setExpenseLimit(20);
    setActivityLimit(20);
    setHasMoreExpenses(true);
    setHasMoreActivities(true);
  }, [activeGroupId]);

  const theme = "light" as const;
  const setTheme = (_t: "light") => {};

  const navigate = (path: string, params?: Record<string, any>) => {
    if ((path === "/groups/[id]" || path === "/group/[id]") && params?.id) {
      setActiveGroupId(params.id);
      router.push(`/group/${params.id}`);
    } else if ((path === "/subscriptions/[id]" || path === "/subscription/[id]") && params?.id) {
      router.push(`/subscription/${params.id}`);
    } else if (path === "/subscriptions/new" || path === "/subscription/new") {
      router.push("/subscription/new");
    } else if (path === "/login") {
      router.replace("/(auth)/login");
    } else if (path === "/signup") {
      router.replace("/(auth)/login"); // Toggle will be handled inside login screen
    } else if (path === "/") {
      router.replace("/(tabs)");
    } else {
      // Map other routes e.g., /network, /money to corresponding tabs/stacks
      if (path === "/network") router.push("/(tabs)/network");
      else if (path === "/groups") router.push("/(tabs)/groups");
      else if (path === "/money") router.push("/(tabs)/money");
      else if (path === "/profile") router.push("/(tabs)/profile");
      else if (path === "/settings") router.push("/(tabs)/profile");
      else if (path === "/settlements") router.push("/settlements");
      else if (path === "/reports") router.push("/reports");
      else if (path === "/dashboard") router.replace("/(tabs)");
    }
  };

  const updateFullProfile = async (updates: Partial<UserProfile>) => {
    if (!user || !profile) return;
    try {
      const updated = { ...profile, ...updates };
      await dbSetDoc("users", user.uid, updated);
      const publicProfile = {
        uid: user.uid,
        name: updated.name,
        photoURL: updated.photoURL || "",
        username: updated.username || "",
      };
      await dbSetDoc("profiles", user.uid, publicProfile);
      setProfile(updated);
    } catch (err) {
      console.error("Failed to update full profile info:", err);
    }
  };

  const updateProfileUpi = async (upi: string) => {
    await updateFullProfile({ upiId: upi });
  };

  const refreshUserData = async () => {
    if (!user) return;
    try {
      const snap = await dbGetDoc("users", user.uid);
      if (snap && snap.exists()) {
        setProfile(snap.data() as UserProfile);
      }
    } catch (err) {
      console.error("Failed refreshing user profile data:", err);
    }
  };

  // Real Firebase auth state listener
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        if (unsubProfile) unsubProfile();

        let isFirstLoad = true;

        // Listen to User Profile node in real-time
        unsubProfile = onSnapshot(
          doc(db, "users", currentUser.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              setProfile(data);

              if (data.isOnboarded) {
                const publicProfile = {
                  uid: data.uid,
                  name: data.name,
                  photoURL: data.photoURL || "",
                  username: data.username || "",
                  surname: data.surname || "",
                  nickname: data.nickname || "",
                };
                dbSetDoc("profiles", data.uid, publicProfile).catch(console.error);

                if (data.username) {
                  dbUpdateDoc("usernames", data.username.toLowerCase(), {
                    uid: data.uid,
                    name: data.name,
                    photoURL: data.photoURL || "",
                  }).catch(console.error);
                }
              }

              // Auto-sync photoURL
              if (currentUser.photoURL && data.photoURL !== currentUser.photoURL) {
                dbUpdateDoc("users", currentUser.uid, { photoURL: currentUser.photoURL }).catch(console.error);
                dbUpdateDoc("profiles", currentUser.uid, { photoURL: currentUser.photoURL }).catch(console.error);
              }

              if (isFirstLoad) {
                isFirstLoad = false;
                setIsLoadingAuth(false);
              }
            } else {
              const placeholder: UserProfile = {
                uid: currentUser.uid,
                name: currentUser.displayName || currentUser.email?.split("@")[0] || "New User",
                email: currentUser.email || "",
                photoURL: currentUser.photoURL || "",
                upiId: "",
                isOnboarded: false,
                friends: [],
                sentRequests: [],
                receivedRequests: [],
                createdAt: new Date().toISOString(),
              };
              dbSetDoc("users", currentUser.uid, placeholder)
                .then(() => {
                  const publicPlaceholder = {
                    uid: currentUser.uid,
                    name: placeholder.name,
                    photoURL: placeholder.photoURL,
                    username: "",
                  };
                  dbSetDoc("profiles", currentUser.uid, publicPlaceholder).catch(console.error);
                  setProfile(placeholder);
                  if (isFirstLoad) {
                    isFirstLoad = false;
                    setIsLoadingAuth(false);
                  }
                })
                .catch((err) => {
                  console.error("Failed to create initial user profile:", err);
                  if (isFirstLoad) {
                    isFirstLoad = false;
                    setIsLoadingAuth(false);
                  }
                });
            }
          },
          (err) => {
            console.error("User profile snapshot failed:", err);
            if (isFirstLoad) {
              isFirstLoad = false;
              setIsLoadingAuth(false);
            }
          }
        );
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        setProfile(null);
        setIsLoadingAuth(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Listen to GROUPS list for authenticated user
  useEffect(() => {
    if (!user) {
      setGroups([]);
      return;
    }

    const q = query(collection(db, "groups"), where("members", "array-contains", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedGroups: Group[] = [];
        snapshot.forEach((docSnap) => {
          loadedGroups.push({ id: docSnap.id, ...docSnap.data() } as Group);
        });
        setGroups(loadedGroups);
      },
      (error) => {
        console.error("Groups snap listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Listen to SUBSCRIPTIONS list for authenticated user
  useEffect(() => {
    if (!user) {
      setSubscriptions([]);
      return;
    }

    const q = query(collection(db, "subscriptions"), where("ownerId", "==", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedSubs: Subscription[] = [];
        snapshot.forEach((docSnap) => {
          loadedSubs.push({ id: docSnap.id, ...docSnap.data() } as Subscription);
        });
        setSubscriptions(loadedSubs);
      },
      (error) => {
        console.error("Subscriptions snap listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const advanceRenewalDate = (dateStr: string, cycle: string, customDays?: number): string => {
    const date = new Date(dateStr);
    if (cycle === "weekly") {
      date.setDate(date.getDate() + 7);
    } else if (cycle === "monthly") {
      date.setMonth(date.getMonth() + 1);
    } else if (cycle === "quarterly") {
      date.setMonth(date.getMonth() + 3);
    } else if (cycle === "yearly") {
      date.setFullYear(date.getFullYear() + 1);
    } else if (cycle === "custom" && customDays) {
      date.setDate(date.getDate() + customDays);
    } else {
      date.setMonth(date.getMonth() + 1);
    }
    return date.toISOString().split("T")[0];
  };

  // Subscription renewals simulation
  useEffect(() => {
    if (!user || subscriptions.length === 0 || groups.length === 0) return;

    const todayStr = new Date().toISOString().split("T")[0];
    const triggerSimulation = async () => {
      for (const sub of subscriptions) {
        if ((sub.status === "active" || sub.status === "trial") && sub.nextRenewalDate <= todayStr) {
          try {
            if (sub.autoLogExpense && sub.contextId) {
              const activeCtx = groups.find(g => g.id === sub.contextId);
              if (activeCtx) {
                const expId = `expense_sub_${Date.now()}`;
                let splitsData = [];
                if (sub.splitType === "equal") {
                  const share = sub.amount / activeCtx.members.length;
                  splitsData = activeCtx.members.map(mId => ({
                    uid: mId,
                    amount: share,
                    checked: true
                  }));
                } else if (sub.splitMembers) {
                  splitsData = sub.splitMembers.map(m => ({
                    uid: m.userId,
                    amount: m.share,
                    checked: true
                  }));
                }

                const expensePayload = {
                  id: expId,
                  groupId: sub.contextId,
                  title: `${sub.name} Renewal`,
                  amount: sub.amount,
                  paidBy: sub.ownerId,
                  category: sub.category.toLowerCase(),
                  date: sub.nextRenewalDate,
                  splitType: sub.splitType === "equal" ? "equal" : "exact",
                  splits: splitsData,
                  createdAt: new Date().toISOString(),
                  source: "subscription",
                  subscriptionId: sub.id
                };

                await dbSetDoc(`groups/${sub.contextId}/expenses`, expId, expensePayload);

                const actId = `act_sub_${Date.now()}`;
                await dbSetDoc(`groups/${sub.contextId}/activities`, actId, {
                  id: actId,
                  groupId: sub.contextId,
                  category: "expense_added",
                  message: `Subscription "${sub.name}" auto-renewed and logged ₹${sub.amount}.`,
                  actorId: sub.ownerId,
                  createdAt: new Date().toISOString()
                });
              }
            }

            const nextDate = advanceRenewalDate(sub.nextRenewalDate, sub.billingCycle, sub.customCycleDays);
            await updateDoc(doc(db, "subscriptions", sub.id), {
              nextRenewalDate: nextDate,
              lastChargedDate: sub.nextRenewalDate
            });
          } catch (err) {
            console.error("Simulation run error for subscription:", sub.id, err);
          }
        }
      }
    };

    triggerSimulation();
  }, [user, subscriptions, groups]);

  // Aggregate all expenses
  const groupIdsKey = groups.map((g) => g.id).sort().join(",");
  useEffect(() => {
    if (!user || groups.length === 0) {
      setAllExpenses([]);
      return;
    }

    const byGroup: Record<string, Expense[]> = {};
    const unsubs = groups.map((g) =>
      onSnapshot(
        collection(db, `groups/${g.id}/expenses`),
        (snapshot) => {
          const list: Expense[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ ...docSnap.data(), id: docSnap.id, groupId: g.id } as Expense);
          });
          byGroup[g.id] = list;
          setAllExpenses(Object.values(byGroup).flat());
        },
        (error) => console.error("Aggregate expenses listener error:", error)
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [user, groupIdsKey]);

  // Subscribe to details of SELECTED ACTIVE GROUP
  useEffect(() => {
    if (!user || !activeGroupId) {
      setActiveGroup(null);
      setActiveGroupExpenses([]);
      setActiveGroupSettlements([]);
      setActiveGroupActivities([]);
      return;
    }

    const docRef = doc(db, "groups", activeGroupId);
    const unsubGroup = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setActiveGroup({ id: docSnap.id, ...docSnap.data() } as Group);
      }
    });

    const expensesRef = collection(db, `groups/${activeGroupId}/expenses`);
    const qExpenses = query(expensesRef, orderBy("date", "desc"), limit(expenseLimit));
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const list: Expense[] = [];
      snapshot.forEach((subDoc) => {
        list.push({ id: subDoc.id, ...subDoc.data() } as Expense);
      });
      setActiveGroupExpenses(list);
      setHasMoreExpenses(snapshot.size === expenseLimit);
    });

    const settlementsRef = collection(db, `groups/${activeGroupId}/settlements`);
    const unsubSettlements = onSnapshot(settlementsRef, (snapshot) => {
      const list: Settlement[] = [];
      snapshot.forEach((subDoc) => {
        list.push({ id: subDoc.id, ...subDoc.data() } as Settlement);
      });
      setActiveGroupSettlements(list);
    });

    const activitiesRef = collection(db, `groups/${activeGroupId}/activities`);
    const qActivities = query(activitiesRef, orderBy("createdAt", "desc"), limit(activityLimit));
    const unsubActivities = onSnapshot(qActivities, (snapshot) => {
      const list: Activity[] = [];
      snapshot.forEach((subDoc) => {
        list.push({ id: subDoc.id, ...subDoc.data() } as Activity);
      });
      setActiveGroupActivities(list);
      setHasMoreActivities(snapshot.size === activityLimit);
    });

    return () => {
      unsubGroup();
      unsubExpenses();
      unsubSettlements();
      unsubActivities();
    };
  }, [user, activeGroupId, expenseLimit, activityLimit]);

  const refetchActiveGroupData = () => {
    const backupId = activeGroupId;
    setActiveGroupId(null);
    setTimeout(() => setActiveGroupId(backupId), 10);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        profile,
        isLoadingAuth,
        navigate,
        groups,
        setGroups,
        allExpenses,
        subscriptions,
        setSubscriptions,
        activeGroupId,
        setActiveGroupId,
        activeGroup,
        activeGroupExpenses,
        activeGroupSettlements,
        activeGroupActivities,
        refreshUserData,
        updateProfileUpi,
        refetchActiveGroupData,
        theme,
        setTheme,
        updateFullProfile,
        loadMoreExpenses,
        loadMoreActivities,
        hasMoreExpenses,
        hasMoreActivities,
      }}
    >
      {children}
      {globalAlert && (
        <CustomAlertModal
          visible={!!globalAlert}
          alert={globalAlert}
          onClose={() => setGlobalAlert(null)}
        />
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider context");
  }
  return context;
};

function CustomAlertModal({ visible, alert, onClose }: { visible: boolean; alert: any; onClose: () => void }) {
  const { colors } = useTheme();
  const alertStyles = React.useMemo(() => createAlertStyles(colors), [colors]);
  const { title, message, buttons } = alert;

  const handleButtonPress = (btnOnPress?: () => void) => {
    onClose();
    if (btnOnPress) {
      btnOnPress();
    }
  };

  const renderButtons = () => {
    if (!buttons || buttons.length === 0) {
      return (
        <Pressable style={alertStyles.alertBtnPrimary} onPress={() => handleButtonPress()}>
          <Text style={alertStyles.alertBtnTextPrimary}>OK</Text>
        </Pressable>
      );
    }

    return (
      <View style={buttons.length > 2 ? alertStyles.btnCol : alertStyles.btnRow}>
        {buttons.map((btn: any, idx: number) => {
          const isCancel = btn.style === "cancel";
          const isDestructive = btn.style === "destructive";
          
          let btnStyle = alertStyles.alertBtnPrimary;
          let textStyle = alertStyles.alertBtnTextPrimary;
          
          if (isCancel) {
            btnStyle = alertStyles.alertBtnSecondary;
            textStyle = alertStyles.alertBtnTextSecondary;
          } else if (isDestructive) {
            btnStyle = alertStyles.alertBtnDestructive;
            textStyle = alertStyles.alertBtnTextPrimary;
          }
          
          return (
            <Pressable 
              key={idx} 
              style={[btnStyle, { flex: buttons.length > 2 ? undefined : 1 }]} 
              onPress={() => handleButtonPress(btn.onPress)}
            >
              <Text style={textStyle}>{btn.text}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={alertStyles.alertOverlay}>
        <View style={alertStyles.alertContainer}>
          {title ? <Text style={alertStyles.alertTitle}>{title}</Text> : null}
          {message ? <Text style={alertStyles.alertMessage}>{message}</Text> : null}
          {renderButtons()}
        </View>
      </View>
    </Modal>
  );
}

function createAlertStyles(colors: AppColors) {
  return StyleSheet.create({
    alertOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.65)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    alertContainer: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 24,
      width: "100%",
      maxWidth: 320,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 10,
    },
    alertTitle: {
      fontSize: Typography.fontSize.lg,
      fontWeight: "bold",
      color: colors.foreground,
      marginBottom: 8,
      textAlign: "center",
    },
    alertMessage: {
      fontSize: Typography.fontSize.sm,
      color: colors.mutedForeground,
      lineHeight: 20,
      marginBottom: 24,
      textAlign: "center",
    },
    btnRow: {
      flexDirection: "row",
      gap: 12,
      width: "100%",
    },
    btnCol: {
      flexDirection: "column",
      gap: 8,
      width: "100%",
    },
    alertBtnPrimary: {
      backgroundColor: colors.primary,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    alertBtnTextPrimary: {
      color: colors.primaryForeground,
      fontSize: Typography.fontSize.sm,
      fontWeight: "bold",
    },
    alertBtnSecondary: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    alertBtnTextSecondary: {
      color: colors.foreground,
      fontSize: Typography.fontSize.sm,
      fontWeight: "bold",
    },
    alertBtnDestructive: {
      backgroundColor: colors.destructive,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
  });
}
