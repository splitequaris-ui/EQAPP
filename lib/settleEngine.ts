import { Expense, Settlement } from "../types";

/**
 * Computes the net balance (Amount Paid minus Amount Owed) for each participant.
 */
export function calculateBalances(
  members: string[],
  expenses: Expense[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  
  // Initialize balances with 0
  members.forEach((m) => {
    balances[m] = 0;
  });

  expenses.forEach((expense) => {
    const paidBy = expense.paidBy;
    const amount = expense.amount;
    
    // Developer protection: if paidBy is not in member list, ignore or initialize
    if (balances[paidBy] === undefined) {
      balances[paidBy] = 0;
    }
    balances[paidBy] += amount;

    // Subtract shares
    if (expense.splits && expense.splits.length > 0) {
      expense.splits.forEach((split) => {
        if (balances[split.uid] === undefined) {
          balances[split.uid] = 0;
        }
        balances[split.uid] -= split.amount;
      });
    } else {
      // Default to equal split if splits list is missing/empty
      const share = amount / members.length;
      members.forEach((m) => {
        balances[m] -= share;
      });
    }
  });

  // Clean tiny floating point inaccuracies e.g. -0.0000000001
  Object.keys(balances).forEach((key) => {
    balances[key] = Math.round(balances[key] * 100) / 100;
  });

  return balances;
}

interface ParticipantBalance {
  uid: string;
  balance: number;
}

/**
 * Smart Settlement Algorithm (Greedy Debt Solver)
 * Minimizes peer-to-peer transaction count.
 */
export function generateSettlementSuggestions(
  groupId: string,
  balances: Record<string, number>
): Omit<Settlement, "id" | "createdAt">[] {
  // Split participants into debtors (< 0) and creditors (> 0)
  const debtors: ParticipantBalance[] = [];
  const creditors: ParticipantBalance[] = [];

  Object.entries(balances).forEach(([uid, bal]) => {
    if (bal < -0.01) {
      debtors.push({ uid, balance: bal });
    } else if (bal > 0.01) {
      creditors.push({ uid, balance: bal });
    }
  });

  // Sort debtors in ascending order (most negative first)
  debtors.sort((a, b) => a.balance - b.balance);
  // Sort creditors in descending order (highest positive first)
  creditors.sort((a, b) => b.balance - a.balance);

  const suggestions: Omit<Settlement, "id" | "createdAt">[] = [];

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const oweAmount = Math.abs(debtor.balance);
    const creditAmount = creditor.balance;

    const settledAmount = Math.min(oweAmount, creditAmount);

    if (settledAmount > 0.01) {
      suggestions.push({
        groupId,
        fromUid: debtor.uid,
        toUid: creditor.uid,
        amount: Math.round(settledAmount * 100) / 100,
        status: "pending"
      });
    }

    // Adjust balances
    debtor.balance += settledAmount;
    creditor.balance -= settledAmount;

    if (Math.abs(debtor.balance) < 0.01) {
      i++;
    }
    if (creditor.balance < 0.01) {
      j++;
    }
  }

  return suggestions;
}
