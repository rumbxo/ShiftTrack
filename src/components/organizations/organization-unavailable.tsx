import { Building2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { RetryWorkspaceButton } from "@/components/organizations/retry-button";

export function OrganizationUnavailable({ setupRequired = false }: { setupRequired?: boolean }) {
  return <AuthShell>
    <span className="auth-mail-icon"><Building2 size={28} /></span>
    <div className="eyebrow">YOUR WORKSPACE</div>
    <h1>{setupRequired ? "One setup step remains." : "We couldn’t load your workspace."}</h1>
    <p className="auth-subtitle" role="alert">{setupRequired
      ? "Your account is ready. The workspace administrator needs to finish the database setup before you can create or join a workspace."
      : "Your workspace is temporarily unavailable. Try again in a moment."}</p>
    {setupRequired && <p className="auth-fine-print">Setting up ShiftTrack? Follow the workspace migration instructions in the project README, then return here.</p>}
    <RetryWorkspaceButton />
    <SignOutButton />
  </AuthShell>;
}
