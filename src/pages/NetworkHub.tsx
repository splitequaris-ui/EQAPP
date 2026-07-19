/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { db } from "../lib/firebase";
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  query,
  where,
} from "firebase/firestore";
import { dbGetDoc, dbGetDocsInBatches } from "../lib/firestoreQuery";
import QRCode from "qrcode";
import {
  Search,
  Check,
  Clock,
  Users,
  QrCode,
  Copy,
  Share2,
  UserPlus2,
  X,
  AlertCircle,
  Camera,
  Download,
  Link2,
  Loader2,
} from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

export const NetworkHub: React.FC = () => {
  const { user, profile, theme } = useApp();
  const dark = theme === "dark";

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedUser, setSearchedUser] = useState<any | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "found" | "not_found">("idle");
  const [lastCheckedUsername, setLastCheckedUsername] = useState("");

  // Lists state
  const [friendsProfiles, setFriendsProfiles] = useState<any[]>([]);
  const [incomingProfiles, setIncomingProfiles] = useState<any[]>([]);
  const [outgoingProfiles, setOutgoingProfiles] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // UI messages
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // QR + connect flow
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pendingConnect, setPendingConnect] = useState<any | null>(null);
  const [connecting, setConnecting] = useState(false);

  // In-app scanner state
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanRafRef = useRef<number | null>(null);

  const buildConnectUrl = (username: string) =>
    `${window.location.origin}/network?connect=${encodeURIComponent(username)}`;
  const connectUrl = profile?.username ? buildConnectUrl(profile.username) : "";

  // ---- Resolve a handle → public user profile via the usernames index ----
  const resolveHandle = async (handle: string): Promise<any | null> => {
    const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!clean) return null;
    const unameSnap = await dbGetDoc("usernames", clean);
    if (unameSnap && unameSnap.exists()) {
      const uid = unameSnap.data()?.uid;
      if (!uid) return null;
      try {
        const uSnap = await dbGetDoc("profiles", uid);
        if (uSnap && uSnap.exists()) return uSnap.data();
      } catch (e) {
        console.warn("Profiles read failed, trying users collection", e);
      }
      // Fallback
      try {
        const userSnap = await dbGetDoc("users", uid);
        if (userSnap && userSnap.exists()) return userSnap.data();
      } catch (e) {
        console.warn("Users read failed, returning stub profile", e);
      }

      // If both read attempts failed, return a stub profile constructed from the username index
      return {
        uid: uid,
        username: clean,
        name: `@${clean}`,
        photoURL: "",
      };
    }
    return null;
  };

  // Resolves any UID to a public profile securely using fallback strategies.
  const resolveUidToPublicProfile = async (targetUid: string): Promise<any | null> => {
    // 1. Try profiles
    try {
      const snap = await dbGetDoc("profiles", targetUid);
      if (snap && snap.exists()) return snap.data();
    } catch (e) {
      console.warn("Profiles read failed in resolveUidToPublicProfile", e);
    }

    // 2. Try users fallback (authorized if friends or request is pending)
    try {
      const snap = await dbGetDoc("users", targetUid);
      if (snap && snap.exists()) return snap.data();
    } catch (e) {
      console.warn("Users read failed in resolveUidToPublicProfile, trying usernames index next", e);
    }

    // 3. Try querying usernames index by uid (allows reverse mapping without profiles)
    try {
      const q = query(collection(db, "usernames"), where("uid", "==", targetUid));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const docSnap = qSnap.docs[0];
        const data = docSnap.data();
        return {
          uid: targetUid,
          username: docSnap.id,
          name: data.name || `@${docSnap.id}`,
          photoURL: data.photoURL || "",
        };
      }
    } catch (e) {
      console.warn("Usernames query by uid failed", e);
    }

    // 4. Stub fallback
    return {
      uid: targetUid,
      username: `user_${targetUid.slice(0, 5)}`,
      name: "Unknown User",
      photoURL: "",
    };
  };

  // ---- Load friends / incoming / outgoing profiles from the current profile ----
  const loadNetworkDetails = async () => {
    if (!profile) return;
    setLoadingLists(true);
    try {
      const friendsList = profile.friends || [];
      const receivedList = profile.receivedRequests || [];
      const sentList = profile.sentRequests || [];

      // Fetch friends from users collection in batches
      const friendsRes = await dbGetDocsInBatches("users", "uid", friendsList);

      // Fetch public profiles in batches
      const incomingRes = await dbGetDocsInBatches("profiles", "uid", receivedList);
      const outgoingRes = await dbGetDocsInBatches("profiles", "uid", sentList);

      // Fallback for any UIDs that failed to fetch from public profiles
      const loadedIncomingUids = new Set(incomingRes.map(p => p.uid));
      const loadedOutgoingUids = new Set(outgoingRes.map(p => p.uid));

      const missingIncomingUids = receivedList.filter(uid => !loadedIncomingUids.has(uid));
      const missingOutgoingUids = sentList.filter(uid => !loadedOutgoingUids.has(uid));

      const incomingFallbacks = await Promise.all(
        missingIncomingUids.map(uid => resolveUidToPublicProfile(uid))
      );
      const outgoingFallbacks = await Promise.all(
        missingOutgoingUids.map(uid => resolveUidToPublicProfile(uid))
      );

      setFriendsProfiles(friendsRes);
      setIncomingProfiles([...incomingRes, ...incomingFallbacks]);
      setOutgoingProfiles([...outgoingRes, ...outgoingFallbacks]);
    } catch (err) {
      console.error("Failed to load friend network details:", err);
    } finally {
      setLoadingLists(false);
    }
  };

  // Re-derive lists whenever the live profile snapshot changes.
  useEffect(() => {
    loadNetworkDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile?.friends?.join(","),
    profile?.receivedRequests?.join(","),
    profile?.sentRequests?.join(","),
  ]);

  // Render the real, scannable QR encoding this user's connect deep-link.
  useEffect(() => {
    if (profile?.username && qrCanvasRef.current) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        buildConnectUrl(profile.username),
        { width: 176, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } },
        (error) => {
          if (error) console.error("Error rendering profile QR code:", error);
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.username]);

  // ---- Handle a `?connect=<handle>` deep-link (opened from a scanned QR) ----
  useEffect(() => {
    if (!user || !profile?.username) return;

    const params = new URLSearchParams(window.location.search);
    const urlTarget = params.get("connect");
    const target = (urlTarget || localStorage.getItem("dispute_pending_connect") || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

    // Consume the deep-link so refreshes don't reprocess it.
    if (urlTarget) {
      params.delete("connect");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    localStorage.removeItem("dispute_pending_connect");

    if (!target || target === profile.username) return;

    resolveHandle(target).then((u) => {
      if (!u) {
        setFeedbackMsg({ text: `Couldn't find @${target} to connect with.`, error: true });
        return;
      }
      if (u.uid === user.uid) return;
      if ((profile.friends || []).includes(u.uid)) {
        setFeedbackMsg({ text: `You're already connected with @${u.username}.`, error: false });
        return;
      }
      setPendingConnect(u);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.username]);

  // ---- Atomic mutual connection (used by QR scan / deep-link) ----
  const connectMutually = async (targetUid: string) => {
    if (!user) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "users", user.uid), {
      friends: arrayUnion(targetUid),
      sentRequests: arrayRemove(targetUid),
      receivedRequests: arrayRemove(targetUid),
    });
    batch.update(doc(db, "users", targetUid), {
      friends: arrayUnion(user.uid),
      sentRequests: arrayRemove(user.uid),
      receivedRequests: arrayRemove(user.uid),
    });
    await batch.commit();
  };

  const confirmPendingConnect = async () => {
    if (!pendingConnect || !user) return;
    setConnecting(true);
    setFeedbackMsg(null);
    try {
      await connectMutually(pendingConnect.uid);
      setFeedbackMsg({ text: `You're now connected with @${pendingConnect.username}! 🎉`, error: false });
      setPendingConnect(null);
    } catch (err) {
      console.error("QR connect failed:", err);
      setFeedbackMsg({ text: "Couldn't complete the connection. Please try again.", error: true });
    } finally {
      setConnecting(false);
    }
  };

  // ---- Search by handle ----
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = searchQuery.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!formatted) return;

    setSearching(true);
    setSearchStatus("idle");
    setSearchedUser(null);
    setLastCheckedUsername(formatted);
    setFeedbackMsg(null);

    try {
      const found = await resolveHandle(formatted);
      if (found) {
        setSearchedUser(found);
        setSearchStatus("found");
      } else {
        setSearchStatus("not_found");
      }
    } catch (err) {
      console.error("Error searching usernames:", err);
      setFeedbackMsg({ text: "Error searching the directory. Please try again.", error: true });
    } finally {
      setSearching(false);
    }
  };

  // ---- Send a connection request (both sides, atomically) ----
  const sendConnectionRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    setBusyUid(targetUid);
    setFeedbackMsg(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), { sentRequests: arrayUnion(targetUid) });
      batch.update(doc(db, "users", targetUid), { receivedRequests: arrayUnion(user.uid) });
      await batch.commit();
      setFeedbackMsg({ text: `Connection request sent to @${searchedUser?.username}!`, error: false });
    } catch (err) {
      console.error("Request dispatch failed:", err);
      setFeedbackMsg({ text: "Could not send the connection request. Please try again.", error: true });
    } finally {
      setBusyUid(null);
    }
  };

  // ---- Accept an inbound request (both sides, atomically) ----
  const acceptConnectionRequest = async (senderUid: string) => {
    if (!user || !profile) return;
    setBusyUid(senderUid);
    setFeedbackMsg(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), {
        receivedRequests: arrayRemove(senderUid),
        friends: arrayUnion(senderUid),
      });
      batch.update(doc(db, "users", senderUid), {
        sentRequests: arrayRemove(user.uid),
        friends: arrayUnion(user.uid),
      });
      await batch.commit();
      setFeedbackMsg({
        text: "You're now connected! You can add each other to splitting groups.",
        error: false,
      });
    } catch (err) {
      console.error("Accept failed:", err);
      setFeedbackMsg({ text: "Failed to accept the connection request. Please try again.", error: true });
    } finally {
      setBusyUid(null);
    }
  };

  // ---- Decline an inbound request (both sides, atomically) ----
  const declineConnectionRequest = async (senderUid: string) => {
    if (!user || !profile) return;
    setBusyUid(senderUid);
    setFeedbackMsg(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), { receivedRequests: arrayRemove(senderUid) });
      batch.update(doc(db, "users", senderUid), { sentRequests: arrayRemove(user.uid) });
      await batch.commit();
      setFeedbackMsg({ text: "Connection request declined.", error: false });
    } catch (err) {
      console.error("Decline failure:", err);
      setFeedbackMsg({ text: "Failed to decline the request. Please try again.", error: true });
    } finally {
      setBusyUid(null);
    }
  };

  // ---- Cancel an outbound request (both sides, atomically) ----
  const cancelOutgoingRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    setBusyUid(targetUid);
    setFeedbackMsg(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", user.uid), { sentRequests: arrayRemove(targetUid) });
      batch.update(doc(db, "users", targetUid), { receivedRequests: arrayRemove(user.uid) });
      await batch.commit();
      setFeedbackMsg({ text: "Outbound request cancelled.", error: false });
    } catch (err) {
      console.error("Cancel failure:", err);
      setFeedbackMsg({ text: "Failed to cancel the request. Please try again.", error: true });
    } finally {
      setBusyUid(null);
    }
  };

  // ---- In-app QR scanner (progressive enhancement via BarcodeDetector) ----
  const extractHandle = (raw: string): string | null => {
    if (!raw) return null;
    let val = raw.trim();
    try {
      const parsed = new URL(val);
      const c = parsed.searchParams.get("connect");
      if (c) val = c;
    } catch {
      /* not a URL — treat the raw value as a handle */
    }
    val = val.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    return val || null;
  };

  const stopScan = () => {
    if (scanRafRef.current) {
      cancelAnimationFrame(scanRafRef.current);
      scanRafRef.current = null;
    }
    if (scanStreamRef.current) {
      scanStreamRef.current.getTracks().forEach((t) => t.stop());
      scanStreamRef.current = null;
    }
    setScanOpen(false);
  };

  const handleScannedValue = async (raw: string) => {
    stopScan();
    const handle = extractHandle(raw);
    if (!handle) {
      setFeedbackMsg({ text: "That QR code doesn't contain a valid Dispute handle.", error: true });
      return;
    }
    if (handle === profile?.username) {
      setFeedbackMsg({ text: "That's your own QR code 🙂", error: true });
      return;
    }
    const u = await resolveHandle(handle);
    if (!u) {
      setFeedbackMsg({ text: `No Dispute account found for @${handle}.`, error: true });
      return;
    }
    if (u.uid === user?.uid) return;
    if ((profile?.friends || []).includes(u.uid)) {
      setFeedbackMsg({ text: `You're already connected with @${u.username}.`, error: false });
      return;
    }
    setPendingConnect(u);
  };

  const startScan = async () => {
    setScanError(null);
    setScanOpen(true);
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) {
      setScanError(
        "In-app scanning isn't supported by this browser. Point your phone's camera at the QR code instead — it opens a connect link directly."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      scanStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || !scanStreamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length) {
            handleScannedValue(codes[0].rawValue || "");
            return; // stop after first successful decode
          }
        } catch {
          /* transient detect error — keep polling */
        }
        scanRafRef.current = requestAnimationFrame(tick);
      };
      scanRafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error("Camera error:", err);
      setScanError(
        "Couldn't access the camera. Grant camera permission, or scan the QR with your phone's camera app."
      );
    }
  };

  // Always release the camera when leaving the page.
  useEffect(() => {
    return () => stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Share helpers ----
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(text);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const downloadQr = () => {
    if (!qrCanvasRef.current) return;
    const url = qrCanvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispute-${profile?.username || "qr"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const shareConnect = async () => {
    if ((navigator as any).share && connectUrl) {
      try {
        await (navigator as any).share({
          title: "Connect with me on Dispute",
          text: `Add me on Dispute: @${profile?.username}`,
          url: connectUrl,
        });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      copyToClipboard(connectUrl);
    }
  };

  const textInvite = `Hey! Join me on Dispute, a premium expense-splitting platform for roommates and trips! Sign up and connect with my handle @${profile?.username || "ledger"} so we can settle expenses easily. Get it here: ${window.location.origin}`;

  const relationOf = (uid?: string) => {
    if (!uid || !profile) return "none";
    if ((profile.friends || []).includes(uid)) return "friend";
    if ((profile.sentRequests || []).includes(uid)) return "outgoing";
    if ((profile.receivedRequests || []).includes(uid)) return "incoming";
    if (uid === user?.uid) return "self";
    return "none";
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">

      {/* Upper header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 dark:border-white/5 pb-8">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-gray-400 font-mono tracking-widest uppercase">Connection Core</span>
          <h1 className="font-sans font-black text-3.5xl tracking-tight leading-none uppercase flex items-center gap-2">
            Friends & Network
            <FontAwesomeIcon icon={faGlobe} className="text-cyan-400 text-2xl" />
          </h1>
          <p className="text-sm text-gray-500 leading-normal max-w-xl">
            Search unique handles, send follow requests, and accept connections. Only mutually connected users are eligible to join sharing groups.
          </p>
        </div>

        <button
          onClick={startScan}
          className={`self-start md:self-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider cursor-pointer transition-colors ${
            dark ? "bg-cyan-500 text-black hover:bg-cyan-400" : "bg-black text-white hover:bg-slate-800"
          }`}
        >
          <Camera className="w-4 h-4" />
          Scan a QR
        </button>
      </div>

      {/* Pending connect confirmation (from a scanned QR / deep-link) */}
      {pendingConnect && (
        <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          dark ? "bg-cyan-500/5 border-cyan-500/30" : "bg-cyan-50 border-cyan-200"
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center font-bold font-mono">
              {pendingConnect.photoURL ? (
                <img src={pendingConnect.photoURL} alt={pendingConnect.name} referrerPolicy="no-referrer" />
              ) : (
                <span>{pendingConnect.name?.[0]?.toUpperCase()}</span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-500">QR connection</span>
              <span className="text-sm font-bold">{pendingConnect.name} {pendingConnect.surname || ""}</span>
              <span className="text-xs text-cyan-500 font-mono">@{pendingConnect.username}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={confirmPendingConnect}
              disabled={connecting}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold cursor-pointer disabled:opacity-50 ${
                dark ? "bg-emerald-500 text-black hover:bg-emerald-400" : "bg-emerald-600 text-white hover:bg-emerald-500"
              }`}
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              CONNECT
            </button>
            <button
              onClick={() => setPendingConnect(null)}
              disabled={connecting}
              className="px-4 py-2 border border-gray-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-xs font-mono cursor-pointer disabled:opacity-50"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT TWO COLUMNS: SEARCH & REQUESTS */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* SEARCH PROFILES CARD */}
          <div className={`p-6 rounded-2xl border transition-colors ${
            dark ? "bg-slate-900/45 border-white/10" : "bg-white border-slate-200"
          }`}>
            <h3 className="text-sm font-bold uppercase tracking-wider font-mono mb-4 text-gray-400 flex items-center gap-1.5">
              Search Accounts By handle
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-gray-400 text-xs" />
            </h3>

            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-gray-400">@</span>
                <input
                  type="text"
                  required
                  placeholder="enter username (e.g. rohan_00)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  className={`w-full text-xs py-3 pl-8 pr-4 rounded-xl border focus:outline-none transition-all ${
                    dark
                      ? "bg-slate-950/60 border-white/10 focus:border-cyan-500 text-white"
                      : "bg-slate-50 border-slate-200 focus:border-black text-slate-800"
                  }`}
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className={`px-5 py-3 rounded-xl font-bold font-mono text-xs tracking-wider uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                  dark
                    ? "bg-cyan-500 text-black hover:bg-cyan-400"
                    : "bg-black text-white hover:bg-slate-800"
                }`}
              >
                <Search className="w-4 h-4" />
                <span>{searching ? "SEARCHING..." : "FIND"}</span>
              </button>
            </form>

            {/* SEARCH RESULT */}
            <div className="mt-6">
              {searchStatus === "found" && searchedUser && (
                <div className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  dark ? "bg-slate-950/60 border-white/10" : "bg-slate-50 border-gray-150"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center font-bold font-mono">
                      {searchedUser.photoURL ? (
                        <img src={searchedUser.photoURL} alt={searchedUser.name} referrerPolicy="no-referrer" />
                      ) : (
                        <span>{searchedUser.name?.[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold leading-none font-sans">{searchedUser.name} {searchedUser.surname || ""}</span>
                      <span className="text-xs text-cyan-500 font-mono mt-0.5">@{searchedUser.username}</span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {relationOf(searchedUser.uid) === "friend" || relationOf(searchedUser.uid) === "self"
                          ? (searchedUser.upiId || "No UPI linked")
                          : "Connect to view UPI"}
                      </span>
                    </div>
                  </div>

                  {/* Actions based on relationship (driven by the live profile) */}
                  <div>
                    {relationOf(searchedUser.uid) === "self" ? (
                      <span className="text-xs text-gray-400 font-mono font-bold">[ THIS IS YOU ]</span>
                    ) : relationOf(searchedUser.uid) === "friend" ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 font-mono font-semibold">
                        <Check className="w-3.5 h-3.5" /> VERIFIED CONNECTION
                      </span>
                    ) : relationOf(searchedUser.uid) === "outgoing" ? (
                      <button
                        onClick={() => cancelOutgoingRequest(searchedUser.uid)}
                        disabled={busyUid === searchedUser.uid}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-yellow-500/10 text-yellow-500 font-mono cursor-pointer hover:bg-yellow-500/20 disabled:opacity-50"
                      >
                        <Clock className="w-3.5 h-3.5" /> REQUEST SENT · CANCEL
                      </button>
                    ) : relationOf(searchedUser.uid) === "incoming" ? (
                      <button
                        onClick={() => acceptConnectionRequest(searchedUser.uid)}
                        disabled={busyUid === searchedUser.uid}
                        className={`px-4 py-2 rounded-lg text-xs font-mono font-bold cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 ${
                          dark ? "bg-emerald-500 text-black hover:bg-emerald-400" : "bg-emerald-600 text-white hover:bg-emerald-500"
                        }`}
                      >
                        [ ACCEPT INBOUND CONNECTION ]
                      </button>
                    ) : (
                      <button
                        onClick={() => sendConnectionRequest(searchedUser.uid)}
                        disabled={busyUid === searchedUser.uid}
                        className={`flex items-center gap-1.5 px-4 py-2 border rounded-lg text-xs font-mono font-bold cursor-pointer disabled:opacity-50 ${
                          dark
                            ? "border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/15"
                            : "border-black bg-black text-white hover:bg-slate-800"
                        }`}
                      >
                        {busyUid === searchedUser.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus2 className="w-3.5 h-3.5" />}
                        <span>FOLLOW & CONNECT</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {searchStatus === "not_found" && (
                <div className={`p-6 rounded-xl border ${
                  dark ? "bg-red-500/5 border-red-500/10" : "bg-red-50 border-red-100"
                }`}>
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-bold font-mono uppercase text-red-500">No account linked to @{lastCheckedUsername}</p>
                      <p className={`text-xs mt-1 leading-relaxed ${dark ? "text-slate-400" : "text-slate-600"}`}>
                        This user isn't on the platform yet. Send them an invite so they can set up their UPI address and coordinate split-settlements!
                      </p>

                      <div className="mt-4 flex flex-col gap-2">
                        <span className="text-[10px] font-mono uppercase text-gray-400">Invite SMS/WhatsApp Template:</span>
                        <div className={`p-3 rounded-lg border text-xs font-sans leading-relaxed break-all font-medium ${
                          dark ? "bg-slate-950/60 border-white/5 text-slate-300" : "bg-white border-slate-200 text-slate-700"
                        }`}>
                          {textInvite}
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(textInvite)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-500/10 hover:bg-gray-500/20 text-xs font-mono self-start cursor-pointer transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedIndex === textInvite ? "COPIED!" : "COPY CONNECTION INVITE"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {feedbackMsg && (
              <div className={`mt-4 p-4 rounded-xl border text-xs font-mono flex items-start gap-2 ${
                feedbackMsg.error
                  ? "bg-red-500/5 border-red-500/10 text-red-400"
                  : "bg-emerald-500/5 border-emerald-500/20 text-emerald-500"
              }`}>
                {feedbackMsg.error ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <Check className="w-4 h-4 shrink-0 mt-0.5" />}
                <span>{feedbackMsg.text}</span>
              </div>
            )}
          </div>

          {/* INCOMING REQUESTS BOARD */}
          <div className={`p-6 rounded-2xl border transition-colors ${
            dark ? "bg-slate-900/45 border-white/10" : "bg-white border-slate-200"
          }`}>
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-white/5">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-gray-400">Incoming Connection Requests</h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                incomingProfiles.length > 0 ? "bg-yellow-500/10 text-yellow-500 animate-pulse" : "bg-gray-500/10 text-gray-400"
              }`}>
                {incomingProfiles.length} REQUESTS
              </span>
            </div>

            {incomingProfiles.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 font-mono text-center">No pending inbound network follow requests.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {incomingProfiles.map((reqUser) => (
                  <div
                    key={reqUser.uid}
                    className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                      dark ? "bg-slate-950/60 border-white/5" : "bg-slate-50 border-slate-150"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full font-mono text-xs bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                        {reqUser.photoURL ? (
                          <img src={reqUser.photoURL} alt={reqUser.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span>{reqUser.name?.[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">{reqUser.name} {reqUser.surname || ""}</span>
                        <span className="text-[10px] text-cyan-400 font-mono">@{reqUser.username}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => acceptConnectionRequest(reqUser.uid)}
                        disabled={busyUid === reqUser.uid}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer disabled:opacity-50 ${
                          dark ? "bg-emerald-500 text-black hover:bg-emerald-400" : "bg-emerald-600 text-white hover:bg-emerald-500"
                        }`}
                      >
                        {busyUid === reqUser.uid ? "..." : "ACCEPT"}
                      </button>
                      <button
                        onClick={() => declineConnectionRequest(reqUser.uid)}
                        disabled={busyUid === reqUser.uid}
                        className="px-3 py-1.5 border border-red-500/20 hover:bg-red-500/10 text-red-400 rounded-lg text-xs font-mono cursor-pointer disabled:opacity-50"
                      >
                        DECLINE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* OUTGOING (PENDING) REQUESTS */}
          {outgoingProfiles.length > 0 && (
            <div className={`p-6 rounded-2xl border transition-colors ${
              dark ? "bg-slate-900/45 border-white/10" : "bg-white border-slate-200"
            }`}>
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-white/5">
                <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-gray-400">Pending Sent Requests</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500">
                  {outgoingProfiles.length} AWAITING
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {outgoingProfiles.map((reqUser) => (
                  <div
                    key={reqUser.uid}
                    className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                      dark ? "bg-slate-950/60 border-white/5" : "bg-slate-50 border-slate-150"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full font-mono text-xs bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                        {reqUser.photoURL ? (
                          <img src={reqUser.photoURL} alt={reqUser.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span>{reqUser.name?.[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold">{reqUser.name} {reqUser.surname || ""}</span>
                        <span className="text-[10px] text-cyan-400 font-mono">@{reqUser.username}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => cancelOutgoingRequest(reqUser.uid)}
                      disabled={busyUid === reqUser.uid}
                      className="px-3 py-1.5 border border-gray-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-xs font-mono cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" /> {busyUid === reqUser.uid ? "..." : "CANCEL"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: VERIFIED DIRECTORY + QR */}
        <div className="flex flex-col gap-6">

          {/* VERIFIED CONNECTIONS */}
          <div className={`p-6 rounded-2xl border transition-colors ${
            dark ? "bg-slate-900/45 border-white/10" : "bg-white border-slate-200"
          }`}>
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-white/5">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-gray-400">My Connections</h3>
              <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full font-bold">
                {friendsProfiles.length} VERIFIED
              </span>
            </div>

            {loadingLists ? (
              <div className="flex py-8 items-center justify-center">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : friendsProfiles.length === 0 ? (
              <div className="text-center py-8 flex flex-col gap-3 justify-center items-center">
                <Users className="w-8 h-8 text-slate-500" />
                <p className="text-xs text-gray-400 max-w-sm px-4 leading-relaxed font-mono">
                  You don't have any verified network connections yet. Search usernames to follow your friends, or share your QR to connect instantly!
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 max-h-[350px] overflow-y-auto pr-1">
                {friendsProfiles.map((fUser) => (
                  <div
                    key={fUser.uid}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      dark ? "bg-slate-950/60 border-white/5" : "bg-slate-50 border-slate-150"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center font-mono text-xs overflow-hidden shrink-0">
                        {fUser.photoURL ? (
                          <img src={fUser.photoURL} alt={fUser.name} referrerPolicy="no-referrer" />
                        ) : (
                          <span>{fUser.name?.[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold truncate leading-tight">{fUser.name} {fUser.surname || ""}</span>
                        <span className="text-[10px] text-cyan-400 font-mono leading-none mt-1">@{fUser.username}</span>
                        <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">UPI: {fUser.upiId || "not linked"}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Verified Connected" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MY UNIQUE QR PROFILE */}
          <div className={`p-6 rounded-2xl border transition-colors ${
            dark ? "bg-slate-900/45 border-white/10 text-white" : "bg-stone-50 border-slate-200"
          }`}>
            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-white/5 pb-3 mb-4">
              <QrCode className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold font-mono tracking-widest uppercase">My Active QR Profile</h4>
            </div>

            <div className="flex flex-col items-center justify-center text-center p-1">
              <div className="p-3 rounded-2xl border mb-3 bg-white border-slate-200">
                {profile?.username ? (
                  <canvas ref={qrCanvasRef} className="w-44 h-44 block" />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-[10px] font-mono text-gray-400 text-center px-4">
                    Set a username in your profile to generate your QR.
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold uppercase">{profile?.name}</span>
                <span className="text-xs text-cyan-400 font-mono font-bold">@{profile?.username}</span>
                <span className="text-[10px] text-gray-500 font-mono mt-1 select-all">{profile?.upiId || "No UPI linked"}</span>
              </div>

              <p className="text-[10px] text-gray-400 font-mono mt-3 leading-relaxed px-2">
                Let a friend scan this with their phone camera (or the “Scan a QR” button) to connect instantly.
              </p>

              {profile?.username && (
                <div className="grid grid-cols-3 gap-2 w-full mt-4">
                  <button
                    onClick={() => copyToClipboard(connectUrl)}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-[10px] font-mono cursor-pointer transition-colors"
                  >
                    <Link2 className="w-4 h-4" />
                    {copiedIndex === connectUrl ? "COPIED" : "LINK"}
                  </button>
                  <button
                    onClick={downloadQr}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-[10px] font-mono cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    SAVE
                  </button>
                  <button
                    onClick={shareConnect}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-[10px] font-mono cursor-pointer transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    SHARE
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* SCANNER MODAL */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={stopScan}>
          <div
            className={`w-full max-w-md rounded-2xl border p-6 flex flex-col gap-4 ${
              dark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" /> Scan a friend's QR
              </h3>
              <button onClick={stopScan} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {scanError ? (
              <div className={`p-4 rounded-xl text-xs font-mono leading-relaxed flex items-start gap-2 ${
                dark ? "bg-yellow-500/10 text-yellow-300 border border-yellow-500/20" : "bg-yellow-50 text-yellow-700 border border-yellow-200"
              }`}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <div className="absolute inset-8 border-2 border-cyan-400/80 rounded-xl pointer-events-none" />
              </div>
            )}

            <p className="text-[10px] text-gray-400 font-mono text-center leading-relaxed">
              Point the camera at a Dispute QR. As soon as it's recognised you'll be asked to confirm the connection.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
