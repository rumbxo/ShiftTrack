import { redirect } from "next/navigation";
import { getOrganizationContext, OrganizationServiceError } from "@/lib/organizations/server";
import { OrganizationUnavailable } from "@/components/organizations/organization-unavailable";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let context;
  try { context = await getOrganizationContext(); }
  catch (error) {
    if (error instanceof OrganizationServiceError) return <OrganizationUnavailable setupRequired={error.code === "setup-required"} />;
    throw error;
  }
  if (!context.user) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  return children;
}
