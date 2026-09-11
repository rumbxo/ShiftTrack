"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Sign-out failed");
      try { localStorage.setItem("shifttrack-auth-change", crypto.randomUUID()); } catch { /* Cookie sign-out does not require local storage. */ }
      window.location.replace("/login");
    } catch {
      setError("Couldn’t sign out. Please try again.");
      setPending(false);
    }
  }

  return <div><button className="nav-item" onClick={signOut} disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={19} /> : <LogOut size={19} />}{pending ? "Signing out…" : "Sign out"}</button>{error && <p className="sign-out-error" role="alert">{error}</p>}</div>;
}
