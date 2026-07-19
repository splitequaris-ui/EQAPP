/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { calculateBalances } from "../lib/settleEngine";
import {
  IndianRupee,
  Sparkles,
  ArrowRight,
  Users,
  Layers,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Zap,
  Home,
  UtensilsCrossed,
  Car,
  Ticket,
  HeartPulse,
  Receipt,
  AlertTriangle,
  Wallet,
  Lightbulb,
  Palmtree,
  RefreshCw,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { dbGetDoc, dbSetDoc } from "../lib/firestoreQuery";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Human-friendly labels + lucide icons for the raw category keys on expenses.
const CATEGORY_META: Record<string, { label: string; icon: React.ElementType }> = {
  rent: { label: "Accommodation & Rent", icon: Home },
  food: { label: "Dining & Food", icon: UtensilsCrossed },
  travel: { label: "Travel & Transport", icon: Car },
  entertainment: { label: "Activities & Entertainment", icon: Ticket },
  healthcare: { label: "Healthcare", icon: HeartPulse },
  others: { label: "Others", icon: Receipt },
};

const catMeta = (key: string) =>
  CATEGORY_META[key] || { label: key.charAt(0).toUpperCase() + key.slice(1), icon: Receipt };

// Icon per AI insight type (replaces the old emoji prefixes).
const INSIGHT_ICON: Record<string, React.ElementType> = {
  warning: AlertTriangle,
  budget: Wallet,
  tip: Lightbulb,
  chill: Palmtree,
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const Dashboard: React.FC = () => {
  const { user, profile, groups, allExpenses, navigate } = useApp();

  const [aiInsights, setAiInsights] = useState<{ type: string; title: string; message: string }[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [friendUsername, setFriendUsername] = useState("");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [whoPaid, setWhoPaid] = useState<"me" | "friend">("me");
  const [splitOption, setSplitOption] = useState<"equal" | "lend" | "borrow">("equal");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Real, computed metrics (settlement offset entries excluded from "spend") ---
  const activeGroupIds = useMemo(
    () => new Set(groups.filter((g) => g.status !== "ended").map((g) => g.id)),
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

  // Net balance of the current user across all groups (includes settlement offsets).
  const { youOwe, youAreOwed } = useMemo(() => {
    let owe = 0;
    let owed = 0;
    if (user) {
      groups.forEach((g) => {
        if (g.status === "ended") return;
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
    () => groups.filter(g => g.status !== "ended").reduce((sum, g) => sum + (g.budget || 0), 0),
    [groups]
  );

  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setErrorMsg(null);

    const amountVal = parseFloat(expenseAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setErrorMsg("Please enter a valid amount.");
      return;
    }

    if (!friendUsername.trim()) {
      setErrorMsg("Please enter a friend's username.");
      return;
    }

    if (!expenseTitle.trim()) {
      setErrorMsg("Please enter a description.");
      return;
    }

    setSubmitting(true);
    try {
      const cleanUsername = friendUsername.trim().toLowerCase();
      if (profile.username && cleanUsername === profile.username.toLowerCase()) {
        setErrorMsg("You cannot split an expense with yourself.");
        setSubmitting(false);
        return;
      }

      const uSnap = await dbGetDoc("usernames", cleanUsername);
      if (!uSnap || !uSnap.exists()) {
        setErrorMsg(`Username @${cleanUsername} does not exist. Only registered users can receive invites/splits.`);
        setSubmitting(false);
        return;
      }

      const friendUid = uSnap.data()?.uid;
      let fUserSnap = await dbGetDoc("users", friendUid);
      if (!fUserSnap || !fUserSnap.exists()) {
        fUserSnap = await dbGetDoc("profiles", friendUid);
      }
      const friendData = fUserSnap?.data();
      const friendName = friendData?.nickname || friendData?.name || `user_${cleanUsername}`;

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

        const actId = `act_${Date.now()}`;
        await dbSetDoc(`groups/${targetGroupId}/activities`, actId, {
          id: actId,
          groupId: targetGroupId,
          category: "group_created",
          message: `${profile.name || "You"} connected with @${cleanUsername} for direct splits.`,
          actorId: user.uid,
          createdAt: new Date().toISOString(),
        });
      }

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
        title: expenseTitle.trim(),
        amount: amountVal,
        paidBy: payer,
        category: "others",
        date: new Date().toISOString().substring(0, 10),
        notes: `Quick split with @${cleanUsername}`,
        splitType: "custom",
        splits: splitsList,
        createdAt: new Date().toISOString(),
      });

      const expActId = `act_${Date.now()}`;
      await dbSetDoc(`groups/${targetGroupId}/activities`, expActId, {
        id: expActId,
        groupId: targetGroupId,
        category: "expense_added",
        message: `${whoPaid === "me" ? "You" : friendName} added direct expense "${expenseTitle.trim()}" of ₹${amountVal.toLocaleString("en-IN")}.`,
        actorId: user.uid,
        createdAt: new Date().toISOString(),
      });

      setFriendUsername("");
      setExpenseTitle("");
      setExpenseAmount("");
      setWhoPaid("me");
      setSplitOption("equal");
      setShowAddExpense(false);
    } catch (err) {
      console.error("Direct split failed:", err);
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Category distribution across all real spend.
  const categoryList = useMemo(() => {
    const totals: Record<string, number> = {};
    spendExpenses.forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + (e.amount || 0);
    });
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [spendExpenses]);

  // Fetch server-side AI insights (Ollama) from REAL expenses only.
  const loadAInsights = async () => {
    if (spendExpenses.length === 0) return;
    setLoadingInsights(true);
    try {
      const mergedNames: Record<string, string> = {};
      groups.forEach((g) => Object.assign(mergedNames, g.memberNames || {}));
      const token = await user?.getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/insights", {
        method: "POST",
        headers,
        body: JSON.stringify({
          expenses: spendExpenses.map((e) => ({ title: e.title, amount: e.amount, category: e.category })),
          budget: groups.reduce((sum, g) => sum + (g.budget || 0), 0),
          memberNames: mergedNames,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsights(data);
      }
    } catch (err) {
      console.error("Failed to fetch insights:", err);
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    if (spendExpenses.length > 0) loadAInsights();
    else setAiInsights([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendExpenses.length]);

  const eyebrow = "text-xs font-mono uppercase tracking-widest text-muted-foreground";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1.5">
          <span className={eyebrow}>Overview</span>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Hi, {profile?.nickname || profile?.name?.split(" ")[0] || "there"}
          </h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            Track clearly, split fairly, and settle up in seconds. No awkward reminders — only good times.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 self-start sm:self-auto">
          <Button
            onClick={() => setShowAddExpense(true)}
            className="shrink-0 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus />
            Add Expense
          </Button>

          <Button
            id="explore-network-banner-btn"
            variant="outline"
            onClick={() => navigate("/network")}
            className="shrink-0 cursor-pointer"
          >
            <Users />
            Manage network
          </Button>
        </div>
      </div>

      {/* Empty state — no fake data, real CTA */}
      {groups.length === 0 && (
        <div className="flex flex-col items-center gap-5 rounded-xl border-2 border-dashed border-border bg-card/40 p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border bg-muted text-muted-foreground">
            <Layers className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">No active balance groups</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create your first group to start tracking shared expenses. Everything on your dashboard is built from the
              spends you and your members log — nothing is pre-filled.
            </p>
          </div>
          <Button id="create-first-group-btn" onClick={() => navigate("/groups")} className="cursor-pointer">
            <Plus />
            Create a group
          </Button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="shadow-xs transition-shadow hover:shadow-md">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">Total group spend</span>
            <IndianRupee className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-heading font-bold">{inr(totalSpent)}</div>
            {totalBudget > 0 ? (
              <div className="flex flex-col gap-1.5 mt-2">
                <div className="flex justify-between text-[10px] font-mono text-muted-foreground uppercase font-bold">
                  <span>Budget Health</span>
                  <span>Limit: {inr(totalBudget)}</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${totalSpent > totalBudget ? "bg-destructive" : totalSpent > totalBudget * 0.75 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, Math.round((totalSpent / totalBudget) * 100))}%` }}
                  ></div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Aggregated across active pools</p>
            )}
          </CardContent>
        </Card>
        <StatCard
          label="You owe"
          value={inr(youOwe)}
          hint="Total outstanding bills"
          icon={TrendingDown}
          tone="destructive"
        />
        <StatCard
          label="You are owed"
          value={inr(youAreOwed)}
          hint="Reimbursement suggestions"
          icon={TrendingUp}
          tone="success"
        />
      </div>

      {/* Group Spend & Budgets tracking */}
      {groups.filter(g => g.status !== "ended").length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-xs">
          <div>
            <h3 className="font-heading text-lg font-semibold tracking-tight">Active Group Spend & Limits</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Real-time status of your active group budget limits.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {groups.filter(g => g.status !== "ended").map((g) => {
              const groupExpenses = allExpenses.filter((e) => e.groupId === g.id && e.category !== "settlement");
              const spent = groupExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
              const ratio = g.budget ? Math.min(100, Math.round((spent / g.budget) * 100)) : null;

              return (
                <div key={g.id} className="bg-background/40 border border-border/50 rounded-xl p-4 flex flex-col gap-3 justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-wider">
                      {g.isDirectSplit ? "Direct Split" : "Group Pool"}
                    </span>
                    <h4 className="text-sm font-bold text-foreground line-clamp-1">{g.name}</h4>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground uppercase font-bold">
                      <span>Spent: ₹{spent.toLocaleString("en-IN")}</span>
                      <span>Limit: {g.budget ? `₹${g.budget.toLocaleString("en-IN")}` : "None"}</span>
                    </div>
                    {g.budget ? (
                      <div className="w-full h-1.5 bg-muted border border-border/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${spent > g.budget ? "bg-destructive" : spent > g.budget * 0.7 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${ratio}%` }}
                        ></div>
                      </div>
                    ) : (
                      <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider italic mt-0.5">
                        No spending limit set
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => navigate("/groups/[id]", { id: g.id })}
                    variant="ghost"
                    className="w-full text-left text-xs h-7 justify-between font-bold px-0 text-muted-foreground hover:text-foreground cursor-pointer mt-1"
                  >
                    View Group Details
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">

          {/* Active groups + category analytics */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className={eyebrow}>Active groups</h3>
              <Button
                variant="link"
                size="sm"
                onClick={() => navigate("/groups")}
                className="h-auto cursor-pointer p-0 text-muted-foreground hover:text-foreground"
              >
                All groups
                <ArrowRight />
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <Card
                  key={group.id}
                  size="sm"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate("/groups/[id]", { id: group.id })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate("/groups/[id]", { id: group.id });
                    }
                  }}
                  className="group cursor-pointer outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CardContent className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex size-11 items-center justify-center rounded-lg bg-muted font-heading text-lg font-semibold uppercase">
                        {group.name[0]}
                      </div>
                      <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-semibold leading-tight transition-colors group-hover:text-primary">
                          {group.name}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="size-3.5" />
                            {group.members.length} members
                          </span>
                          <span aria-hidden>·</span>
                          <span className="font-mono">
                            Limit: {group.budget ? inr(group.budget) : "Unlimited"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Category distribution */}
            <Card>
              <CardHeader>
                <span className={eyebrow}>Category analytics</span>
                <CardTitle>Overall expense distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {categoryList.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No expenses logged yet. Add spends inside a group to see the breakdown here.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {categoryList.map((item) => {
                      const meta = catMeta(item.category);
                      const Icon = meta.icon;
                      const pct = totalSpent > 0 ? Math.round((item.amount / totalSpent) * 100) : 0;
                      return (
                        <div key={item.category} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 font-medium">
                              <Icon className="size-4 shrink-0 text-muted-foreground" />
                              {meta.label}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {inr(item.amount)} · {pct}%
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[var(--ease-standard)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI insights + settlement prompt */}
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4 text-primary" />
                  AI insights
                </CardTitle>
                <CardAction>
                  <Badge variant="secondary" className="font-mono">Live</Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                {loadingInsights ? (
                  <div className="flex flex-col gap-4" aria-label="Loading insights">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex flex-col gap-2">
                        <Skeleton className="h-3.5 w-1/2" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    ))}
                  </div>
                ) : aiInsights.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {aiInsights.map((insight, idx) => {
                      const Icon = INSIGHT_ICON[insight.type] || Sparkles;
                      return (
                        <div key={idx} className="flex gap-3 border-s-2 border-border ps-3">
                          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <div className="flex flex-col gap-0.5">
                            <h4 className="text-sm font-medium leading-tight">{insight.title}</h4>
                            <p className="text-sm leading-relaxed text-muted-foreground">{insight.message}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      {spendExpenses.length === 0
                        ? "Log some group expenses and the assistant will audit your spending patterns here."
                        : "No insights yet. Recalculate to run an audit on your logged spends."}
                    </p>
                    {spendExpenses.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadAInsights}
                        disabled={loadingInsights}
                        className="cursor-pointer"
                      >
                        <RefreshCw className={loadingInsights ? "animate-spin" : ""} />
                        Recalculate
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Alert className="transition-all duration-300 hover:-translate-y-1 hover:shadow-md py-2 px-3 text-xs">
              <Zap />
              <AlertTitle>Peer repayments simplified</AlertTitle>
              <AlertDescription>
                <p>
                  Connect your UPI address in settings. Friends repay you by scanning real-time BHIM QR codes inside
                  active group sheets.
                </p>
                <Button
                  id="view-payments-hero-btn"
                  variant="link"
                  size="sm"
                  onClick={() => navigate("/settlements")}
                  className="h-auto cursor-pointer p-0"
                >
                  Go to settlement center
                  <ArrowRight />
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">Quick Add Expense</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Directly split a bill with any registered user by their username.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddExpenseSubmit} className="flex flex-col gap-4 mt-2">
            {errorMsg && (
              <Alert variant="destructive" className="py-2.5 px-3">
                <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="friend-username" className="text-xs font-semibold">Friend's Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">@</span>
                <Input
                  id="friend-username"
                  placeholder="username"
                  value={friendUsername}
                  onChange={(e) => setFriendUsername(e.target.value)}
                  className="pl-7 text-xs h-9.5 rounded-xl border-border bg-card/50"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-title" className="text-xs font-semibold">Description</Label>
              <Input
                id="expense-title"
                placeholder="e.g., Lunch, Groceries, Movie"
                value={expenseTitle}
                onChange={(e) => setExpenseTitle(e.target.value)}
                className="text-xs h-9.5 rounded-xl border-border bg-card/50"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-amount" className="text-xs font-semibold">Amount (₹)</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="text-xs h-9.5 rounded-xl border-border bg-card/50"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="who-paid" className="text-xs font-semibold">Who Paid?</Label>
                <select
                  id="who-paid"
                  value={whoPaid}
                  onChange={(e: any) => setWhoPaid(e.target.value)}
                  className="text-xs h-9.5 px-3 rounded-xl border border-border bg-card/50 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="me">I paid</option>
                  <option value="friend">Friend paid</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="split-option" className="text-xs font-semibold">Splitting Option</Label>
              <select
                id="split-option"
                value={splitOption}
                onChange={(e: any) => setSplitOption(e.target.value)}
                className="text-xs h-9.5 px-3 rounded-xl border border-border bg-card/50 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="equal">Split Equally (50/50)</option>
                <option value="lend">I Paid (Friend owes full 100%)</option>
                <option value="borrow">Friend Paid (I owe full 100%)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAddExpense(false)}
                className="cursor-pointer text-xs rounded-xl h-9.5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="cursor-pointer text-xs rounded-xl h-9.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? "Splitting..." : "Log Split"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Metric tile — one card primitive, one layout, used for all three stats. */
const StatCard: React.FC<{
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  tone?: "default" | "destructive" | "success";
}> = ({ label, value, hint, icon: Icon, tone = "default" }) => (
  <Card className="p-4 flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
    </div>
    <div
      className={`text-2xl font-black tracking-tight leading-none tabular-nums ${tone === "destructive" ? "text-destructive" : tone === "success" ? "text-success" : "text-foreground"
        }`}
    >
      {value}
    </div>
    <p className="text-[10px] text-muted-foreground leading-normal">{hint}</p>
  </Card>
);
