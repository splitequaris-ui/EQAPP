import { describe, it, expect } from "vitest";
import { calculateBalances, generateSettlementSuggestions } from "./settleEngine";
import { Expense } from "../types";

describe("settleEngine", () => {
  const members = ["alice", "bob", "charlie"];

  describe("calculateBalances", () => {
    it("should return all balances as 0 when there are no expenses", () => {
      const expenses: Expense[] = [];
      const balances = calculateBalances(members, expenses);
      expect(balances).toEqual({ alice: 0, bob: 0, charlie: 0 });
    });

    it("should split expense equally when splits array is missing", () => {
      const expenses: Expense[] = [
        {
          id: "exp1",
          groupId: "group1",
          title: "Dinner",
          amount: 90,
          paidBy: "alice",
          category: "food",
          date: "2024-07-19",
          createdAt: "2024-07-19T09:00:00Z",
          splitType: "equal",
          splits: [],
        },
      ];

      const balances = calculateBalances(members, expenses);
      // Alice paid 90, everyone's share is 30.
      // Alice: +60, Bob: -30, Charlie: -30
      expect(balances).toEqual({ alice: 60, bob: -30, charlie: -30 });
    });

    it("should handle custom splits correctly", () => {
      const expenses: Expense[] = [
        {
          id: "exp2",
          groupId: "group1",
          title: "Custom Expense",
          amount: 100,
          paidBy: "bob",
          category: "others",
          date: "2024-07-19",
          createdAt: "2024-07-19T09:30:00Z",
          splitType: "exact",
          splits: [
            { uid: "alice", amount: 20 },
            { uid: "bob", amount: 50 },
            { uid: "charlie", amount: 30 },
          ],
        },
      ];

      const balances = calculateBalances(members, expenses);
      // Bob paid 100.
      // Alice owes 20 (balance -20)
      // Bob owes 50 (paid 100, owes 50, balance +50)
      // Charlie owes 30 (balance -30)
      expect(balances).toEqual({ alice: -20, bob: 50, charlie: -30 });
    });

    it("should handle multiple expenses by different payers", () => {
      const expenses: Expense[] = [
        {
          id: "exp1",
          groupId: "group1",
          title: "Dinner",
          amount: 90,
          paidBy: "alice",
          category: "food",
          date: "2024-07-19",
          createdAt: "2024-07-19T09:00:00Z",
          splitType: "equal",
          splits: [], // equal split: 30 each
        },
        {
          id: "exp2",
          groupId: "group1",
          title: "Cab",
          amount: 30,
          paidBy: "bob",
          category: "travel",
          date: "2024-07-19",
          createdAt: "2024-07-19T09:05:00Z",
          splitType: "equal",
          splits: [], // equal split: 10 each
        },
      ];

      const balances = calculateBalances(members, expenses);
      // Exp 1: Alice +60, Bob -30, Charlie -30
      // Exp 2: Alice -10, Bob +20, Charlie -10
      // Total: Alice +50, Bob -10, Charlie -40
      expect(balances).toEqual({ alice: 50, bob: -10, charlie: -40 });
    });
  });

  describe("generateSettlementSuggestions", () => {
    it("should generate no suggestions when all balances are settled", () => {
      const balances = { alice: 0, bob: 0, charlie: 0 };
      const suggestions = generateSettlementSuggestions("group1", balances);
      expect(suggestions).toEqual([]);
    });

    it("should generate simple suggestions when one person owes another", () => {
      const balances = { alice: 50, bob: -50, charlie: 0 };
      const suggestions = generateSettlementSuggestions("group1", balances);
      expect(suggestions).toEqual([
        {
          groupId: "group1",
          fromUid: "bob",
          toUid: "alice",
          amount: 50,
          status: "pending",
        },
      ]);
    });

    it("should minimize transaction count using greedy solver", () => {
      const balances = { alice: 60, bob: -40, charlie: -20 };
      const suggestions = generateSettlementSuggestions("group1", balances);
      // Bob owes Alice 40, Charlie owes Alice 20
      expect(suggestions).toEqual([
        {
          groupId: "group1",
          fromUid: "bob",
          toUid: "alice",
          amount: 40,
          status: "pending",
        },
        {
          groupId: "group1",
          fromUid: "charlie",
          toUid: "alice",
          amount: 20,
          status: "pending",
        },
      ]);
    });
  });
});
