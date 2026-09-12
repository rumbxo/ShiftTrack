import { Dashboard } from "@/components/dashboard";
import { redirect } from "next/navigation";
import { getOrganizationContext, OrganizationServiceError } from "@/lib/organizations/server";
import { OrganizationUnavailable } from "@/components/organizations/organization-unavailable";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { RetryWorkspaceButton } from "@/components/organizations/retry-button";
import { getTaskSnapshot, TaskServiceError } from "@/lib/tasks/server";

export default async function DashboardPage() {
  let context;
  try { context = await getOrganizationContext(); }
  catch (error) {
    if (error instanceof OrganizationServiceError) return <OrganizationUnavailable setupRequired={error.code === "setup-required"} />;
    throw error;
  }
  const { user, organization } = context;
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");
  let initialData;
  try { initialData = await getTaskSnapshot(); }
  catch (error) {
    if (!(error instanceof TaskServiceError)) throw error;
    if (error.code === "unauthenticated") redirect("/login");
    if (error.code === "organization-required") redirect("/onboarding");
    return <AuthShell>
      <div className="eyebrow">YOUR WORKSPACE</div>
      <h1>{error.code === "setup-required" ? "One task setup step remains." : "We couldn’t load your tasks."}</h1>
      <p className="auth-subtitle" role="alert">{error.code === "setup-required"
        ? "Your workspace is ready. Its administrator needs to finish the task database setup before you can use the dashboard."
        : "Your saved tasks are temporarily unavailable. Please try again in a moment."}</p>
      {error.code === "setup-required" && <p className="auth-fine-print">Setting up ShiftTrack? Apply the task migration in the project README, then return here.</p>}
      <RetryWorkspaceButton />
      <SignOutButton />
    </AuthShell>;
  }
  const fullName = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name.trim().slice(0, 80) : "";
  return <Dashboard key={`${user.id}:${organization.membershipId}:${organization.role}`} initialData={initialData} organization={organization} user={{ id: user.id, email: user.email ?? "", name: fullName || user.email?.split("@")[0] || "Teammate" }} />;
}
