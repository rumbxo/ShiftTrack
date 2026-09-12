import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthIdentitySync } from "@/components/auth/auth-identity-sync";
import { OnboardingForm } from "@/components/organizations/onboarding-form";
import { OrganizationUnavailable } from "@/components/organizations/organization-unavailable";
import { getOrganizationContext, OrganizationServiceError } from "@/lib/organizations/server";

export const metadata = { title: "Create your workspace | ShiftTrack" };

export default async function OnboardingPage() {
  let context;
  try { context = await getOrganizationContext(); }
  catch (error) {
    if (error instanceof OrganizationServiceError) return <OrganizationUnavailable setupRequired={error.code === "setup-required"} />;
    throw error;
  }
  if (!context.user) redirect("/login");
  if (context.organization) redirect("/dashboard");
  return <AuthShell><AuthIdentitySync userId={context.user.id} organization={null} /><OnboardingForm email={context.user.email ?? "your registered email"} /></AuthShell>;
}
