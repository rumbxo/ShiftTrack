import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/auth/errors";
import { authJson, handleAuthPost } from "@/lib/auth/http";
import { sanitizeNextPath } from "@/lib/auth/redirects";
import { loginSchema } from "@/lib/auth/schemas";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  return handleAuthPost(request, loginSchema, async ({ email, password, next }) => {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return authErrorResponse(error, "The email or password is incorrect. Please try again.", 401);

    return authJson({ redirectTo: sanitizeNextPath(next) });
  });
}
