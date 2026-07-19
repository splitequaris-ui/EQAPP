/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { dbSetDoc, dbAddDoc, dbDeleteDoc, dbUpdateDoc, dbGetDoc } from "../lib/firestoreQuery";
import { calculateBalances, generateSettlementSuggestions } from "../lib/settleEngine";
import { SettleProofModal } from "../components/SettleProofModal";
import QRCode from "qrcode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  Users, 
  Plus, 
  ArrowRight, 
  CheckCircle,
  FileText, 
  Activity as ActivityIcon,
  X,
  CreditCard,
  QrCode,
  Sparkles,
  Calendar,
  AlertCircle,
  Clock,
  Trash2,
  Lock
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faFileLines,
  faScaleBalanced,
  faLightbulb,
  faClock,
  faHome,
  faWallet
} from "@fortawesome/free-solid-svg-icons";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const GroupDetail: React.FC = () => {
  const { 
    user, 
    profile, 
    activeGroup, 
    activeGroupExpenses, 
    activeGroupSettlements, 
    activeGroupActivities, 
    navigate,
    refetchActiveGroupData,
    loadMoreExpenses,
    loadMoreActivities,
    hasMoreExpenses,
    hasMoreActivities
  } = useApp();

  const [activeTab, setActiveTab] = useState<"expenses" | "balances" | "suggest" | "timeline" | "roommate" | "budget">("expenses");

  // Roommate rent splitter states
  const [roommateRent, setRoommateRent] = useState("");
  const [roommateSizes, setRoommateSizes] = useState<Record<string, string>>({}); // uid -> sq ft
  const [calculatedRentShares, setCalculatedRentShares] = useState<Record<string, number>>({});
  
  // Roommate utilities states
  const [utilityAmount, setUtilityAmount] = useState("");
  const [utilityType, setUtilityType] = useState<"electricity" | "internet" | "water" | "groceries">("electricity");
  const [utilityPaidBy, setUtilityPaidBy] = useState("");

  // QR Code payment modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedRepayment, setSelectedRepayment] = useState<any>(null);
  const [customUpiId, setCustomUpiId] = useState("");
  const [proofFor, setProofFor] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // New expense form inline state
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expPaidBy, setExpPaidBy] = useState("");
  const [expCategory, setExpCategory] = useState("food");
  const [expDate, setExpDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [expNotes, setExpNotes] = useState("");
  const [expSplitType, setExpSplitType] = useState<"equal" | "percentage" | "exact">("equal");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({}); // uid -> custom amount
  
  // Group-specific AI insights state
  const [groupInsights, setGroupInsights] = useState<{ type: string; title: string; message: string }[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Member profile pictures state
  const [memberPhotos, setMemberPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchPhotos = async () => {
      if (!activeGroup?.members) return;
      const photos: Record<string, string> = {};
      for (const uid of activeGroup.members) {
        try {
          let userDoc = await dbGetDoc("users", uid);
          if (!userDoc || !userDoc.exists()) {
            userDoc = await dbGetDoc("profiles", uid);
          }
          if (userDoc?.exists()) {
            const data = userDoc.data();
            if (data?.photoURL) {
              photos[uid] = data.photoURL;
            }
          }
        } catch (err) {
          // Ignore fetch errors for individual users
        }
      }
      setMemberPhotos(photos);
    };
    fetchPhotos();
  }, [activeGroup?.members]);

  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // PDF statement generator trigger
  const handlePrintStatement = () => {
    window.print();
  };

  // Synchronize dynamic upi state and select first recipient
  useEffect(() => {
    if (activeGroup && !expPaidBy) {
      setExpPaidBy(user?.uid || "");
    }
  }, [activeGroup, user]);

  // Compute live local balances
  const liveBalances = activeGroup ? calculateBalances(activeGroup.members, activeGroupExpenses || []) : {};
  const liveSuggestions = activeGroup ? generateSettlementSuggestions(activeGroup.id, liveBalances) : [];

  // Compute stats: Total Spent sum inside activeGroupExpenses (filtering out settlements)
  const expensesOnly = (activeGroupExpenses || []).filter((e) => e.category !== "settlement");
  const overallActiveSpent = expensesOnly.reduce((sum, e) => sum + e.amount, 0);
  const budgetRatio = (activeGroup && activeGroup.budget) ? (overallActiveSpent / activeGroup.budget) * 100 : 0;

  // Resolve a recipient's real UPI id (own profile, or fetched from their user doc).
  const resolveRecipientUpi = async (recipientUid: string): Promise<string> => {
    if (recipientUid === user?.uid) return profile?.upiId || "";
    try {
      const snap = await dbGetDoc("users", recipientUid);
      return (snap && snap.exists() && snap.data()?.upiId) || "";
    } catch {
      return "";
    }
  };

  // UPI url helper generator — uses the manually-entered/resolved recipient VPA.
  const getUpiUrl = (recipientUid: string, amount: number) => {
    const upiId = customUpiId.trim();
    const name = activeGroup?.memberNames[recipientUid] || "GroupRepay";
    return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Settle on Dispute - ${activeGroup?.name || ""}`)}`;
  };

  const handleEndTripConfirmed = async () => {
    setShowEndConfirm(false);
    if (!activeGroup || !user || !profile) return;
    try {
      await dbUpdateDoc("groups", activeGroup.id, { status: "ended" });
      const activityId = `act_${Date.now()}`;
      await dbSetDoc(`groups/${activeGroup.id}/activities`, activityId, {
        id: activityId,
        groupId: activeGroup.id,
        category: "split_ended",
        message: `${profile.name} ended the split "${activeGroup.name}". Balances are closed.`,
        actorId: user.uid,
        createdAt: new Date().toISOString()
      });
      refetchActiveGroupData();
    } catch (err) {
      console.error("Failed to end the trip:", err);
    }
  };

  const handleDeleteGroupConfirmed = async () => {
    setShowDeleteConfirm(false);
    if (!activeGroup || !user) return;
    try {
      await dbDeleteDoc("groups", activeGroup.id);
      toast.success("Group deleted successfully");
      navigate("/groups");
    } catch (err) {
      console.error("Failed to delete group:", err);
      toast.error("Failed to delete group");
    }
  };

  const fetchGroupInsights = async () => {
    if (!activeGroup || expensesOnly.length === 0) return;
    setLoadingInsights(true);
    try {
      const token = await user?.getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/insights", {
        method: "POST",
        headers,
        body: JSON.stringify({
          expenses: expensesOnly.map(e => ({ title: e.title, amount: e.amount, category: e.category })),
          budget: activeGroup.budget || 0,
          memberNames: activeGroup.memberNames
        })
      });
      if (res.ok) {
        const data = await res.json();
        setGroupInsights(data);
      }
    } catch (err) {
      console.error("Failed to load group insights:", err);
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    if (activeGroup && expensesOnly.length > 0) {
      fetchGroupInsights();
    } else {
      setGroupInsights([]);
    }
  }, [activeGroup?.id, expensesOnly.length]);

  const handleCalculateRent = () => {
    const rentVal = parseFloat(roommateRent);
    if (isNaN(rentVal) || rentVal <= 0) return;

    let totalArea = 0;
    activeGroup?.members.forEach((m) => {
      totalArea += parseFloat(roommateSizes[m]) || 0;
    });

    if (totalArea <= 0) {
      const numMembers = activeGroup?.members.length || 1;
      const equalShare = Math.round((rentVal / numMembers) * 100) / 100;
      const shares: Record<string, number> = {};
      activeGroup?.members.forEach((m) => {
        shares[m] = equalShare;
      });
      setCalculatedRentShares(shares);
      return;
    }

    const shares: Record<string, number> = {};
    activeGroup?.members.forEach((m) => {
      const area = parseFloat(roommateSizes[m]) || 0;
      shares[m] = Math.round((rentVal * (area / totalArea)) * 100) / 100;
    });
    setCalculatedRentShares(shares);
  };

  const handleLogRentExpense = async () => {
    if (!activeGroup || !user || !profile) return;
    const rentVal = parseFloat(roommateRent);
    if (isNaN(rentVal) || rentVal <= 0) return;

    const sharesToLog = Object.keys(calculatedRentShares).length > 0 ? calculatedRentShares : (() => {
      const numMembers = activeGroup.members.length;
      const equalShare = Math.round((rentVal / numMembers) * 100) / 100;
      const shares: Record<string, number> = {};
      activeGroup.members.forEach((m) => {
        shares[m] = equalShare;
      });
      return shares;
    })();

    const splitsList = activeGroup.members.map((m) => ({
      uid: m,
      amount: sharesToLog[m] || 0
    }));

    const expenseId = `exp_${Date.now()}`;
    await dbSetDoc(`groups/${activeGroup.id}/expenses`, expenseId, {
      id: expenseId,
      groupId: activeGroup.id,
      title: "Rent Split",
      amount: rentVal,
      paidBy: user.uid,
      category: "rent",
      date: new Date().toISOString().substring(0, 10),
      notes: "Proportional rent split by room size",
      splitType: "custom",
      splits: splitsList,
      createdAt: new Date().toISOString()
    });

    const actId = `act_${Date.now()}`;
    await dbSetDoc(`groups/${activeGroup.id}/activities`, actId, {
      id: actId,
      groupId: activeGroup.id,
      category: "expense_added",
      message: `${profile.name} logged Rent expense of ₹${rentVal.toLocaleString("en-IN")} split proportionally.`,
      actorId: user.uid,
      createdAt: new Date().toISOString()
    });

    setRoommateRent("");
    setCalculatedRentShares({});
    setActiveTab("expenses");
  };

  const handleLogUtilityExpense = async () => {
    if (!activeGroup || !user || !profile) return;
    const utilVal = parseFloat(utilityAmount);
    if (isNaN(utilVal) || utilVal <= 0) return;

    const numMembers = activeGroup.members.length;
    const share = Math.round((utilVal / numMembers) * 100) / 100;
    const splitsList = activeGroup.members.map((m) => ({
      uid: m,
      amount: share
    }));

    const payer = utilityPaidBy || user.uid;
    const utilityLabels: Record<string, string> = {
      electricity: "Electricity Bill",
      internet: "WiFi & Internet",
      water: "Water Bill",
      groceries: "Groceries Split"
    };

    const expenseId = `exp_${Date.now()}`;
    await dbSetDoc(`groups/${activeGroup.id}/expenses`, expenseId, {
      id: expenseId,
      groupId: activeGroup.id,
      title: utilityLabels[utilityType] || "Utility Bill",
      amount: utilVal,
      paidBy: payer,
      category: utilityType === "groceries" ? "food" : "rent",
      date: new Date().toISOString().substring(0, 10),
      notes: `${utilityLabels[utilityType] || "Utility"} split equally`,
      splitType: "equal",
      splits: splitsList,
      createdAt: new Date().toISOString()
    });

    const payerName = activeGroup.memberNames[payer] || "Someone";
    const actId = `act_${Date.now()}`;
    await dbSetDoc(`groups/${activeGroup.id}/activities`, actId, {
      id: actId,
      groupId: activeGroup.id,
      category: "expense_added",
      message: `${payerName} logged ${utilityLabels[utilityType] || "Utility"} of ₹${utilVal.toLocaleString("en-IN")}.`,
      actorId: user.uid,
      createdAt: new Date().toISOString()
    });

    setUtilityAmount("");
    setActiveTab("expenses");
  };

  // Draw QR code whenever pay modal is opened and a UPI id is available
  useEffect(() => {
    if (showPayModal && selectedRepayment && customUpiId.trim() && canvasRef.current) {
      const recipientUid = selectedRepayment.toUid;
      const amount = selectedRepayment.amount;
      const url = getUpiUrl(recipientUid, amount);

      QRCode.toCanvas(
        canvasRef.current,
        url,
        {
          width: 220,
          margin: 1,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        },
        (error) => {
          if (error) console.error("Error drawing QR code to canvas:", error);
        }
      );
    }
  }, [showPayModal, selectedRepayment, customUpiId]);

  // Handle marking settlement as closed/settled (requires payment proof)
  const handleMarkSettled = async (repay: any, proof: { transactionId: string; proofImage: string }) => {
    if (!user || !activeGroup) return;

    // 1. Add settlement object to subcollection (with mandatory proof)
    const setRefId = `set_${Date.now()}`;
    await dbSetDoc(`groups/${activeGroup.id}/settlements`, setRefId, {
      id: setRefId,
      groupId: activeGroup.id,
      fromUid: repay.fromUid,
      toUid: repay.toUid,
      amount: repay.amount,
      status: "settled",
      createdAt: new Date().toISOString(),
      settledAt: new Date().toISOString(),
      transactionId: proof.transactionId,
      proofImage: proof.proofImage
    });

    // 2. Log activity
    const senderName = activeGroup.memberNames[repay.fromUid] || "Someone";
    const receiverName = activeGroup.memberNames[repay.toUid] || "Someone";
    const actId = `act_${Date.now()}`;
    await dbSetDoc(`groups/${activeGroup.id}/activities`, actId, {
      id: actId,
      groupId: activeGroup.id,
      category: "settlement_marked",
      message: `${senderName} settled ₹${repay.amount.toLocaleString("en-IN")} with ${receiverName}. (Ref: ${proof.transactionId})`,
      actorId: user.uid,
      createdAt: new Date().toISOString()
    });

    // 3. Subtract balances by dynamically adding a counter-balancing expense
    // We can model a "Settlement transaction" as a special category "settlement" expense to offset
    const expRefId = `exp_settle_${Date.now()}`;
    await dbSetDoc(`groups/${activeGroup.id}/expenses`, expRefId, {
      id: expRefId,
      groupId: activeGroup.id,
      title: `Settlement: ${senderName} ➜ ${receiverName}`,
      amount: repay.amount,
      paidBy: repay.fromUid,
      category: "settlement",
      date: new Date().toISOString().substring(0, 10),
      splitType: "exact",
      splits: [
        { uid: repay.toUid, amount: repay.amount }
      ],
      createdAt: new Date().toISOString()
    });

    setShowPayModal(false);
    setSelectedRepayment(null);
    refetchActiveGroupData();
  };

  // Submit standard / manual expense creation
  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !user || !expTitle.trim() || !expAmount) return;

    try {
      const expenseId = `exp_${Date.now()}`;
      const amountVal = Number(expAmount);

      // Construct splits list according to chosen splitType
      let splitsList: any[] = [];
      const numMembers = activeGroup.members.length;

      if (expSplitType === "equal") {
        const share = Math.round((amountVal / numMembers) * 100) / 100;
        splitsList = activeGroup.members.map((m) => ({
          uid: m,
          amount: share
        }));
      } else {
        // Fallback for custom entries
        splitsList = activeGroup.members.map((m) => ({
          uid: m,
          amount: Number(customSplits[m]) || 0
        }));
      }

      const expensePayload = {
        id: expenseId,
        groupId: activeGroup.id,
        title: expTitle,
        amount: amountVal,
        paidBy: expPaidBy,
        category: expCategory,
        date: expDate,
        notes: expNotes,
        splitType: expSplitType,
        splits: splitsList,
        createdAt: new Date().toISOString()
      };

      await dbSetDoc(`groups/${activeGroup.id}/expenses`, expenseId, expensePayload);

      // Log activity
      const payerName = activeGroup.memberNames[expPaidBy] || "Someone";
      const actId = `act_${Date.now()}`;
      await dbSetDoc(`groups/${activeGroup.id}/activities`, actId, {
        id: actId,
        groupId: activeGroup.id,
        category: "expense_added",
        message: `${payerName} added "${expTitle}" (₹${amountVal.toLocaleString("en-IN")}).`,
        actorId: user.uid,
        createdAt: new Date().toISOString()
      });

      // Clear form
      setExpTitle("");
      setExpAmount("");
      setExpNotes("");
      setShowAddExpense(false);
      refetchActiveGroupData();
    } catch (err) {
      console.error("Failed to save expense:", err);
    }
  };

  const handleDeleteExpense = async (expId: string) => {
    if (!activeGroup) return;
    try {
      await dbDeleteDoc(`groups/${activeGroup.id}/expenses`, expId);
      refetchActiveGroupData();
    } catch (err) {
      console.error("Deletion error:", err);
    }
  };

  if (!activeGroup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs text-gray-500 font-mono">Loading Dispute Pool details...</span>
      </div>
    );
  }

  const memberNames = activeGroup.memberNames || {};



  return (
    <div className="w-full max-w-7xl mx-auto px-6 sm:px-12 py-10 flex flex-col gap-10">
      
      {/* Editorial Group Header Banner */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => navigate("/groups")}
            className="text-xs font-mono font-bold tracking-widest text-muted-foreground uppercase hover:text-primary hover:underline cursor-pointer flex items-center gap-1 transition-colors"
          >
            ❮ All Groups
          </button>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <h1 className="font-sans font-black text-3xl md:text-4xl tracking-tight text-foreground leading-tight">
                {activeGroup.name}
              </h1>
              {activeGroup.status === "ended" ? (
                <span className="text-[10px] px-2.5 py-1 bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 rounded-full font-bold uppercase font-mono tracking-wider">Ended</span>
              ) : (
                <span className="text-[10px] px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded-full font-bold uppercase font-mono tracking-wider">Active</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              {activeGroup.description || "Track shared group bills and peer settled accounts cleanly."}
            </p>
            <div className="mt-1 flex gap-2">
              {activeGroup.status !== "ended" && (
                <button 
                  onClick={() => setShowEndConfirm(true)} 
                  className="border border-red-200 hover:border-red-350 text-red-600 hover:bg-red-50/10 cursor-pointer text-[10px] h-7 px-2.5 rounded-lg font-bold font-mono tracking-wider uppercase bg-transparent transition-colors"
                >
                  End Split
                </button>
              )}
              <button 
                onClick={() => setShowDeleteConfirm(true)} 
                className="bg-red-600 text-white hover:bg-red-700 cursor-pointer text-[10px] h-7 px-3 rounded-lg font-bold font-mono tracking-wider uppercase transition-colors"
              >
                Delete Group
              </button>
            </div>
          </div>
        </div>

        {/* Members avatars bar & budget remaining */}
        <div className="flex flex-col sm:flex-row md:flex-col gap-4 min-w-[240px] w-full md:w-auto shrink-0 bg-background/40 border border-border/50 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase font-mono tracking-wider">Members ({activeGroup.members.length})</span>
            <div className="flex -space-x-1.5 overflow-hidden">
              {activeGroup.members.map((memberId) => (
                <div 
                  key={memberId} 
                  title={memberNames[memberId]}
                  className="w-7.5 h-7.5 rounded-full border border-background bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shadow-3xs overflow-hidden"
                >
                  {memberPhotos[memberId] ? (
                    <img src={memberPhotos[memberId]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    memberNames[memberId]?.[0] || "M"
                  )}
                </div>
              ))}
            </div>
          </div>

          {activeGroup.budget && (
            <div className="flex flex-col gap-2 border-t border-border/40 pt-3 sm:border-t-0 sm:pt-0 md:border-t md:pt-3 flex-1">
              <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Budget Spent: {Math.round(budgetRatio)}%</span>
                <span className={budgetRatio > 100 ? "text-destructive font-bold" : "text-foreground"}>
                  ₹{overallActiveSpent.toLocaleString("en-IN")} / ₹{activeGroup.budget.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden border border-border/50">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${budgetRatio > 100 ? "bg-destructive" : budgetRatio > 70 ? "bg-amber-500" : "bg-success"}`} 
                  style={{ width: `${Math.min(100, budgetRatio)}%` }}
                ></div>
              </div>
              {budgetRatio > 100 && (
                <span className="text-[9px] font-mono font-bold text-destructive uppercase tracking-widest mt-0.5 animate-pulse text-right">
                  ⚠️ Over Budget Limit
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Group Detail Mini Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-1.5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Group Total Spend</span>
          <div className="text-2xl font-semibold tracking-tight text-foreground">
            ₹{overallActiveSpent.toLocaleString("en-IN")}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-1.5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">You Owe</span>
          <div className="text-2xl font-semibold tracking-tight text-destructive">
            {(liveBalances[user?.uid || ""] || 0) < -0.01 
              ? `₹${Math.abs(Math.round(liveBalances[user?.uid || ""] || 0)).toLocaleString("en-IN")}` 
              : "₹0"}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-1.5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Owed to You</span>
          <div className="text-2xl font-semibold tracking-tight text-emerald-600">
            {(liveBalances[user?.uid || ""] || 0) > 0.01 
              ? `₹${Math.round(liveBalances[user?.uid || ""] || 0).toLocaleString("en-IN")}` 
              : "₹0"}
          </div>
        </div>
      </div>

      {/* Group Specific AI Insights Panel */}
      {groupInsights.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-3 shadow-xs">
          <h3 className="font-heading text-sm font-semibold tracking-tight flex items-center gap-1.5 text-primary">
            AI Group Insights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-1">
            {groupInsights.map((insight, idx) => (
              <div key={idx} className="bg-background/40 border border-border/50 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[9px] font-mono font-bold text-muted-foreground uppercase tracking-wider">{insight.title}</span>
                <p className="text-xs text-foreground leading-relaxed">{insight.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-gray-100 pb-px overflow-x-auto whitespace-nowrap">
        {[
          { key: "expenses", label: "Group Expenses Logs", count: expensesOnly.length, faIcon: faFileLines },
          { key: "balances", label: "Peers Balances", count: null, faIcon: faScaleBalanced },
          { key: "suggest", label: "Smart Settlement Recommendations", count: liveSuggestions.length, faIcon: faLightbulb },
          { key: "budget", label: "Budget & Limits", count: null, faIcon: faWallet },
          ...(activeGroup.category === "roommates" ? [{ key: "roommate", label: "Rent & Utilities Splitter", count: null, faIcon: faHome }] : []),
          { key: "timeline", label: "Activity Audit Log", count: activeGroupActivities.length, faIcon: faClock }
        ].map((tab) => (
          <button
            key={tab.key}
            id={`tab-link-${tab.key}`}
            className={`py-3 px-4.5 text-xs font-semibold cursor-pointer border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === tab.key
                ? "border-black text-black font-bold"
                : "border-transparent text-gray-400 hover:text-black"
            }`}
            onClick={() => setActiveTab(tab.key as any)}
          >
            <FontAwesomeIcon icon={tab.faIcon} className={`text-[10px] ${activeTab === tab.key ? "text-black" : "text-gray-400"}`} />
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600 font-mono">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main tab content screen router */}
      <div className="min-h-[40vh]">
        
        {/* TAB 1: Expenses Log list */}
        {activeTab === "expenses" && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h3 className="font-sans font-bold text-gray-900 text-lg">Logged Transactions</h3>
              <div className="flex items-center gap-2">
                <button
                  id="print-statement-btn"
                  onClick={handlePrintStatement}
                  className="flex items-center gap-1.5 text-xs font-bold py-2 px-3.5 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-lg cursor-pointer bg-white"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Print Statement
                </button>
                <button
                  id="toggle-add-expense-btn"
                  onClick={() => setShowAddExpense(!showAddExpense)}
                  className="flex items-center gap-1.5 text-xs font-bold py-2 px-4 bg-black text-white hover:bg-gray-800 rounded-lg cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Bill
                </button>
              </div>
            </div>

            {/* Slide-down add manual expense container form */}
            {showAddExpense && (
              <div className="mx-auto w-full bg-white border border-gray-200 rounded-xl p-5 sm:p-6 shadow-3xs flex flex-col gap-5 md:max-w-2xl">
                <h4 className="text-sm font-black text-gray-900 flex items-center justify-between">
                  <span>Logged Expense Information</span>
                  <button 
                    onClick={() => setShowAddExpense(false)}
                    className="p-1 rounded-md text-gray-400 hover:text-black cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </h4>
                

                <form onSubmit={handleAddExpenseSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-bold text-gray-500">Bill Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Scuba tickets, Thalassa Dinner, Fuel"
                      value={expTitle}
                      onChange={(e) => setExpTitle(e.target.value)}
                      className="py-2 px-3 border border-gray-200 rounded-lg focus:border-black outline-hidden text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-bold text-gray-500">Total Bill Amount (INR)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                      <input
                        type="number"
                        required
                        placeholder="0.00"
                        value={expAmount}
                        onChange={(e) => setExpAmount(e.target.value)}
                        className="w-full py-2 pl-7 pr-3 border border-gray-200 rounded-lg focus:border-black outline-hidden text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-bold text-gray-500">Paid By</label>
                    <select
                      value={expPaidBy}
                      onChange={(e) => setExpPaidBy(e.target.value)}
                      className="py-2 px-2.5 border border-gray-200 rounded-lg focus:border-black outline-hidden bg-white text-xs h-9"
                    >
                      {activeGroup.members.map((m) => (
                        <option key={m} value={m}>{activeGroup.memberNames[m] || "Member"}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-bold text-gray-500">Expense Category</label>
                    <select
                      value={expCategory}
                      onChange={(e) => setExpCategory(e.target.value)}
                      className="py-2 px-2.5 border border-gray-200 rounded-lg focus:border-black outline-hidden bg-white text-xs h-9"
                    >
                      <option value="food">Food & Dining</option>
                      <option value="rent">Rent / Accommodations</option>
                      <option value="travel">Transport & Fuel</option>
                      <option value="entertainment">Activities / Tickets</option>
                      <option value="others">Others / Sundry bills</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-bold text-gray-500">Transaction Date</label>
                    <input
                      type="date"
                      required
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className="py-1.5 px-3 border border-gray-200 rounded-lg focus:border-black outline-hidden text-xs h-9"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-bold text-gray-500">Optional Notes</label>
                    <input
                      type="text"
                      placeholder="Extra trip remarks"
                      value={expNotes}
                      onChange={(e) => setExpNotes(e.target.value)}
                      className="py-2 px-3 border border-gray-200 rounded-lg focus:border-black outline-hidden text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2 border-t border-gray-100 pt-3 flex justify-between items-center text-xs">
                    <span className="font-bold text-gray-600">Splitting Configuration:</span>
                    <span className="font-mono text-[10px] text-[#9CA3AF] uppercase">Defaulting to Equal Division</span>
                  </div>

                  <button
                    type="submit"
                    className="sm:col-span-2 py-2.5 bg-black text-white hover:bg-gray-800 font-semibold rounded-lg text-xs cursor-pointer shadow-3xs"
                  >
                    Commit Bill to Ledger
                  </button>
                </form>
              </div>
            )}

            {/* Expenses Grid List */}
            <div className="flex flex-col gap-4">
              {expensesOnly.map((exp) => {
                const payerName = activeGroup.memberNames[exp.paidBy] || "Someone";
                const isConfirming = confirmingDeleteId === exp.id;
                return (
                  <div
                    key={exp.id}
                    className={`bg-white border rounded-xl p-5 flex items-center justify-between group shadow-3xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${isConfirming ? 'border-red-300 bg-red-50/50' : 'border-gray-150 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar initials category mapping */}
                      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center text-base ${isConfirming ? 'bg-red-100 border-red-200 text-red-600' : 'bg-gray-50 border-gray-100'}`}>
                        {exp.category === "food" && "F"}
                        {exp.category === "rent" && "R"}
                        {exp.category === "travel" && "T"}
                        {exp.category === "entertainment" && "E"}
                        {exp.category === "others" && "O"}
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <h4 className={`text-sm font-bold ${isConfirming ? 'text-red-900' : 'text-gray-900'}`}>{exp.title}</h4>
                        <p className={`text-[11px] font-medium ${isConfirming ? 'text-red-700/70' : 'text-gray-500'}`}>
                          Paid by <strong className={isConfirming ? 'text-red-800' : 'text-gray-700'}>{payerName}</strong> • {exp.date}
                        </p>
                        {exp.notes && (
                          <p className={`text-[10px] font-mono leading-none mt-0.5 ${isConfirming ? 'text-red-600/60' : 'text-[#A3A3A3]'}`}>
                            "{exp.notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-end">
                        <span className={`text-sm font-black font-mono ${isConfirming ? 'text-red-900' : 'text-gray-900'}`}>₹{exp.amount.toLocaleString("en-IN")}</span>
                        <span className={`text-[10px] ${isConfirming ? 'text-red-700/60' : 'text-gray-400'}`}>Total bill</span>
                      </div>
                      
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                           <button onClick={() => setConfirmingDeleteId(null)} className="text-[10px] font-bold text-red-500 hover:text-red-800 uppercase tracking-wider cursor-pointer">Cancel</button>
                           <button onClick={() => {
                               handleDeleteExpense(exp.id);
                               setConfirmingDeleteId(null);
                             }} className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm cursor-pointer">Delete</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingDeleteId(exp.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-all cursor-pointer"
                          title="Delete expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {hasMoreExpenses && (
                <div className="flex justify-center mt-2">
                  <button
                    onClick={loadMoreExpenses}
                    className="px-6 py-2.5 bg-secondary text-primary hover:bg-accent font-medium rounded-xl text-xs cursor-pointer transition-colors shadow-3xs"
                  >
                    Load Older Expenses
                  </button>
                </div>
              )}

              {expensesOnly.length === 0 && (
                <div className="border border-dashed border-gray-150 rounded-xl p-10 text-center text-gray-400 text-xs">
                  No purchase records logged to this pool yet. Add your first expense to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Balances ledger */}
        {activeTab === "balances" && (
          <div className="flex flex-col gap-6 max-w-xl">
            <div className="flex flex-col gap-1">
              <h3 className="font-sans font-bold text-gray-900 text-lg">Balances ledger</h3>
              <p className="text-xs text-gray-500">Each member's aggregate paid offset minus their expected split owes.</p>
            </div>

            <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden shadow-2xs divide-y divide-gray-100">
              {activeGroup.members.map((memberId) => {
                const bal = liveBalances[memberId] || 0;
                const isCredited = bal > 0.01;
                const isDebited = bal < -0.01;
                return (
                  <div key={memberId} className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8.5 h-8.5 rounded-full bg-gray-50 border border-gray-150 flex items-center justify-center font-bold text-xs text-gray-800 overflow-hidden shrink-0">
                        {memberPhotos[memberId] ? (
                          <img src={memberPhotos[memberId]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          memberNames[memberId]?.[0] || "U"
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-900">{memberNames[memberId] || "Member"}</span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {memberId === user?.uid ? "You (active user)" : "Participant"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className={`text-xs font-black font-mono ${isCredited ? "text-emerald-600" : isDebited ? "text-red-500" : "text-gray-400"}`}>
                        {isCredited ? `Gets back ₹${bal.toLocaleString("en-IN")}` : isDebited ? `Owes ₹${Math.abs(bal).toLocaleString("en-IN")}` : "Fully Settled"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: Smart Settlement Suggestions */}
        {activeTab === "suggest" && (
          <div className="flex flex-col gap-6 max-w-2xl">
            <div className="flex flex-col gap-1 bg-gray-50/50 border border-gray-100 rounded-xl p-5 mb-1">
              <h4 className="text-xs font-mono font-bold tracking-widest text-[#9CA3AF] uppercase flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                Dispute Settle Algorithm
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Our smart net balance optimizer computes the exact peer-to-peer combinations to completely zero out everyone's group debt in the **mathematically minimum transactions possible**. Settle up instantly using our India-ready deep UPI codes.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {liveSuggestions.map((repay, idx) => {
                const senderName = activeGroup.memberNames[repay.fromUid] || "Someone";
                const receiverName = activeGroup.memberNames[repay.toUid] || "Someone";
                const isMyDebt = repay.fromUid === user?.uid;

                return (
                  <div
                    key={idx}
                    className={`bg-white border rounded-xl p-5 flex sm:flex-row flex-col sm:items-center justify-between gap-4 shadow-3xs hover:border-gray-300 transition-colors ${isMyDebt ? "border-amber-200 bg-amber-50/10" : "border-gray-150"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-gray-800">
                        ⚡
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          {senderName}
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          {receiverName}
                        </span>
                        <p className="text-[10px] text-gray-400 leading-none">
                          {isMyDebt ? "Your recommended payment" : "Suggested peer reimbursement"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 justify-between sm:justify-start">
                      <span className="text-sm font-black text-gray-900 font-mono">₹{repay.amount.toLocaleString("en-IN")}</span>
                      
                      <div className="flex items-center gap-2">
                        <button
                          id={`pay-modal-trigger-${idx}`}
                          onClick={async () => {
                            setSelectedRepayment(repay);
                            setShowPayModal(true);
                            setCustomUpiId(await resolveRecipientUpi(repay.toUid));
                          }}
                          className="text-[11px] font-bold py-1.5 px-3 bg-white border border-gray-200.90 hover:border-black text-gray-800 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          View QR
                        </button>

                        <button
                          id={`settle-direct-${idx}`}
                          onClick={() => setProofFor(repay)}
                          className="text-[11px] font-semibold py-1.5 px-3 bg-black hover:bg-gray-800 text-white rounded-lg cursor-pointer transition-colors"
                        >
                          Mark Settled
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {liveSuggestions.length === 0 && (
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-6 text-center text-emerald-800 text-xs flex flex-col gap-1.5 items-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="font-bold">No outstanding group debts!</span>
                  <span>Everyone is fully settled up! Ready to travel more.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB ROOMMATE: Rent & Utility Splitter */}
        {activeTab === "roommate" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Rent Splitter Panel */}
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5 shadow-sm">
              <div>
                <h3 className="font-sans font-bold text-gray-900 text-lg flex items-center gap-2">
                  🏠 Roommate Rent Splitter
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Split rent proportionally based on individual room size (square footage) or custom weight ratios.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t border-border/40 pt-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="roommate-rent" className="text-xs font-semibold">Total Rent Amount (₹)</Label>
                  <Input
                    id="roommate-rent"
                    type="number"
                    placeholder="e.g. 45000"
                    value={roommateRent}
                    onChange={(e) => setRoommateRent(e.target.value)}
                    className="text-xs h-9.5 rounded-xl border-border bg-background/50"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold">Room Size / Area (sq ft)</span>
                  {activeGroup.members.map((m) => (
                    <div key={m} className="flex items-center justify-between gap-4">
                      <span className="text-xs text-gray-700 font-medium">{activeGroup.memberNames[m] || "Roommate"}</span>
                      <div className="relative w-32">
                        <Input
                          type="number"
                          placeholder="sq ft"
                          value={roommateSizes[m] || ""}
                          onChange={(e) => setRoommateSizes({ ...roommateSizes, [m]: e.target.value })}
                          className="text-xs h-8 pr-10 rounded-lg border-border bg-background/50 text-right"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 font-mono">sqft</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={handleCalculateRent}
                    className="flex-1 text-xs h-9 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl"
                  >
                    Calculate Split
                  </Button>
                </div>

                {Object.keys(calculatedRentShares).length > 0 && (
                  <div className="bg-background/60 border border-border/50 rounded-xl p-4 flex flex-col gap-3 mt-2">
                    <span className="text-xs font-bold text-gray-900">Computed Shares:</span>
                    <div className="flex flex-col gap-1.5 text-xs">
                      {activeGroup.members.map((m) => (
                        <div key={m} className="flex justify-between font-mono">
                          <span>{activeGroup.memberNames[m] || "Roommate"}:</span>
                          <span className="font-bold">₹{calculatedRentShares[m]?.toLocaleString("en-IN")}</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={handleLogRentExpense}
                      variant="outline"
                      className="mt-2 text-xs h-8 border-primary/30 text-primary hover:bg-primary/5 rounded-lg"
                    >
                      Log Rent as Group Expense
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Utility Quick Splitter Panel */}
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5 shadow-sm">
              <div>
                <h3 className="font-sans font-bold text-gray-900 text-lg flex items-center gap-2">
                  Utility Quick Splitter
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Log monthly utilities (Electricity, Internet, Water, Groceries) divided equally with one click.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t border-border/40 pt-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="utility-type" className="text-xs font-semibold">Utility Bill Type</Label>
                  <select
                    id="utility-type"
                    value={utilityType}
                    onChange={(e: any) => setUtilityType(e.target.value)}
                    className="text-xs h-9.5 px-3 rounded-xl border border-border bg-background/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="electricity">Electricity Bill</option>
                    <option value="internet">WiFi & Internet</option>
                    <option value="water">Water Bill</option>
                    <option value="groceries">Groceries Split</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="utility-amount" className="text-xs font-semibold">Bill Amount (₹)</Label>
                  <Input
                    id="utility-amount"
                    type="number"
                    placeholder="0.00"
                    value={utilityAmount}
                    onChange={(e) => setUtilityAmount(e.target.value)}
                    className="text-xs h-9.5 rounded-xl border-border bg-background/50"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="utility-payer" className="text-xs font-semibold">Who Paid the Bill?</Label>
                  <select
                    id="utility-payer"
                    value={utilityPaidBy}
                    onChange={(e) => setUtilityPaidBy(e.target.value)}
                    className="text-xs h-9.5 px-3 rounded-xl border border-border bg-background/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Choose Payer...</option>
                    {activeGroup.members.map((m) => (
                      <option key={m} value={m}>{activeGroup.memberNames[m] || "Roommate"}</option>
                    ))}
                  </select>
                </div>

                <Button
                  onClick={handleLogUtilityExpense}
                  disabled={!utilityAmount || parseFloat(utilityAmount) <= 0}
                  className="mt-2 text-xs h-9 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl disabled:opacity-40"
                >
                  Log Split Equally
                </Button>
              </div>
            </div>
            
          </div>
        )}

        {/* TAB 5: Activity Feed timeline */}
        {activeTab === "timeline" && (
          <div className="flex flex-col gap-6 max-w-xl">
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-5 h-5 text-gray-800" />
              <h3 className="font-sans font-bold text-gray-900 text-lg">Group Transaction Timeline</h3>
            </div>

            <div className="relative border-l border-gray-100 ml-4.5 pl-6 flex flex-col gap-6 text-xs">
              {activeGroupActivities.map((act) => (
                <div key={act.id} className="relative">
                  {/* Dot symbol */}
                  <div className="absolute -left-10 top-1.5 w-8 h-8 rounded-full bg-white border border-gray-150 flex items-center justify-center font-bold text-base shadow-3xs">
                    {act.category === "group_created" && "G"}
                    {act.category === "expense_added" && "+"}
                    {act.category === "settlement_marked" && "S"}
                  </div>
                  <div className="flex flex-col gap-1 pl-1">
                    <p className="text-gray-800 font-medium leading-relaxed">{act.message}</p>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {new Date(act.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}

              {hasMoreActivities && (
                <div className="flex justify-start pl-1 mt-2">
                  <button
                    onClick={loadMoreActivities}
                    className="px-6 py-2 bg-secondary text-primary hover:bg-accent font-medium rounded-xl text-[11px] cursor-pointer transition-colors shadow-3xs"
                  >
                    Load More Activity
                  </button>
                </div>
              )}

              {activeGroupActivities.length === 0 && (
                <div className="text-gray-400 italic py-6">No audits captured yet. Log a transaction to see changes!</div>
              )}
            </div>
          </div>
        )}

        {/* TAB 7: Budget & Limits */}
        {activeTab === "budget" && (
          <div className="flex flex-col gap-6 text-left">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-800" />
                <h3 className="font-sans font-bold text-gray-900 text-lg">Context Budget & Limits</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Budget Progress Card */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
                <div className="p-5 pb-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider font-mono text-muted-foreground">Limit vs Actual Spend</h4>
                </div>
                <div className="px-5 pb-5 flex flex-col gap-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span>Total Spent: ₹{overallActiveSpent.toLocaleString("en-IN")}</span>
                      <span>
                        Limit: {activeGroup.budgetConfig?.totalCap ? `₹${activeGroup.budgetConfig.totalCap.toLocaleString("en-IN")}` : activeGroup.budget ? `₹${activeGroup.budget.toLocaleString("en-IN")}` : "No Limit"}
                      </span>
                    </div>

                    {(activeGroup.budgetConfig?.totalCap || activeGroup.budget) ? (
                      <div>
                        <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ease-out ${
                              budgetRatio >= 100 
                                ? "bg-destructive" 
                                : budgetRatio >= 80 
                                ? "bg-amber-500" 
                                : "bg-success"
                            }`}
                            style={{ width: `${Math.min(budgetRatio, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground mt-1 block">
                          {Math.round(budgetRatio)}% of budget limit spent
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Set a budget limit to track progress bars and receive notifications.</p>
                    )}
                  </div>

                  {activeGroup.type === "trip" && activeGroup.budgetConfig?.perDayCap && (
                    <div className="border-t border-border pt-4">
                      <span className="font-mono text-[10px] text-muted-foreground uppercase font-bold">Daily Burn Rate Cap</span>
                      <p className="text-sm font-semibold mt-1">₹{activeGroup.budgetConfig.perDayCap.toLocaleString("en-IN")} / day Limit</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Update Budget Configuration Form */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
                <div className="p-5 pb-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider font-mono text-muted-foreground">Configure Budget</h4>
                </div>
                <div className="px-5 pb-5">
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const totalLimit = (form.elements.namedItem("totalLimit") as HTMLInputElement).value ? Number((form.elements.namedItem("totalLimit") as HTMLInputElement).value) : null;
                      const dailyCap = (form.elements.namedItem("dailyCap") as HTMLInputElement)?.value ? Number((form.elements.namedItem("dailyCap") as HTMLInputElement).value) : null;

                      try {
                        const updatedConfig = {
                          ...(activeGroup.budgetConfig || {}),
                          totalCap: totalLimit,
                          perDayCap: dailyCap
                        };

                        await dbUpdateDoc("groups", activeGroup.id, {
                          budget: totalLimit,
                          budgetConfig: updatedConfig
                        });
                        
                        // Log activity (non-blocking)
                        try {
                          const actId = `act_${Date.now()}`;
                          await dbSetDoc(`groups/${activeGroup.id}/activities`, actId, {
                            id: actId,
                            groupId: activeGroup.id,
                            category: "budget_changed",
                            message: `${profile?.name || "Someone"} updated the budget cap to ₹${totalLimit ? totalLimit.toLocaleString("en-IN") : "Unlimited"}.`,
                            actorId: user?.uid || "",
                            createdAt: new Date().toISOString()
                          });
                        } catch (actErr) {
                          console.warn("Activity log failed (non-critical):", actErr);
                        }

                        toast.success("Budget updated successfully!");
                        refetchActiveGroupData();
                      } catch (err) {
                        console.error(err);
                        toast.error("Failed to update budget");
                      }
                    }}
                    className="flex flex-col gap-4 text-xs"
                  >
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="totalLimit" className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Total Budget Cap (₹)</label>
                      <input 
                        id="totalLimit" 
                        name="totalLimit"
                        type="number" 
                        defaultValue={activeGroup.budgetConfig?.totalCap || activeGroup.budget || ""} 
                        placeholder="e.g. 50000"
                        className="w-full text-xs py-2.5 px-3 rounded-xl border border-slate-200 focus:outline-none bg-slate-50 focus:border-black text-slate-800 transition-all"
                      />
                    </div>

                    {activeGroup.type === "trip" && (
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="dailyCap" className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Daily Pacing Limit (₹)</label>
                        <input 
                          id="dailyCap" 
                          name="dailyCap"
                          type="number" 
                          defaultValue={activeGroup.budgetConfig?.perDayCap || ""} 
                          placeholder="e.g. 5000"
                          className="w-full text-xs py-2.5 px-3 rounded-xl border border-slate-200 focus:outline-none bg-slate-50 focus:border-black text-slate-800 transition-all"
                        />
                      </div>
                    )}

                    <button type="submit" className="w-full mt-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold font-mono uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer">Save Configuration</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Dynamic QR Code Repay popup modal */}
      {showPayModal && selectedRepayment && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm p-6 flex flex-col items-center gap-5 shadow-xl">
            
            <div className="w-full flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-xs font-bold text-gray-800">Scan BHIM UPI repricement</span>
              <button
                id="close-pay-modal"
                onClick={() => {
                  setShowPayModal(false);
                  setSelectedRepayment(null);
                  setCustomUpiId("");
                }}
                className="text-gray-500 hover:text-black hover:bg-gray-50 p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Display names */}
            <div className="text-center flex flex-col gap-0.5">
              <span className="text-[11px] font-mono tracking-widest text-[#9CA3AF] uppercase">repay instantly</span>
              <h4 className="text-sm font-black text-gray-900 flex items-center justify-center gap-1">
                {activeGroup.memberNames[selectedRepayment.fromUid]}
                <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                {activeGroup.memberNames[selectedRepayment.toUid]}
              </h4>
              <h2 className="text-2xl font-black text-gray-900 font-mono mt-1">
                ₹{selectedRepayment.amount.toLocaleString("en-IN")}
              </h2>
            </div>

            {/* The dynamic Canvas QR drawer — shown only when a UPI id is set */}
            {customUpiId.trim() ? (
              <>
                <div className="p-3.5 bg-[#fafafa] border border-gray-150 rounded-xl max-w-[240px] max-h-[240px]">
                  <canvas ref={canvasRef} className="rounded-lg shadow-3xs"></canvas>
                </div>
                <p className="text-[10px] text-gray-400 leading-normal text-center max-w-[250px]">
                  Scan with GPay, PhonePe, Paytm, or any banking app. Once completed, tap below to balance the accounting ledger.
                </p>
              </>
            ) : (
              <div className="w-full p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                  {activeGroup.memberNames[selectedRepayment.toUid]} hasn't set a UPI ID. Enter one below to generate a payment QR, or just mark the settlement as paid.
                </p>
              </div>
            )}

            {/* Customize UPI VPA fields */}
            <div className="w-full flex flex-col gap-1">
              <label className="text-[10px] font-mono text-gray-550">Recipient UPI Id:</label>
              <input
                type="text"
                placeholder="friend@upi"
                value={customUpiId}
                onChange={(e) => setCustomUpiId(e.target.value)}
                className="w-full text-xs py-1.5 px-2 border border-gray-200 focus:border-black outline-hidden rounded-md font-mono"
              />
            </div>

            <div className="w-full grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={!customUpiId.trim()}
                onClick={() => {
                  const url = getUpiUrl(selectedRepayment.toUid, selectedRepayment.amount);
                  window.location.href = url;
                }}
                className="py-2.5 bg-white border border-gray-200.90 hover:border-black text-gray-800 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Launch UPI app
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = selectedRepayment;
                  setShowPayModal(false);
                  setProofFor(target);
                }}
                className="py-2.5 bg-black hover:bg-gray-850 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Mark as Settled
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Mandatory payment-proof capture before a settlement is recorded */}
      <SettleProofModal
        repay={
          proofFor && activeGroup
            ? {
                fromName: activeGroup.memberNames[proofFor.fromUid] || "Member",
                toName: activeGroup.memberNames[proofFor.toUid] || "Member",
                amount: proofFor.amount,
                groupName: activeGroup.name
              }
            : null
        }
        onClose={() => setProofFor(null)}
        onConfirm={async (proof) => {
          await handleMarkSettled(proofFor, proof);
          setProofFor(null);
        }}
      />

      {/* END SPLIT CONFIRMATION ALERT DIALOG */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>End this split permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All active balances will be locked and this group will be stored as archived/ended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default" className="cursor-pointer rounded-xl text-xs h-9.5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndTripConfirmed}
              className="cursor-pointer rounded-xl text-xs h-9.5 bg-destructive text-white hover:bg-destructive/90"
            >
              End Split
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE GROUP CONFIRMATION ALERT DIALOG */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this group permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This group, along with all its expenses, settlements, and activity logs, will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default" className="cursor-pointer rounded-xl text-xs h-9.5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroupConfirmed}
              className="cursor-pointer rounded-xl text-xs h-9.5 bg-destructive text-white hover:bg-destructive/90"
            >
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};
