/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { auth } from "../lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { Loader2, ArrowLeft } from "lucide-react";
import { EquarisLogo } from "../components/EquarisLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Standard multi-colour Google mark for the OAuth button. */
const GoogleG = () => (
  <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
  </svg>
);

interface LoginPageProps {
  mode: "signin" | "signup";
}

export const LoginPage: React.FC<LoginPageProps> = ({ mode }) => {
  const { navigate } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const getFriendlyError = (err: any): string => {
    const code: string = err?.code || "";
    const map: Record<string, string> = {
      "auth/user-not-found": "No account found with this email address.",
      "auth/wrong-password": "Incorrect password. Please try again.",
      "auth/invalid-credential": "Invalid email or password. Please check your credentials.",
      "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
      "auth/network-request-failed": "Network error. Check your internet connection.",
      "auth/unauthorized-domain": "This domain is not authorised for sign-in.",
    };
    return map[code] || err?.message || "Authentication failed. Please try again.";
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setAuthError("Email is required.");
    if (!password.trim()) return setAuthError("Password is required.");
    if (mode === "signup" && !username.trim()) return setAuthError("Your name is required to create an account.");
    
    if (mode === "signup") {
      if (password.length < 8) {
        return setAuthError("Password must be at least 8 characters long.");
      }
      if (!/[A-Z]/.test(password)) {
        return setAuthError("Password must contain at least one uppercase letter.");
      }
      if (!/[a-z]/.test(password)) {
        return setAuthError("Password must contain at least one lowercase letter.");
      }
      if (!/[0-9]/.test(password)) {
        return setAuthError("Password must contain at least one number.");
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return setAuthError("Password must contain at least one special character.");
      }
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (username.trim()) await updateProfile(cred.user, { displayName: username.trim() });
      }
      navigate("/dashboard");
    } catch (err: any) {
      setAuthError(getFriendlyError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate("/dashboard");
    } catch (err: any) {
      setAuthError(getFriendlyError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col items-center justify-center p-6 relative">
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 flex items-center justify-center cursor-pointer transition-all gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        <span className="hidden md:inline">Back to Home</span>
      </button>

      <div className="w-full max-w-md bg-card rounded-3xl border shadow-lg p-8 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex items-center gap-2.5 text-primary">
            <EquarisLogo className="h-10 w-auto" />
            <span className="font-heading text-2xl font-bold tracking-tight">Equaris</span>
          </div>
          <h1 className="text-xl font-bold mt-2">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to track splits and settle up with your people."
              : "Start splitting expenses fairly in seconds — it's free."}
          </p>
        </div>

        <Button
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={authLoading}
          className="w-full cursor-pointer gap-2 py-5 rounded-xl border-border hover:bg-muted"
        >
          <GoogleG />
          Continue with Google
        </Button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
          {mode === "signup" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-name">Name</Label>
              <Input
                id="auth-name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                className="py-5 px-4 rounded-xl"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="py-5 px-4 rounded-xl"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="py-5 px-4 rounded-xl"
            />
            {mode === "signup" && (
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                Must be at least 8 characters with an uppercase letter, a lowercase letter, a number, and a symbol (required for 2FA).
              </p>
            )}
          </div>

          {authError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={authLoading} className="w-full cursor-pointer py-5 rounded-xl text-base mt-2">
            {authLoading ? <Loader2 className="animate-spin mr-2" /> : null}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-2">
          {mode === "signin" ? "New to Equaris?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              navigate(mode === "signin" ? "/signup" : "/login");
              setAuthError(null);
            }}
            className="cursor-pointer font-medium text-primary hover:underline"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
};
