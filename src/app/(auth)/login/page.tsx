import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthenticatedUser } from "@/lib/auth/user";

export const metadata: Metadata = { title: "Log in — ShiftTrack" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const params = await searchParams;
  const next = params.next === "/reset-password" ? "/reset-password" : "/dashboard";
  const user = await getAuthenticatedUser();
  if (user) redirect(next);
  return <AuthForm mode="login" next={next} initialError={params.error === "invalid-link" ? "This confirmation link has expired or is invalid. Try logging in, or request a new password reset link." : ""} initialMessage={params.message === "password-updated" ? "Your password has been updated. Log in with your new password." : ""} />;
}
