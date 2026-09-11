"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Eye, EyeOff, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AuthMode = "login" | "register" | "forgot-password" | "reset-password";

const subscribeToHydration = () => () => {};

const copy = {
  login: { eyebrow: "A FAMILIAR PLACE", title: "Welcome back.", subtitle: "A little clarity for the day ahead. Log in to your account.", button: "Log in", pending: "Logging in…" },
  register: { eyebrow: "YOUR NEXT CHAPTER", title: "A smoother shift starts here.", subtitle: "Create your account and give your team a little more clarity.", button: "Create account", pending: "Creating your account…" },
  "forgot-password": { eyebrow: "LET’S GET YOU BACK IN", title: "Forgot your password?", subtitle: "It happens. Enter your email and we’ll send you a reset link.", button: "Send reset link", pending: "Sending your link…" },
  "reset-password": { eyebrow: "A FRESH START", title: "Choose a new password.", subtitle: "Make it something secure that you haven’t used before.", button: "Save new password", pending: "Saving your password…" },
};

export function AuthForm({ mode, initialError = "", initialMessage = "", next = "/dashboard" }: { mode: AuthMode; initialError?: string; initialMessage?: string; next?: string }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState(initialMessage);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const content = copy[mode];
  const hasPassword = mode !== "forgot-password";
  const hasConfirmation = mode === "register" || mode === "reset-password";
  const disabled = pending || !hydrated;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    setError("");
    setMessage("");

    if (hasConfirmation && password !== confirmPassword) {
      setError("Your passwords don’t match. Please enter them again.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(form.get("name") ?? "").trim(), email, password, confirmPassword, next }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Something went wrong. Please try again.");
        return;
      }

      if (result.redirectTo === "/dashboard" || result.redirectTo === "/reset-password" || result.redirectTo === "/login?message=password-updated") {
        try { localStorage.setItem("shifttrack-auth-change", crypto.randomUUID()); } catch { /* Login also works without local storage. */ }
        // A fresh document clears any cached view of the previous auth session.
        window.location.assign(result.redirectTo);
        return;
      }

      setSubmittedEmail(email);
      setMessage(result.message || "Check your email for the next step.");
      setComplete(true);
    } catch {
      setError("We couldn’t connect. Check your internet connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (complete) {
    return <div className="auth-confirmation"><span className="auth-mail-icon"><Mail size={30} strokeWidth={1.5} /></span><div className="eyebrow">ONE MORE SMALL STEP</div><h1>Check your inbox.</h1><p className="auth-subtitle" role="status">{message}</p>{submittedEmail && <strong className="auth-email">{submittedEmail}</strong>}<p className="auth-fine-print">Check your spam folder too. Open the link in this browser to continue.</p><Button asChild className="auth-submit"><Link href="/login">Back to login<ArrowRight size={16} /></Link></Button><button className="auth-text-button" onClick={() => { setComplete(false); setMessage(""); }}>Use a different email</button></div>;
  }

  return <>
    {(mode === "forgot-password" || mode === "reset-password") && <Link className="auth-back" href="/login"><ArrowLeft size={14} />Back to login</Link>}
    <div className="eyebrow">{content.eyebrow}</div>
    <h1 className="auth-title">{content.title}</h1>
    <p className="auth-subtitle">{content.subtitle}</p>
    {message && <div className="auth-message" role="status"><Check size={17} /><span>{message}</span></div>}
    <noscript><p className="auth-error">Enable JavaScript to use the account forms.</p></noscript>
    <form className="auth-form" method="post" action={`/api/auth/${mode}`} onSubmit={submit}>
      {mode === "register" && <label htmlFor="full-name">Full name<Input id="full-name" name="name" autoComplete="name" placeholder="Ahmand Edmonds" required minLength={2} maxLength={80} disabled={disabled} /></label>}
      {mode !== "reset-password" && <label htmlFor="email">Email address<Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} disabled={disabled} /></label>}
      {hasPassword && <label htmlFor="password">{mode === "reset-password" ? "New password" : "Password"}<span className="auth-password-input"><Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"} required minLength={mode === "login" ? 1 : 8} maxLength={128} aria-describedby={hasConfirmation ? "password-hint" : undefined} disabled={disabled} /><button type="button" disabled={disabled} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
      {hasConfirmation && <><p id="password-hint" className="auth-password-hint">Use at least 8 characters. A longer, unique password is best.</p><label htmlFor="confirm-password">Confirm password<Input id="confirm-password" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Enter your password again" required minLength={8} maxLength={128} disabled={disabled} /></label></>}
      {mode === "login" && <Link className="auth-forgot" href="/forgot-password">Forgot password?</Link>}
      {error && <div className="auth-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
      <Button className="auth-submit" type="submit" disabled={disabled}>{pending ? <><LoaderCircle className="auth-spinner" size={17} />{content.pending}</> : <>{content.button}<ArrowRight size={17} /></>}</Button>
    </form>
    {mode === "login" && <p className="auth-switch">New to ShiftTrack? <Link href="/register">Create an account</Link></p>}
    {mode === "register" && <p className="auth-switch">Already have an account? <Link href="/login">Log in</Link></p>}
  </>;
}
