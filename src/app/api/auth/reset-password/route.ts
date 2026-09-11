import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/auth/errors";
import { authJson, handleAuthPost } from "@/lib/auth/http";
import { resetPasswordSchema } from "@/lib/auth/schemas";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  return handleAuthPost(request, resetPasswordSchema, async ({ password }) => {
    const supabase = await createClient();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      return authJson({ error: "Your reset session has expired. Request a new password reset email." }, 401);
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return authErrorResponse(error, "We could not update your password. Request a new reset email and try again.");

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      // A remote revocation error can still leave the local session cleared.
      // getUser above authorizes the update; getSession only checks removal.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || sessionData.session) {
        return authJson({ error: "Your password was updated, but we could not sign you out. Return to your dashboard and try signing out again." }, 503);
      }
    }

    return authJson({ redirectTo: "/login?message=password-updated" });
  });
}
