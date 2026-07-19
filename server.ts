/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import "dotenv/config";
import express from "express";
import path from "path";
import admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { calculateBalances, generateSettlementSuggestions } from "./src/lib/settleEngine";

// Initialize Firebase Admin SDK
admin.initializeApp({
  projectId: "equaris-a2e02",
});

const firebaseAuth = getAuth();

// Middleware to authenticate requests via Firebase ID Token (JWT verification)
async function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await firebaseAuth.verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (err: any) {
    console.error("Token verification failed:", err);
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

// Rate limiter for proxy / API routes (limit to 100 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes." }
});

// Heuristic fallback for spending insights in case Ollama is offline or fails
function generateHeuristicInsights(expenses: any[], budget: number, memberNames: Record<string, string>): any[] {
  const insights: any[] = [];
  const totalSpend = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  
  const categoryTotals: Record<string, number> = {};
  expenses.forEach(e => {
    const cat = e.category || "others";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (e.amount || 0);
  });

  // 1. Budget status
  if (budget > 0) {
    const percent = (totalSpend / budget) * 100;
    if (percent > 100) {
      insights.push({
        type: "warning",
        title: "Over budget!",
        message: `Group spend of ₹${totalSpend.toLocaleString("en-IN")} is over the ₹${budget.toLocaleString("en-IN")} budget limit. Cool down required!`
      });
    } else if (percent > 85) {
      insights.push({
        type: "warning",
        title: "Budget running thin",
        message: `Spent ₹${totalSpend.toLocaleString("en-IN")} of ₹${budget.toLocaleString("en-IN")}. 85%+ reached, spending quarantine suggested.`
      });
    } else {
      insights.push({
        type: "budget",
        title: "Budget Status",
        message: `Safe zone active. ₹${(budget - totalSpend).toLocaleString("en-IN")} remaining out of ₹${budget.toLocaleString("en-IN")}.`
      });
    }
  } else {
    insights.push({
      type: "budget",
      title: "No budget limit",
      message: `Total spend is ₹${totalSpend.toLocaleString("en-IN")}. Consider setting a budget limit to track savings.`
    });
  }

  // 2. High spending category
  const categories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  if (categories.length > 0) {
    const [topCat, topAmount] = categories[0];
    const catName = topCat.charAt(0).toUpperCase() + topCat.slice(1);
    insights.push({
      type: "tip",
      title: `Top category: ${catName}`,
      message: `₹${topAmount.toLocaleString("en-IN")} spent on ${topCat}. That constitutes ${(topAmount / (totalSpend || 1) * 100).toFixed(0)}% of total group expenses.`
    });
  } else {
    insights.push({
      type: "chill",
      title: "Clean Slate",
      message: "No transactions logged yet. Budget is completely untouched."
    });
  }

  // 3. Witty generic tip
  if (categoryTotals["food"] && categoryTotals["food"] > totalSpend * 0.4) {
    insights.push({
      type: "warning",
      title: "Foodie Alert",
      message: "Dining out and food orders are eating up the majority of the budget. Time to cook at home?"
    });
  } else if (categoryTotals["travel"] && categoryTotals["travel"] > totalSpend * 0.3) {
    insights.push({
      type: "tip",
      title: "Wanderlust Tax",
      message: "Travel expenses are piling up. Make sure the Goa plans are actually worth it!"
    });
  } else {
    insights.push({
      type: "chill",
      title: "Financial Peace",
      message: "Spend is distributed evenly. Keep the financial vibes clean and split responsibly."
    });
  }

  return insights.slice(0, 3);
}

// Heuristic fallback for Assistant Chat in case Ollama is offline or fails
function generateHeuristicChatResponse(messages: any[], snapshot: any): string {
  const lastUserMessage = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const query = lastUserMessage.toLowerCase();
  
  const totalSpent = snapshot?.totalSpent ?? 0;
  const netBalance = snapshot?.netBalance ?? 0;
  const suggestions = snapshot?.suggestions || [];
  
  if (query.includes("owe") || query.includes("debt") || query.includes("settle")) {
    if (suggestions.length === 0) {
      return `Based on the current calculations, you are completely settled up! No active debts or dues to resolve.`;
    }
    const lines = suggestions.map((s: any) => {
      const from = s.fromUid === snapshot?.myUid ? "You" : (snapshot?.memberNames?.[s.fromUid] || "Someone");
      const to = s.toUid === snapshot?.myUid ? "you" : (snapshot?.memberNames?.[s.toUid] || "someone");
      return `- ${from} owe(s) ${to} ₹${s.amount.toLocaleString("en-IN")} (${s.status || "pending"})`;
    });
    return `Here are the active settlement suggestions:\n${lines.join("\n")}`;
  }

  if (query.includes("spend") || query.includes("spent") || query.includes("category") || query.includes("cost")) {
    const categories = Object.entries(snapshot?.categoryBreakdown || {});
    if (categories.length === 0) {
      return `You haven't logged any expenses yet, so your spend is ₹0.`;
    }
    const breakdown = categories.map(([cat, amt]: any) => `- ${cat}: ₹${amt.toLocaleString("en-IN")}`).join("\n");
    return `Your total spend across all active groups is ₹${totalSpent.toLocaleString("en-IN")}. Here is the breakdown by category:\n${breakdown}`;
  }

  if (query.includes("balance") || query.includes("overall")) {
    const balText = netBalance >= 0 
      ? `You are owed a net total of ₹${netBalance.toLocaleString("en-IN")} overall.`
      : `You owe a net total of ₹${Math.abs(netBalance).toLocaleString("en-IN")} overall.`;
    return `Your overall financial status: ${balText} Total spent: ₹${totalSpent.toLocaleString("en-IN")}.`;
  }

  if (query.includes("budget") || query.includes("limit")) {
    const groups = snapshot?.groups || [];
    const activeBudgets = groups.filter((g: any) => g.budget > 0);
    if (activeBudgets.length === 0) {
      return `None of your active groups have a budget set. You can set a budget limit inside the Group Settings page.`;
    }
    const lines = activeBudgets.map((g: any) => {
      return `- Group "${g.name}": spent ₹${g.spent.toLocaleString("en-IN")} / budget ₹${g.budget.toLocaleString("en-IN")} (${g.budgetStatus || "safe"})`;
    });
    return `Here is your budget status:\n${lines.join("\n")}`;
  }

  return `I am currently operating in backup mode because the main AI service is temporarily offline. Based on your snapshot:
- Your net balance is ₹${netBalance.toLocaleString("en-IN")}.
- Your total spend across active groups is ₹${totalSpent.toLocaleString("en-IN")}.

Let me know if you want to know about your "debts/owes", "spending breakdown", or "budget status"!`;
}

/**
 * Strict system prompt for the wallet assistant. The model is only allowed to
 * narrate the EXACT figures in the snapshot — never to compute or invent them.
 */
function buildAssistantSystemPrompt(snapshot: unknown): string {
  const snap = snapshot ?? { note: "No financial data was provided." };
  return `You are "Dispute Assistant", a personal wallet and expense-splitting assistant embedded inside the Dispute app.

You are given a JSON snapshot of the user's REAL, current financial data (currency: Indian Rupees, ₹). It was computed directly from the database, so it is the single source of truth.

ABSOLUTE RULES — follow strictly, no exceptions:
1. Use ONLY the numbers, names, groups, and categories that appear in the snapshot. NEVER invent, estimate, extrapolate, or guess a figure. Do not do your own arithmetic — only use totals that are already present in the snapshot.
2. If the user asks about something not in the snapshot, say plainly that you don't have that data yet. Never fabricate to fill a gap.
3. Currency is always ₹ (INR). Show amounts exactly as written in the snapshot.
4. Call the user "you". Other people are named in the snapshot.
5. Be direct and confident when the data is present — do NOT hedge, apologise, or refuse. Answer the exact question first, then add a short explanation only if useful.
6. For "how / why did I spend this much" questions, break it down using categoryBreakdown and topExpenses from the snapshot.
7. Budgets: if a group's budget "level" is "at risk" or "over budget", proactively warn the user and reference the exact remaining amount. If the user asks whether they can afford to spend ₹X, compare ₹X against that group's "remaining" and tell them the resulting status honestly.
8. Keep answers concise — a few sentences or a short bullet list. Do not output large JSON or markdown tables.

The "facts" array in the snapshot contains verified, true statements you may quote directly.

SNAPSHOT (the single source of truth):
${JSON.stringify(snap)}`;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware for body parsing
  app.use(express.json({ limit: "15mb" }));

  // API 1: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // API 3: Generate witty Gen-Z insights & warnings from group expenses (Ollama-backed).
  // Secured with rate-limiting and Firebase Token verification.
  app.post("/api/insights", apiLimiter, authenticateUser, async (req, res) => {
    const { expenses, budget, memberNames } = req.body;
    try {
      const host = (process.env.OLLAMA_HOST || "https://ollama.com").replace(/\/+$/, "");
      const model = process.env.OLLAMA_MODEL || "gpt-oss:120b";
      const apiKey = process.env.OLLAMA_API_KEY;
      if (host.includes("ollama.com") && !apiKey) {
        throw new Error("OLLAMA_API_KEY is not set.");
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const prompt = `You are a witty personal-finance assistant embedded in the Equaris expense-splitting app (currency: Indian Rupees, ₹).

Group overall budget: ₹${budget || 0}.
Group members (uid -> name): ${JSON.stringify(memberNames || {})}.
Logged transactions (JSON): ${JSON.stringify(expenses || [])}.

Generate EXACTLY 3 short insights or tips based ONLY on the data above. Each must be 1-2 sentences, stylish, using clean modern Gen-Z premium slang. Do NOT include emojis anywhere.

Return ONLY valid JSON in exactly this shape, nothing else:
{"insights":[{"type":"budget|warning|tip|chill","title":"short micro title","message":"the insight"}]}`;

      const ollamaRes = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          format: "json",
          options: { temperature: 0.7 },
        }),
      });

      if (!ollamaRes.ok) {
        const detail = await ollamaRes.text();
        throw new Error(`Insights model error (HTTP ${ollamaRes.status}). ${detail.slice(0, 300)}`);
      }

      const data: any = await ollamaRes.json();
      const raw = data?.message?.content?.trim() || "";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The insights model returned invalid JSON.");
      }
      const insights = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.insights)
          ? parsed.insights
          : [];
      res.json(insights.slice(0, 3));
    } catch (err: any) {
      console.warn("Insights Ollama query failed, falling back to heuristics:", err.message);
      const fallbackInsights = generateHeuristicInsights(expenses || [], budget || 0, memberNames || {});
      res.json(fallbackInsights);
    }
  });

  // API 4: Optimize debts & suggestions
  app.post("/api/settlements/suggest", (req, res) => {
    try {
      const { members, expenses, groupId } = req.body;
      if (!members || !expenses || !groupId) {
        return res.status(400).json({ error: "Missing parameters members, expenses, or groupId" });
      }

      const balances = calculateBalances(members, expenses);
      const suggestions = generateSettlementSuggestions(groupId, balances);
      res.json({ balances, suggestions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API 5: Wallet Assistant chat (Ollama-backed, grounded on a real data snapshot)
  // Secured with rate-limiting and Firebase Token verification.
  app.post("/api/assistant/chat", apiLimiter, authenticateUser, async (req, res) => {
    const { messages, snapshot } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "'messages' must be an array" });
    }

    try {
      const host = (process.env.OLLAMA_HOST || "https://ollama.com").replace(/\/+$/, "");
      const model = process.env.OLLAMA_MODEL || "gpt-oss:120b";
      const apiKey = process.env.OLLAMA_API_KEY;

      // Ollama Cloud requires a (free) API key; local Ollama does not.
      if (host.includes("ollama.com") && !apiKey) {
        throw new Error("OLLAMA_API_KEY is not set.");
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      // Only forward role/content, keep the last 12 turns to bound context size.
      const trimmed = messages
        .slice(-12)
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m: any) => ({ role: m.role, content: m.content }));

      const chatMessages = [
        { role: "system", content: buildAssistantSystemPrompt(snapshot) },
        ...trimmed,
      ];

      const ollamaRes = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: chatMessages,
          stream: false,
          options: { temperature: 0.2 },
        }),
      });

      if (!ollamaRes.ok) {
        const detail = await ollamaRes.text();
        throw new Error(`Assistant model error (HTTP ${ollamaRes.status}). ${detail.slice(0, 300)}`);
      }

      const data: any = await ollamaRes.json();
      const reply = data?.message?.content?.trim() || "";
      if (!reply) {
        throw new Error("The assistant returned an empty response.");
      }
      res.json({ reply });
    } catch (err: any) {
      console.warn("Assistant chat Ollama query failed, falling back to heuristics:", err.message);
      const fallbackReply = generateHeuristicChatResponse(messages, snapshot);
      res.json({ reply: fallbackReply });
    }
  });

  // Integration with Vite development middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dispute full-stack server running securely on port ${PORT}`);
    console.log(`  > Local:            http://localhost:${PORT}`);
    console.log(`  > Note: open via http://localhost:${PORT} (not 127.0.0.1) — 'localhost' is the Firebase-authorized domain.`);
  });
}

startServer().catch((error) => {
  console.error("Sever startup crashed:", error);
});
