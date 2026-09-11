import type { NextRequest } from "next/server";

import { authRedirect } from "@/lib/auth/http";
import { sanitizeNextPath } from "@/lib/auth/redirects";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const failure = next === "/reset-password" ? "/forgot-password?error=invalid-link" : "/login?error=invalid-link";

  if (code && code.length <= 4096 && !request.nextUrl.searchParams.has("error")) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return authRedirect(next);
    } catch {
      // Expired links, missing PKCE cookies, and provider outages use safe copy.
    }
  }

  return authRedirect(failure);
}
