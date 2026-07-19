/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { buildWalletSnapshot } from "../lib/walletContext";
import { Wallet, X, Send, Loader2 } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const SUGGESTIONS = [
  "Who do I owe money to?",
  "How did I spend so much?",
  "Am I close to any budget limit?",
  "What's my overall balance?"
];

export const AssistantChat: React.FC = () => {
  const { user, profile, groups, allExpenses, theme } = useApp();
  const dark = theme === "dark";

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || !user) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      // Deterministic, real snapshot computed fresh on every question.
      const snapshot = buildWalletSnapshot(
        user.uid,
        profile?.nickname || profile?.name || user.displayName || "you",
        groups,
        allExpenses,
        new Date().toISOString()
      );

      const token = await user.getIdToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          snapshot
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setMessages([...nextMessages, { role: "assistant", content: data.error || "Something went wrong.", error: true }]);
      } else {
        setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
      }
    } catch (err: any) {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: `Couldn't reach the assistant: ${err?.message || "network error"}.`, error: true }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          id="assistant-launcher"
          onClick={() => setOpen(true)}
          title="Ask the wallet assistant"
          className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105 cursor-pointer ${
            dark ? "bg-cyan-500 text-black" : "bg-black text-white"
          }`}
        >
          <span className="relative flex items-center justify-center">
            <Wallet className="w-6 h-6" strokeWidth={2.25} />
            {/* small "live/smart" accent dot */}
            <span className={`absolute -top-1.5 -right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ${dark ? "ring-cyan-500" : "ring-black"}`} />
          </span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={`fixed z-50 flex flex-col overflow-hidden shadow-2xl border
            bottom-0 right-0 w-full h-[85vh] rounded-t-2xl
            sm:bottom-6 sm:right-6 sm:w-[400px] sm:h-[600px] sm:max-h-[80vh] sm:rounded-2xl ${
            dark ? "bg-slate-900 border-white/10 text-slate-100" : "bg-white border-slate-200 text-slate-900"
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${dark ? "border-white/10" : "border-slate-100"}`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${dark ? "bg-cyan-500/15 text-cyan-400" : "bg-black text-white"}`}>
                <Wallet className="w-4 h-4" strokeWidth={2.25} />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-sm font-bold tracking-tight">Wallet Assistant</span>
                <span className="text-[10px] text-gray-400 font-mono mt-0.5">Real data · no guesswork</span>
              </div>
            </div>
            <button
              id="assistant-close"
              onClick={() => setOpen(false)}
              className={`p-1.5 rounded-lg cursor-pointer transition-colors ${dark ? "hover:bg-white/10 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
            {messages.length === 0 && (
              <div className="flex flex-col gap-4">
                <div className={`rounded-2xl p-4 text-sm leading-relaxed ${dark ? "bg-slate-800/60" : "bg-slate-50 border border-slate-100"}`}>
                  Hi {profile?.nickname || profile?.name?.split(" ")[0] || "there"} 👋 — I can see all your groups and expenses.
                  Ask me who owes whom, where your money went, or whether a spend fits your budget. I only ever use your real numbers.
                </div>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className={`text-left text-xs font-medium px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${
                        dark ? "border-white/10 hover:border-cyan-500/40 hover:bg-white/5 text-slate-300" : "border-slate-200 hover:border-black hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === "user"
                      ? dark
                        ? "bg-cyan-500 text-black rounded-br-md"
                        : "bg-black text-white rounded-br-md"
                      : m.error
                        ? dark
                          ? "bg-red-500/15 text-red-300 border border-red-500/20 rounded-bl-md"
                          : "bg-red-50 text-red-700 border border-red-200 rounded-bl-md"
                        : dark
                          ? "bg-slate-800 text-slate-100 rounded-bl-md"
                          : "bg-slate-100 text-slate-800 rounded-bl-md"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 flex items-center gap-2 ${dark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-xs font-mono">Checking your ledger…</span>
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className={`px-3 py-3 border-t shrink-0 ${dark ? "border-white/10" : "border-slate-100"}`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your money…"
                className={`flex-1 text-sm px-3.5 py-2.5 rounded-xl border focus:outline-none transition-colors ${
                  dark
                    ? "bg-slate-950/60 border-white/10 focus:border-cyan-500 text-white placeholder:text-slate-500"
                    : "bg-slate-50 border-slate-200 focus:border-black text-slate-900 placeholder:text-slate-400"
                }`}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  dark ? "bg-cyan-500 text-black hover:bg-cyan-400" : "bg-black text-white hover:bg-slate-800"
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
