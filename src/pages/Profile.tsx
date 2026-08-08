/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import {
  User,
  Mail,
  Phone,
  AtSign,
  CreditCard,
  Pencil,
  Check,
  X,
  Loader2,
  Lock,
  AlertCircle,
  Sparkles,
  Banknote
} from "lucide-react";

export const Profile: React.FC = () => {
  const { user, profile, updateFullProfile, theme } = useApp();
  const dark = theme === "dark";

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [upiId, setUpiId] = useState("");
  const [paymentPref, setPaymentPref] = useState<"cash" | "upi">("upi");

  const hydrate = () => {
    const parts = (profile?.name || "").split(" ");
    setFirstName(parts[0] || "");
    setSurname(profile?.surname || parts.slice(1).join(" ") || "");
    setNickname(profile?.nickname || "");
    setPhone(profile?.phone || "");
    setUpiId(profile?.upiId || "");
    setPaymentPref(profile?.paymentPreference || "upi");
  };

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const startEdit = () => {
    hydrate();
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    hydrate();
    setError(null);
    setEditing(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const fn = firstName.trim();
    const sn = surname.trim();
    if (!fn) {
      setError("First name can't be empty.");
      return;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phone.trim() && phoneDigits.length < 7) {
      setError("Please enter a valid phone number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateFullProfile({
        name: sn ? `${fn} ${sn}` : fn,
        surname: sn,
        nickname: nickname.trim() || fn,
        phone: phone.trim(),
        upiId: upiId.trim(),
        paymentPreference: paymentPref
      });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2200);
    } catch (err: any) {
      setError(err?.message || "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const referName = profile?.nickname || profile?.name?.split(" ")[0] || "there";
  const avatarInitial = (profile?.nickname || profile?.name || "D").charAt(0).toUpperCase();

  const cardCls = dark ? "bg-slate-900/60 border-white/5" : "bg-white border-slate-200/80";
  const labelCls = `text-[10px] font-mono tracking-widest uppercase ${dark ? "text-slate-400" : "text-slate-500"}`;
  const inputCls = `w-full text-sm py-3 pl-10 pr-4 rounded-xl border focus:outline-none transition-all ${
    dark ? "bg-slate-950/60 border-white/10 focus:border-cyan-500 text-white" : "bg-slate-50 border-slate-200 focus:border-black text-slate-900"
  }`;

  const ReadRow: React.FC<{ icon: React.ReactNode; label: string; value?: string; muted?: boolean; locked?: boolean }> = ({
    icon,
    label,
    value,
    muted,
    locked
  }) => (
    <div className={`flex items-center gap-3 py-3.5 border-b last:border-b-0 ${dark ? "border-white/5" : "border-slate-100"}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${dark ? "bg-slate-950 text-slate-400 border border-white/5" : "bg-slate-50 text-slate-500 border border-slate-100"}`}>
        {icon}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className={labelCls}>{label}</span>
        <span className={`text-sm font-semibold truncate mt-0.5 ${!value ? "text-gray-400 italic font-normal" : dark ? "text-slate-100" : "text-slate-800"} ${muted ? "opacity-70" : ""}`}>
          {value || "Not set"}
        </span>
      </div>
      {locked && <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
    </div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8">

      {/* Header */}
      <div className={`flex flex-col gap-1.5 border-b pb-6 ${dark ? "border-white/5" : "border-gray-100"}`}>
        <span className="text-xs font-semibold text-gray-400 font-mono tracking-widest uppercase">Account</span>
        <h1 className={`font-sans font-black text-3xl tracking-tight leading-tight ${dark ? "text-white" : "text-gray-900"}`}>Your Profile</h1>
        <p className="text-sm text-gray-500">The details you set here are how Dispute identifies and addresses you across the app.</p>
      </div>

      {!profile ? (
        <div className={`border rounded-2xl p-10 text-center text-gray-400 ${cardCls} flex items-center justify-center`}>
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Identity card */}
          <div className={`border rounded-2xl p-6 flex flex-col items-center text-center gap-3 shadow-3xs ${cardCls}`}>
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={referName} referrerPolicy="no-referrer" className="w-20 h-20 rounded-full border border-black/10" />
            ) : (
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black uppercase ${dark ? "bg-slate-800 text-white border border-white/5" : "bg-slate-100 text-slate-800 border border-slate-200"}`}>
                {avatarInitial}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <h2 className={`text-lg font-black tracking-tight leading-tight ${dark ? "text-white" : "text-slate-900"}`}>{referName}</h2>
              {profile.username && <span className="text-xs text-gray-400 font-mono">@{profile.username}</span>}
            </div>
            <div className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono ${dark ? "bg-cyan-500/10 text-cyan-400" : "bg-slate-100 text-slate-600"}`}>
              <Sparkles className="w-3 h-3" />
              <span>The app calls you "{referName}"</span>
            </div>
          </div>

          {/* Details / edit */}
          <div className={`lg:col-span-2 border rounded-2xl p-6 sm:p-7 flex flex-col gap-5 shadow-3xs ${cardCls}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold ${dark ? "text-white" : "text-gray-900"}`}>Personal Details</h3>
              {!editing ? (
                <button
                  onClick={startEdit}
                  className={`flex items-center gap-1.5 text-xs font-bold py-2 px-3.5 rounded-xl border transition-colors cursor-pointer ${
                    dark ? "border-white/10 hover:bg-white/5 text-slate-200" : "border-slate-200 hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              ) : (
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-500">Editing…</span>
              )}
            </div>

            {saved && (
              <div className={`p-3 rounded-xl text-[11px] font-mono flex items-center gap-2 ${dark ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                <Check className="w-4 h-4" /> Profile updated successfully.
              </div>
            )}

            {!editing ? (
              <div className="flex flex-col">
                <ReadRow icon={<Sparkles className="w-4 h-4" />} label="Nickname" value={profile.nickname} />
                <ReadRow icon={<User className="w-4 h-4" />} label="Full name" value={profile.name} />
                <ReadRow icon={<Mail className="w-4 h-4" />} label="Email" value={profile.email} muted locked />
                <ReadRow icon={<Phone className="w-4 h-4" />} label="Phone" value={profile.phone} />
                <ReadRow icon={<AtSign className="w-4 h-4" />} label="Username" value={profile.username ? `@${profile.username}` : ""} muted locked />
                <ReadRow icon={<CreditCard className="w-4 h-4" />} label="UPI ID" value={profile.upiId} />
                <ReadRow
                  icon={profile.paymentPreference === "cash" ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                  label="Preferred payment"
                  value={profile.paymentPreference === "cash" ? "Cash" : profile.paymentPreference === "upi" ? "UPI" : ""}
                />
              </div>
            ) : (
              <form onSubmit={save} className="flex flex-col gap-4">
                <div>
                  <label className={labelCls}>Nickname (what we call you)</label>
                  <div className="relative mt-1.5 opacity-60">
                    <Sparkles className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={nickname} disabled maxLength={24} placeholder="Leave blank to use first name" className={inputCls} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>First name</label>
                    <div className="relative mt-1.5 opacity-60">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input value={firstName} disabled placeholder="First name" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Surname</label>
                    <div className="relative mt-1.5 opacity-60">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input value={surname} disabled placeholder="Surname" className={inputCls} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Phone number</label>
                  <div className="relative mt-1.5 opacity-60">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={phone} disabled type="tel" placeholder="+91 98765 43210" className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>UPI ID</label>
                  <div className="relative mt-1.5">
                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="e.g. name@upi" className={`${inputCls} font-mono`} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Preferred payment method</label>
                  <div className={`grid grid-cols-2 gap-2 p-1 mt-1.5 rounded-xl border ${dark ? "bg-slate-950/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                    {(["upi", "cash"] as const).map((opt) => {
                      const active = paymentPref === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setPaymentPref(opt)}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase font-mono tracking-wider transition-all cursor-pointer ${
                            active
                              ? dark ? "bg-cyan-500 text-black" : "bg-black text-white"
                              : dark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-black"
                          }`}
                        >
                          {opt === "upi" ? <CreditCard className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
                          {opt === "upi" ? "UPI" : "Cash"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Locked fields shown for reference */}
                <div className={`text-[10px] font-mono flex flex-col gap-1 px-1 ${dark ? "text-slate-500" : "text-slate-400"}`}>
                  <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Email: {profile.email || "—"} (from sign-in)</span>
                  <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Username: @{profile.username || "—"} (permanent handle)</span>
                </div>

                {error && (
                  <div className={`p-3 rounded-xl text-[11px] font-mono flex items-start gap-2 ${dark ? "bg-red-500/10 text-red-300 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={saving}
                    className={`flex-1 py-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                      dark ? "border-white/10 hover:bg-white/5 text-slate-300" : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 ${
                      dark ? "bg-cyan-500 text-black hover:bg-cyan-400" : "bg-black text-white hover:bg-slate-800"
                    }`}
                  >
                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save Changes</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
