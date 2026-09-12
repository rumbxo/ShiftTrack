import { redirect } from "next/navigation";
import { WorkspaceSettings } from "@/components/organizations/workspace-settings";
import { OrganizationUnavailable } from "@/components/organizations/organization-unavailable";
import { getOrganizationContext, getOrganizationMembers, OrganizationServiceError } from "@/lib/organizations/server";

export const metadata = { title: "Workspace settings | ShiftTrack" };

export default async function WorkspacePage() {
  let context;
  try { context = await getOrganizationContext(); }
  catch (error) {
    if (error instanceof OrganizationServiceError) return <OrganizationUnavailable setupRequired={error.code === "setup-required"} />;
    throw error;
  }
  if (!context.user) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  let members;
  try { members = await getOrganizationMembers(context.organization.id); }
  catch (error) {
    if (error instanceof OrganizationServiceError) return <OrganizationUnavailable setupRequired={error.code === "setup-required"} />;
    throw error;
  }
  return <WorkspaceSettings userId={context.user.id} organization={context.organization} members={members} />;
}
