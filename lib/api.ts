import Constants from "expo-constants";
import { auth } from "./firebase";

export const getBackendUrl = () => {
  const hostUri = Constants.expoConfig?.hostUri || "";
  if (hostUri) {
    const ip = hostUri.split(":")[0];
    return `http://${ip}:3080`;
  }
  return "http://localhost:3080";
};

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}${endpoint}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Inject Firebase Auth ID token if logged in
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch (err) {
      console.warn("Failed to retrieve Firebase ID token", err);
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API request failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchInsights(expenses: any[], budget: number, memberNames: Record<string, string>) {
  return apiRequest("/api/insights", {
    method: "POST",
    body: JSON.stringify({ expenses, budget, memberNames }),
  });
}

export async function sendAssistantChatMessage(messages: any[], snapshot: any) {
  return apiRequest("/api/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ messages, snapshot }),
  });
}
