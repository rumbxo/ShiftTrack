import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { AuthIdentitySync } from "@/components/auth/auth-identity-sync";

export const metadata: Metadata = { title: "Choose a new password — ShiftTrack" };

export default async function ResetPasswordPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/forgot-password?error=invalid-link");
  return <><AuthIdentitySync userId={user.id} /><AuthForm mode="reset-password" /></>;
}
