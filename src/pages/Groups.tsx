/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { db } from "../lib/firebase";
import { collection, getDocs, doc } from "firebase/firestore";
import { dbSetDoc, dbDeleteDoc, dbGetDoc, dbGetDocsInBatches } from "../lib/firestoreQuery";
import { toast } from "sonner";
import {
  Users,
  Plus,
  X,
  Tag,
  IndianRupee,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  PlusCircle,
  FolderOpen,
  Info,
  Loader2,
  Check,
  Plane,
  Home as HomeIcon,
  GraduationCap,
  Rocket,
  Trash2,
} from "lucide-react";

const CONTEXT_PRESETS = {
  trip: {
    label: "Trip",
    icon: Plane,
    description: "Vacations, road trips, weekend getaways",
    categories: ["Stay", "Transport", "Food", "Activities", "Shopping", "Misc"]
  },
  roommates: {
    icon: HomeIcon,
    label: "Roommates",
    description: "Shared apartments, flat utilities, rent, groceries",
    categories: ["Rent", "Utilities", "Groceries", "Subscriptions", "Cleaning", "Misc"]
  },
  student: {
    icon: GraduationCap,
    label: "Student",
    description: "Hostels, roommate mess fees, study books, transport",
    categories: ["Mess/Food", "Books/Supplies", "Hostel Fees", "Transport", "Subscriptions", "Misc"]
  },
  startup: {
    icon: Rocket,
    label: "Startup",
    description: "Software SaaS tools, shared marketing budgets, operations",
    categories: ["Software/Tools", "Travel", "Equipment", "Marketing", "Contractor Payments", "Misc"]
  },
  group: {
    icon: Users,
    label: "Custom",
    description: "General ad-hoc splits, outings, dining together",
    categories: ["Food", "Entertainment", "Shopping", "Transport", "Misc"]
  }
};

export const Groups: React.FC = () => {
  const { user, profile, groups, navigate, theme } = useApp();

  // Create group form state
  const [showModal, setShowModal] = useState(false);
  const [creationStep, setCreationStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [category, setCategory] = useState<"trip" | "roommates" | "student" | "startup" | "group">("trip");
  const [currency, setCurrency] = useState("INR");

  // Type specific inputs
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [tripDailyCap, setTripDailyCap] = useState("");
  const [recurringMonthly, setRecurringMonthly] = useState(true);
  const [messFeeAmount, setMessFeeAmount] = useState("");

  // Real friends list state
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  // Delete group state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteGroupFromCard = async () => {
    if (!deleteTarget) return;
    try {
      await dbDeleteDoc("groups", deleteTarget);
      toast.success("Group deleted successfully");
    } catch (err) {
      console.error("Failed to delete group:", err);
      toast.error("Failed to delete group");
    } finally {
      setDeleteTarget(null);
      setShowDeleteConfirm(false);
    }
  };

  // Load verified connected friends
  const loadEligibleFriends = async () => {
    if (!profile || !showModal) return;
    setLoadingFriends(true);
    try {
      const friendsUids = profile.friends || [];
      const results = await dbGetDocsInBatches("users", "uid", friendsUids);
      setFriendsList(results);
    } catch (err) {
      console.error("Error loading eligible friends for groups:", err);
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => {
    loadEligibleFriends();
  }, [profile, showModal]);

  // Toggle friend selection helper
  const handleToggleFriend = (f: any) => {
    if (selectedFriends.some((item) => item.uid === f.uid)) {
      setSelectedFriends(selectedFriends.filter((item) => item.uid !== f.uid));
    } else {
      setSelectedFriends([...selectedFriends, f]);
    }
  };

  // Dispatch group creation
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !name.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const newGroupId = `group_${Date.now()}`;

      // Combine current user with selected verified connections
      const memberUids = [user.uid, ...selectedFriends.map((f) => f.uid)];
      const namesRecord: Record<string, string> = {
        [user.uid]: profile.name || "Me",
      };

      selectedFriends.forEach((f) => {
        namesRecord[f.uid] = f.name || "Member";
      });

      // Budget Config
      const budgetConfig: any = {
        totalCap: budget.trim() ? Number(budget) : null,
        recurring: (category === "roommates" || category === "startup") ? recurringMonthly : false
      };

      if (category === "trip") {
        if (tripStartDate) budgetConfig.periodStart = tripStartDate;
        if (tripEndDate) budgetConfig.periodEnd = tripEndDate;
        if (tripDailyCap) budgetConfig.perDayCap = Number(tripDailyCap);
      } else if (category === "student") {
        if (tripStartDate) budgetConfig.periodStart = tripStartDate;
        if (tripEndDate) budgetConfig.periodEnd = tripEndDate;
        if (messFeeAmount) budgetConfig.messFeeAmount = Number(messFeeAmount);
      }

      // Write group node securely
      const groupData = {
        id: newGroupId,
        name: name.trim(),
        description: description.trim(),
        createdBy: user.uid,
        members: memberUids,
        memberNames: namesRecord,
        budget: budget.trim() ? Number(budget) : null,
        category: category,
        type: category,
        currency,
        budgetConfig,
        defaultCategories: CONTEXT_PRESETS[category]?.categories || [],
        status: "active",
        createdAt: new Date().toISOString()
      };

      await dbSetDoc("groups", newGroupId, groupData);

      // Log initialization activity (non-blocking — don't let this fail the whole creation)
      try {
        const activityId = `act_${Date.now()}`;
        await dbSetDoc(`groups/${newGroupId}/activities`, activityId, {
          id: activityId,
          groupId: newGroupId,
          category: "group_created",
          message: `${profile.name} created the group "${name.trim()}".`,
          actorId: user.uid,
          createdAt: new Date().toISOString()
        });
      } catch (actErr) {
        console.warn("Activity log write failed (non-critical):", actErr);
      }

      // Reset Form State
      setName("");
      setDescription("");
      setBudget("");
      setSelectedFriends([]);
      setCreationStep(1);
      setShowModal(false);

      toast.success(`Group "${name.trim()}" created!`);
      navigate("/groups/[id]", { id: newGroupId });
    } catch (err: any) {
      console.error("Failed to commit group structure:", err);
      toast.error(err?.message || "Failed to create group. Check your connection.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-b border-gray-100 dark:border-white/5 pb-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-gray-400 font-mono tracking-widest uppercase font-bold">Ledgers</span>
          <h1 className="font-sans font-black text-3.5xl tracking-tight leading-none uppercase">My Groups</h1>
          <p className="text-sm text-gray-500">
            Keep track of roommate splits, restaurant checkouts, or travel shares.
          </p>
        </div>

        <button
          id="show-create-group-modal-btn"
          onClick={() => setShowModal(true)}
          className={`flex items-center gap-2 py-3 px-5 font-bold font-mono text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-colors shrink-0 ${theme === "dark" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "bg-black text-white hover:bg-slate-800"
            }`}
        >
          <Plus className="w-4 h-4" />
          <span>New Group</span>
        </button>
      </div>

      {/* Main card list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 place-items-center">
        {groups.map((g) => (
          <div
            key={g.id}
            onClick={() => navigate("/groups/[id]", { id: g.id })}
            className={`border rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-pointer flex flex-col justify-between gap-6 group shadow-3xs w-full ${theme === "dark"
                ? "bg-slate-900/60 border-white/5 hover:border-cyan-500/30"
                : "bg-white border-slate-200/80 hover:border-slate-300"
              }`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-extrabold text-lg uppercase ${theme === "dark" ? "bg-slate-950 border border-white/5 text-cyan-400" : "bg-slate-50 border border-slate-150 text-slate-700"
                  }`}>
                  {g.name?.[0] || "G"}
                </div>
                <span className={`text-[9px] font-mono select-none px-2 py-0.5 border rounded-full font-bold ${g.status === "ended"
                    ? "border-red-200 text-red-500 bg-red-50"
                    : theme === "dark" ? "border-cyan-500/20 text-cyan-400 bg-cyan-500/5 bg-opacity-20" : "border-slate-150 text-slate-500 bg-slate-50"
                  }`}>{g.status === "ended" ? "ENDED" : "ACTIVE"}</span>
              </div>

              <div className="flex flex-col">
                <h3 className="text-sm font-bold tracking-tight transition-colors group-hover:text-primary">{g.name}</h3>
                {g.description && <p className="text-xs text-gray-400 line-clamp-2 mt-1 leading-relaxed">{g.description}</p>}
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-white/5 pt-4 flex justify-between items-center text-[11px]">
              <span className="text-gray-400 flex items-center gap-1 font-mono font-medium">
                <Users className="w-3.5 h-3.5 text-gray-500" />
                {g.members.length} MEMBERS
              </span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-bold flex items-center font-mono">
                  {g.budget ? `₹${g.budget.toLocaleString("en-IN")} LIMIT` : "NO LIMIT"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(g.id);
                    setShowDeleteConfirm(true);
                  }}
                  title="Delete Group"
                  className="p-1.5 rounded-lg text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="col-span-full border rounded-3xl p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-3 border-border">
            <FolderOpen className="w-8 h-8 text-gray-500" />
            <p className="text-xs font-mono font-bold max-w-sm">
              You don't belong to any groups yet. Tap "New Group" to start building your share pool!
            </p>
          </div>
        )}
      </div>

      {/* Create Group Modal Backdrop Dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-2xl w-full max-w-lg p-6 sm:p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto shadow-2xl transition-all duration-300 bg-white border-slate-200`}>
            {/* Modal title */}
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h2 className="font-sans font-black text-lg uppercase tracking-tight">Create Context Ledger</h2>
              <button
                id="close-group-modal-btn"
                onClick={() => {
                  setSelectedFriends([]);
                  setCreationStep(1);
                  setShowModal(false);
                }}
                className="text-gray-400 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {creationStep === 1 ? (
              <div className="flex flex-col gap-4 text-left">
                <span className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">1. Select Context Type</span>
                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(CONTEXT_PRESETS).map(([key, value]) => {
                    const Icon = value.icon;
                    return (
                      <div
                        key={key}
                        onClick={() => {
                          setCategory(key as any);
                          setCreationStep(2);
                        }}
                        className={`p-4 border rounded-xl flex items-center gap-4 cursor-pointer hover:border-primary transition-all hover:bg-muted/40`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-primary/5 text-primary flex items-center justify-center">
                          <Icon className="size-5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold uppercase tracking-wider">{value.label}</span>
                          <span className="text-[11px] text-muted-foreground">{value.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateGroup} className="flex flex-col gap-5 text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Context Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Goa Trip, 221B Flat, Buildmint Ops"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs py-3 px-4 rounded-xl border border-slate-200 focus:outline-none bg-slate-50 focus:border-black text-slate-800 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Description</label>
                  <textarea
                    placeholder="e.g. Rent splits, hostel mesh, or operations budget"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-xs py-3 px-4 rounded-xl border border-slate-200 focus:outline-none bg-slate-50 focus:border-black text-slate-800 transition-all resize-none h-16"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none h-9.5"
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Budget Cap</label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="e.g. 50000"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none h-9.5"
                      />
                    </div>
                  </div>
                </div>

                {category === "trip" && (
                  <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Start Date</label>
                      <input
                        type="date"
                        value={tripStartDate}
                        onChange={(e) => setTripStartDate(e.target.value)}
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none h-9.5"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">End Date</label>
                      <input
                        type="date"
                        value={tripEndDate}
                        onChange={(e) => setTripEndDate(e.target.value)}
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none h-9.5"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Daily Spend Cap</label>
                      <input
                        type="number"
                        placeholder="e.g. 5000"
                        value={tripDailyCap}
                        onChange={(e) => setTripDailyCap(e.target.value)}
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none h-9.5"
                      />
                    </div>
                  </div>
                )}

                {category === "student" && (
                  <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Semester Start</label>
                      <input
                        type="date"
                        value={tripStartDate}
                        onChange={(e) => setTripStartDate(e.target.value)}
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none h-9.5"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Semester End</label>
                      <input
                        type="date"
                        value={tripEndDate}
                        onChange={(e) => setTripEndDate(e.target.value)}
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none h-9.5"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Mess Fee Amount</label>
                      <input
                        type="number"
                        placeholder="e.g. 15000"
                        value={messFeeAmount}
                        onChange={(e) => setMessFeeAmount(e.target.value)}
                        className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none h-9.5"
                      />
                    </div>
                  </div>
                )}

                {(category === "roommates" || category === "startup") && (
                  <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold">Recurring Monthly</label>
                      <span className="text-[10px] text-muted-foreground">Reset stats and budget tracking monthly</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={recurringMonthly}
                      onChange={(e) => setRecurringMonthly(e.target.checked)}
                      className="rounded border-slate-300 text-primary focus:ring-primary size-4"
                    />
                  </div>
                )}

                {/* Members configuration block */}
                <div className="border-t border-gray-150 pt-4 flex flex-col gap-3">
                  <label className="text-[10px] font-mono tracking-widest uppercase text-gray-400 font-bold flex justify-between">
                    <span>SELECT VERIFIED MEMBERS</span>
                    <span className="text-primary font-bold">[ YOU ARE AUTOMATICALLY MEMBER ]</span>
                  </label>

                  {loadingFriends ? (
                    <div className="flex py-4 justify-center">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </div>
                  ) : friendsList.length === 0 ? (
                    <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-700 flex flex-col gap-3">
                      <div className="flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                        <div className="flex flex-col gap-0.5 text-xs font-medium">
                          <span className="font-bold uppercase font-mono">No Connections Verified</span>
                          <span>Only mutually accepted friends are eligible to join sharing contexts. Connect with members first!</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFriends([]);
                          setShowModal(false);
                          navigate("/network");
                        }}
                        className="py-2 px-3 self-start rounded-lg text-[10px] font-mono font-bold uppercase bg-amber-600 text-white cursor-pointer"
                      >
                        [ GOTO CONNECTIONS CENTER ]
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                      {friendsList.map((f) => {
                        const isSelected = selectedFriends.some((item) => item.uid === f.uid);
                        return (
                          <div
                            key={f.uid}
                            onClick={() => handleToggleFriend(f)}
                            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isSelected
                                ? "bg-primary/5 border-primary text-foreground font-semibold"
                                : "bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300"
                              }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-mono text-xs overflow-hidden shrink-0">
                                {f.photoURL ? (
                                  <img src={f.photoURL} alt={f.name || "Friend"} referrerPolicy="no-referrer" />
                                ) : (
                                  <span>{f.name?.[0] || "F"}</span>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-semibold leading-tight">{(f.name || "")} {(f.surname || "")}</span>
                                <span className="text-[10px] text-gray-400 font-mono leading-none mt-1">@{f.username || "user"}</span>
                              </div>
                            </div>

                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-gray-300"
                              }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreationStep(1)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-bold font-mono uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold font-mono uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Ledger"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col gap-5 max-w-sm w-full shadow-2xl">
            <div className="flex flex-col gap-2">
              <h3 className="font-sans font-black text-lg uppercase tracking-tight">Delete this group?</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                This action cannot be undone. This group, along with all its expenses, settlements, and activity logs, will be permanently deleted.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDeleteTarget(null);
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-bold font-mono uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteGroupFromCard}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white text-xs font-bold font-mono uppercase tracking-wider hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete Group
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
