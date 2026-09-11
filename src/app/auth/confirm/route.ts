import type { NextRequest } from "next/server";

import { authRedirect } from "@/lib/auth/http";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const recovery = type === "recovery";

  if (tokenHash && tokenHash.length <= 4096 && (type === "email" || type === "signup" || recovery)) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) return authRedirect(recovery ? "/reset-password" : "/dashboard");
    } catch {
      // Do not copy provider error descriptions or token parameters to the URL.
    }
  }

  return authRedirect(recovery ? "/forgot-password?error=invalid-link" : "/login?error=invalid-link");
}
