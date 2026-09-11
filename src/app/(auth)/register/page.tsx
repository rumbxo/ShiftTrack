import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuthenticatedUser } from "@/lib/auth/user";

export const metadata: Metadata = { title: "Create your account — ShiftTrack" };

export default async function RegisterPage() {
  if (await getAuthenticatedUser()) redirect("/dashboard");
  return <AuthForm mode="register" />;
}
