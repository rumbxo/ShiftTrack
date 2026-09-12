"use client";

import { useState, useSyncExternalStore } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { pauseIdentityChecks } from "@/lib/auth/identity-mutation";

const subscribe = () => () => {};

export function SignOutButton() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError("");
    const resumeChecks = pauseIdentityChecks();
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Sign-out failed");
      try { localStorage.setItem("shifttrack-auth-change", crypto.randomUUID()); } catch { /* Cookie sign-out does not require local storage. */ }
      window.location.replace("/login");
    } catch {
      resumeChecks();
      setError("Couldn’t sign out. Please try again.");
      setPending(false);
    }
  }

  return <div><button className="nav-item" onClick={signOut} disabled={pending || !hydrated}>{pending ? <LoaderCircle className="auth-spinner" size={19} /> : <LogOut size={19} />}{pending ? "Signing out…" : "Sign out"}</button>{error && <p className="sign-out-error" role="alert">{error}</p>}</div>;
}
