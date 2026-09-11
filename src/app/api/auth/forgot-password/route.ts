import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/auth/errors";
import { authJson, handleAuthPost } from "@/lib/auth/http";
import { getSiteUrl } from "@/lib/auth/redirects";
import { forgotPasswordSchema } from "@/lib/auth/schemas";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  return handleAuthPost(request, forgotPasswordSchema, async ({ email }) => {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
    });

    if (error && error.code !== "user_not_found") {
      return authErrorResponse(error, "We could not send a reset email right now. Please try again.");
    }

    return authJson({
      message: "If an account exists for that email, you will receive a password reset link shortly. Check your inbox and spam folder.",
    });
  });
}
