import { Dashboard } from "@/components/dashboard";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/user";

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const fullName = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name.trim().slice(0, 80) : "";
  return <Dashboard user={{ id: user.id, email: user.email ?? "", name: fullName || user.email?.split("@")[0] || "Teammate" }} />;
}
