"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, LoaderCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { pauseIdentityChecks } from "@/lib/auth/identity-mutation";

const subscribe = () => () => {};

export function OnboardingForm({ email }: { email: string }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const resumeChecks = pauseIdentityChecks();
    let navigating = false;
    try {
      const response = await fetch("/api/organizations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(data.get("name") ?? "").trim() }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "We couldn’t create your workspace. Please try again.");
        return;
      }
      try { localStorage.setItem("shifttrack-organization-change", crypto.randomUUID()); } catch { /* Persistence does not depend on browser storage. */ }
      navigating = true;
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("We couldn’t connect. Check your connection and try again.");
    } finally { if (!navigating) resumeChecks(); setPending(false); }
  }

  return <>
    <span className="auth-mail-icon"><Building2 size={29} strokeWidth={1.5} /></span>
    <div className="eyebrow">A PLACE FOR YOUR TEAM</div>
    <h1>Create your workspace.</h1>
    <p className="auth-subtitle">Give your organization a home. You’ll be its owner and can add teammates once it’s ready.</p>
    <form className="auth-form" method="post" action="/api/organizations" onSubmit={createWorkspace}>
      <label htmlFor="organization-name">Organization name<Input id="organization-name" name="name" autoComplete="organization" placeholder="e.g. Oak Street Group Home" required minLength={1} maxLength={120} disabled={pending || !hydrated} /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <Button className="auth-submit" type="submit" disabled={pending || !hydrated}>{pending ? <>Creating workspace…<LoaderCircle className="auth-spinner" size={16} /></> : <>Create workspace<ArrowRight size={16} /></>}</Button>
    </form>
    <div className="onboarding-team-note"><Users size={18} /><div><strong>Joining an existing team?</strong><p>Ask its owner to add <b>{email}</b> from Workspace settings. Then check your access below. Each account belongs to one workspace.</p><Button variant="outline" size="sm" onClick={() => { router.replace("/dashboard"); router.refresh(); }}>Check my access</Button></div></div>
    <SignOutButton />
  </>;
}
