import type { NextRequest } from "next/server";

import { authErrorResponse } from "@/lib/auth/errors";
import { authJson, authUnavailable, checkAuthOrigin } from "@/lib/auth/http";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  const blocked = checkAuthOrigin(request);
  if (blocked) return blocked;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      // The SDK can clear local cookies even if remote revocation fails.
      // Check only for absence here; this does not authorize any user action.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || data.session) {
        return authErrorResponse(error, "We could not sign you out. Please try again.");
      }
    }
    return authJson({ redirectTo: "/login" });
  } catch {
    return authUnavailable();
  }
}
