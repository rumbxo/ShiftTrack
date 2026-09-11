import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Reset your password — ShiftTrack" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthForm mode="forgot-password" initialError={error === "invalid-link" ? "This reset link has expired or is invalid. Request a new one below." : ""} />;
}
