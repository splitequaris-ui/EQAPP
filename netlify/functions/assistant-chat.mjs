/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Netlify serverless function — the deployed twin of the `/api/assistant/chat`
 * route in server.ts. Netlify only serves the static client, so this function
 * is what actually reaches Ollama Cloud in production.
 *
 * Required Netlify environment variables (Site settings → Environment variables):
 *   OLLAMA_HOST     = https://ollama.com        (Ollama Cloud; NOT localhost)
 *   OLLAMA_API_KEY  = <free key from https://ollama.com/settings/keys>
 *   OLLAMA_MODEL    = gpt-oss:120b   (or gpt-oss:20b for faster replies)
 */

import crypto from "crypto";

let cachedKeys = null;
let keysExpiry = 0;

async function getGooglePublicKeys() {
  const now = Date.now();
  if (cachedKeys && now < keysExpiry) {
    return cachedKeys;
  }
  const res = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!res.ok) throw new Error("Failed to fetch Google public keys");
  const keys = await res.json();
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600000;
  cachedKeys = keys;
  keysExpiry = now + maxAge;
  return keys;
}

function verifyFirebaseToken(token, projectId) {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    const header = JSON.parse(Buffer.from(headerB64, "base64").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (payload.aud !== projectId) return null;

    return { header, payload, signatureB64, signedData: `${headerB64}.${payloadB64}` };
  } catch {
    return null;
  }
}

async function authenticateToken(authHeader, projectId = "equaris-a2e02") {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split("Bearer ")[1];
  const jwtInfo = verifyFirebaseToken(token, projectId);
  if (!jwtInfo) return null;

  try {
    const keys = await getGooglePublicKeys();
    const cert = keys[jwtInfo.header.kid];
    if (!cert) return null;

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(jwtInfo.signedData);
    const verified = verifier.verify(cert, jwtInfo.signatureB64, "base64");
    if (!verified) return null;

    return jwtInfo.payload;
  } catch (e) {
    console.error("JWT Verification error:", e);
    return null;
  }
}

function generateHeuristicChatResponse(messages, snapshot) {
  const lastUserMessage = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const query = lastUserMessage.toLowerCase();
  
  const totalSpent = snapshot?.totalSpent ?? 0;
  const netBalance = snapshot?.netBalance ?? 0;
  const suggestions = snapshot?.suggestions || [];
  
  if (query.includes("owe") || query.includes("debt") || query.includes("settle")) {
    if (suggestions.length === 0) {
      return `Based on the current calculations, you are completely settled up! No active debts or dues to resolve.`;
    }
    const lines = suggestions.map((s) => {
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
    const breakdown = categories.map(([cat, amt]) => `- ${cat}: ₹${amt.toLocaleString("en-IN")}`).join("\n");
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
    const activeBudgets = groups.filter((g) => g.budget > 0);
    if (activeBudgets.length === 0) {
      return `None of your active groups have a budget set. You can set a budget limit inside the Group Settings page.`;
    }
    const lines = activeBudgets.map((g) => {
      return `- Group "${g.name}": spent ₹${g.spent.toLocaleString("en-IN")} / budget ₹${g.budget.toLocaleString("en-IN")} (${g.budgetStatus || "safe"})`;
    });
    return `Here is your budget status:\n${lines.join("\n")}`;
  }

  return `I am currently operating in backup mode because the main AI service is temporarily offline. Based on your snapshot:
- Your net balance is ₹${netBalance.toLocaleString("en-IN")}.
- Your total spend across active groups is ₹${totalSpent.toLocaleString("en-IN")}.

Let me know if you want to know about your "debts/owes", "spending breakdown", or "budget status"!`;
}

function buildAssistantSystemPrompt(snapshot) {
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

const json = (statusCode, payload) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Validate Firebase token
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const decodedToken = await authenticateToken(authHeader);
  if (!decodedToken) {
    return json(401, { error: "Unauthorized: Invalid or missing token" });
  }

  const { messages, snapshot } = JSON.parse(event.body || "{}");
  if (!Array.isArray(messages)) {
    return json(400, { error: "'messages' must be an array" });
  }

  try {
    const host = (process.env.OLLAMA_HOST || "https://ollama.com").replace(/\/+$/, "");
    const model = process.env.OLLAMA_MODEL || "gpt-oss:120b";
    const apiKey = process.env.OLLAMA_API_KEY;

    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      throw new Error("OLLAMA_HOST points at localhost, which Netlify cannot reach.");
    }
    if (host.includes("ollama.com") && !apiKey) {
      throw new Error("OLLAMA_API_KEY is not set.");
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const trimmed = messages
      .slice(-12)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

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

    const data = await ollamaRes.json();
    const reply = data?.message?.content?.trim() || "";
    if (!reply) {
      throw new Error("The assistant returned an empty response.");
    }

    return json(200, { reply });
  } catch (err) {
    console.warn("Assistant chat Netlify handler failed, using fallback:", err.message);
    const fallbackReply = generateHeuristicChatResponse(messages, snapshot);
    return json(200, { reply: fallbackReply });
  }
};
