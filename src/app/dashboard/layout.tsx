import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/user";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await getAuthenticatedUser())) redirect("/login");
  return children;
}
