import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/auth/errors";
import { authJson, handleAuthPost } from "@/lib/auth/http";
import { getSiteUrl } from "@/lib/auth/redirects";
import { registerSchema } from "@/lib/auth/schemas";
import { createClient } from "@/utils/supabase/server";

function confirmationResponse() {
  // Supabase may deliberately return an obscured user for an existing address.
  return authJson({
    message: "Check your inbox for a confirmation link. If you already have an account, sign in or reset your password.",
    requiresEmailConfirmation: true,
  });
}

export async function POST(request: NextRequest) {
  return handleAuthPost(request, registerSchema, async ({ name, email, password }) => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/dashboard`,
      },
    });

    if (error?.code === "user_already_exists") return confirmationResponse();
    if (error) return authErrorResponse(error, "We could not create your account. Please try again.");
    if (data.session) return authJson({ redirectTo: "/dashboard" });
    return confirmationResponse();
  });
}
