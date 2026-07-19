/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Netlify serverless function — generates 3 short spending insights from the
 * group's real expenses using Ollama Cloud (the same backend as the wallet
 * assistant).
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

function generateHeuristicInsights(expenses, budget, memberNames) {
  const insights = [];
  const totalSpend = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  
  const categoryTotals = {};
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

function buildInsightsPrompt(expenses, budget, memberNames) {
  return `You are a witty personal-finance assistant embedded in the Equaris expense-splitting app (currency: Indian Rupees, ₹).

Group overall budget: ₹${budget || 0}.
Group members (uid -> name): ${JSON.stringify(memberNames || {})}.
Logged transactions (JSON): ${JSON.stringify(expenses || [])}.

Generate EXACTLY 3 short insights or tips based ONLY on the data above. Each must be 1-2 sentences, stylish, using clean modern Gen-Z premium slang (e.g. "Goa plans are eating up the budget", "Chai spend looking suspicious"). Do NOT include emojis anywhere.

Return ONLY valid JSON in exactly this shape, nothing else:
{"insights":[{"type":"budget|warning|tip|chill","title":"short micro title","message":"the insight"}]}`;
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

  const { expenses, budget, memberNames } = JSON.parse(event.body || "{}");

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

    const ollamaRes = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: buildInsightsPrompt(expenses, budget, memberNames) }],
        stream: false,
        format: "json",
        options: { temperature: 0.7 },
      }),
    });

    if (!ollamaRes.ok) {
      const detail = await ollamaRes.text();
      throw new Error(`Insights model error (HTTP ${ollamaRes.status}). ${detail.slice(0, 300)}`);
    }

    const data = await ollamaRes.json();
    const raw = data?.message?.content?.trim() || "";
    let parsed;
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

    return json(200, insights.slice(0, 3));
  } catch (err) {
    console.warn("Insights Netlify handler failed, using fallback:", err.message);
    const fallbackInsights = generateHeuristicInsights(expenses || [], budget || 0, memberNames || {});
    return json(200, fallbackInsights);
  }
};
