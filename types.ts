/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  uid: string;
  name: string;
  surname?: string;
  username?: string;
  /** Friendly name the app uses to address & refer to the user. */
  nickname?: string;
  email: string;
  phone?: string;
  photoURL?: string;
  upiId?: string;
  /** How the user prefers to settle up: receive/pay in cash or via UPI. */
  paymentPreference?: "cash" | "upi";
  isOnboarded?: boolean;
  friends?: string[]; // accepted connected user uids
  sentRequests?: string[]; // pending outbound usernames or uids
  receivedRequests?: string[]; // pending inbound usernames or uids
  themePreference?: "light" | "dark";
  createdAt?: string;
}

export interface Split {
  uid: string;
  amount: number;
  percentage?: number;
  checked?: boolean; // Used for UI form state
}

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  amount: number;
  paidBy: string; // User UID
  category: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  receiptUrl?: string;
  splitType: "equal" | "percentage" | "exact";
  splits: Split[];
  createdAt: string; // ISO or Timestamp helper
  source?: "manual" | "ocr" | "subscription"; // New
  subscriptionId?: string; // New
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUid: string;
  toUid: string;
  amount: number;
  status: "pending" | "settled";
  createdAt: string;
  settledAt?: string;
  /** UPI/bank reference number the payer pastes in as proof. */
  transactionId?: string;
  /** Compressed base64 data URL of the payment-confirmation screenshot. */
  proofImage?: string;
}

export interface Activity {
  id: string;
  groupId: string;
  category: "expense_added" | "group_created" | "settlement_marked" | "member_joined" | "budget_changed";
  message: string;
  actorId: string;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  members: string[]; // List of UIDs
  memberNames: Record<string, string>; // offline fast lookups
  budget?: number; // legacy budget cap
  createdAt: string;
  type?: "trip" | "roommates" | "student" | "startup" | "group"; // New
  currency?: string; // New, e.g., 'INR'
  archivedAt?: string | null; // New
  budgetConfig?: {
    totalCap?: number;
    perCategoryCaps?: Record<string, number>;
    perDayCap?: number;
    periodStart?: string;
    periodEnd?: string;
    recurring?: boolean;
  }; // New
  defaultCategories?: string[]; // New
}

export interface Subscription {
  id: string;
  ownerId: string;
  contextId?: string; // empty means solo subscription
  name: string;
  provider?: string;
  amount: number;
  currency: string;
  billingCycle: "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
  customCycleDays?: number;
  nextRenewalDate: string; // YYYY-MM-DD
  lastChargedDate?: string; // YYYY-MM-DD
  splitType: "solo" | "equal" | "weighted" | "exact";
  splitMembers?: Array<{ userId: string; share: number }>; // share is direct amount or weights
  category: "OTT" | "Music" | "Software" | "Cloud/Storage" | "Utilities" | "Fitness" | "News/Reading" | "Other";
  status: "active" | "paused" | "cancelled" | "trial";
  trialEndsAt?: string; // YYYY-MM-DD
  reminderDaysBefore: number;
  autoLogExpense: boolean;
  createdAt: string;
  cancelledAt?: string;
  notes?: string;
}

export interface BudgetConfig {
  groupId: string;
  monthlyLimit: number;
  categoryLimits?: Record<string, number>;
}

export interface ReceiptScanResult {
  title: string;
  amount: number;
  category: string;
  date: string;
  items: {
    name: string;
    amount: number;
  }[];
}
