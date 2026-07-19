/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where, doc, updateDoc, orderBy, limit } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { Group, Expense, Settlement, Activity, UserProfile, Subscription } from "../types";
import { dbSetDoc, dbGetDoc, dbUpdateDoc } from "../lib/firestoreQuery";

interface RouteConfig {
  path: string;
  params?: Record<string, string>;
}

interface AppContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  isLoadingAuth: boolean;
  currentRoute: RouteConfig;
  navigate: (path: string, params?: Record<string, any>) => void;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  /** Real expenses aggregated across every group the user belongs to. */
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
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  updateFullProfile: (updates: Partial<UserProfile>) => Promise<void>;
  loadMoreExpenses: () => void;
  loadMoreActivities: () => void;
  hasMoreExpenses: boolean;
  hasMoreActivities: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * Map the browser's current URL to an in-app route on first load, and stash any
 * `?connect=<handle>` QR deep-link so it survives login/onboarding.
 */
const deriveInitialRoute = (): RouteConfig => {
  if (typeof window === "undefined") return { path: "/dashboard" };
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const connect = params.get("connect");
  if (connect) {
    try {
      localStorage.setItem("dispute_pending_connect", connect);
    } catch {
      /* storage unavailable — deep link still works while on this page */
    }
    return { path: "/network" };
  }
  if (path.startsWith("/groups/")) {
    return { path: "/groups/[id]", params: { id: path.split("/")[2] } };
  }
  if (path.startsWith("/subscriptions/")) {
    const id = path.split("/")[2];
    if (id === "new") {
      return { path: "/subscriptions/new" };
    }
    return { path: "/subscriptions/[id]", params: { id } };
  }
  return { path };
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const initialRoute = deriveInitialRoute();
  const [currentRoute, setCurrentRoute] = useState<RouteConfig>(initialRoute);
  const [groups, setGroups] = useState<Group[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    initialRoute.path === "/groups/[id]" ? initialRoute.params?.id ?? null : null
  );
  
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

  // Single brand theme — the light/dark toggle was removed. `theme` is fixed to
  // "light" and setTheme is a no-op so any legacy callers stay harmless.
  const theme = "light" as const;
  const setTheme = (_t: "light" | "dark") => {};

  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  // Simple state routing history handling
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.startsWith("/groups/")) {
        const id = path.split("/")[2];
        setCurrentRoute({ path: "/groups/[id]", params: { id } });
        setActiveGroupId(id);
      } else if (path.startsWith("/subscriptions/")) {
        const id = path.split("/")[2];
        if (id === "new") {
          setCurrentRoute({ path: "/subscriptions/new", params: {} });
        } else {
          setCurrentRoute({ path: "/subscriptions/[id]", params: { id } });
        }
      } else {
        setCurrentRoute({ path, params: {} });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string, params?: Record<string, any>) => {
    let url = path;
    if (path === "/groups/[id]" && params?.id) {
      url = `/groups/${params.id}`;
      setActiveGroupId(params.id);
    } else if (path === "/subscriptions/[id]" && params?.id) {
      url = `/subscriptions/${params.id}`;
    }
    window.history.pushState(null, "", url);
    setCurrentRoute({ path, params });
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

              // Auto-sync Google photoURL if it differs or is missing in Firestore
              if (currentUser.photoURL && data.photoURL !== currentUser.photoURL) {
                dbUpdateDoc("users", currentUser.uid, { photoURL: currentUser.photoURL }).catch(console.error);
                dbUpdateDoc("profiles", currentUser.uid, { photoURL: currentUser.photoURL }).catch(console.error);
              }

              if (isFirstLoad) {
                isFirstLoad = false;
                setIsLoadingAuth(false);
              }
            } else {
              // Brand-new account: create an empty profile with isOnboarded = false
              // so Onboarding is triggered. NO fake/seeded data.
              const placeholder: UserProfile = {
                uid: currentUser.uid,
                // Name must be non-empty to satisfy Firestore validation rules.
                name:
                  currentUser.displayName ||
                  currentUser.email?.split("@")[0] ||
                  "New User",
                email: currentUser.email || "",
                photoURL: currentUser.photoURL || "",
                upiId: "",
                isOnboarded: false,
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
                  console.error(
                    "Failed to create initial user profile (check Firestore security rules for 'users'):",
                    err
                  );
                  if (isFirstLoad) {
                    isFirstLoad = false;
                    setIsLoadingAuth(false);
                  }
                });
            }
          },
          (err) => {
            console.error(
              "User profile snapshot failed (likely Firestore security rules denying read on 'users'):",
              err
            );
            if (isFirstLoad) {
              isFirstLoad = false;
              setIsLoadingAuth(false);
            }
          }
        );

        if (currentRoute.path === "/login") {
          setCurrentRoute({ path: "/dashboard" });
        }
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        setProfile(null);
        const unauthRoutes = [
          "/", "/login", "/signup",
          "/about-us", "/features", "/sources",
          "/about", "/blog", "/careers",
          "/help", "/contact", "/status",
          "/privacy", "/terms", "/reporters",
        ];
        if (!unauthRoutes.includes(currentRoute.path)) {
          setCurrentRoute({ path: "/" });
        }
        setIsLoadingAuth(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, [currentRoute.path]);

  // After sign-in + onboarding, honour a pending QR connect deep-link by routing
  // the user to the network page (where the connection is confirmed & written).
  useEffect(() => {
    if (!user || !profile || !profile.isOnboarded) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem("dispute_pending_connect");
    } catch {
      pending = null;
    }
    if (pending && currentRoute.path !== "/network") {
      navigate("/network");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.isOnboarded]);

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

  // Local/simulated automated subscription renewals execution
  useEffect(() => {
    if (!user || subscriptions.length === 0 || groups.length === 0) return;

    const todayStr = new Date().toISOString().split("T")[0];
    const triggerSimulation = async () => {
      for (const sub of subscriptions) {
        if ((sub.status === "active" || sub.status === "trial") && sub.nextRenewalDate <= todayStr) {
          try {
            // Auto-log expense if enabled and contextId is set
            if (sub.autoLogExpense && sub.contextId) {
              const activeCtx = groups.find(g => g.id === sub.contextId);
              if (activeCtx) {
                const expId = `expense_sub_${Date.now()}`;
                
                // Build splits
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

                // Save expense under group's subcollection
                await dbSetDoc(`groups/${sub.contextId}/expenses`, expId, expensePayload);

                // Add activity
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

            // Calculate next renewal date
            const nextDate = advanceRenewalDate(sub.nextRenewalDate, sub.billingCycle, sub.customCycleDays);
            
            // Update subscription doc in Firestore
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

  // Aggregate expenses across ALL of the user's groups so global views
  // (Dashboard, Reports, Settlements) render from real data instead of mocks.
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
    // groupIdsKey changes only when the SET of groups changes, avoiding churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // 1. Group info snapshot
    const docRef = doc(db, "groups", activeGroupId);
    const unsubGroup = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setActiveGroup({ id: docSnap.id, ...docSnap.data() } as Group);
      }
    });

    // 2. Expenses subcollection snapshot (paginated with limit and desc ordering)
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

    // 3. Settlements subcollection snapshot
    const settlementsRef = collection(db, `groups/${activeGroupId}/settlements`);
    const unsubSettlements = onSnapshot(settlementsRef, (snapshot) => {
      const list: Settlement[] = [];
      snapshot.forEach((subDoc) => {
        list.push({ id: subDoc.id, ...subDoc.data() } as Settlement);
      });
      setActiveGroupSettlements(list);
    });

    // 4. Activities subcollection snapshot (paginated with limit and desc ordering)
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
        currentRoute,
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
