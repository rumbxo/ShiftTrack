import type { AuthError } from "@supabase/supabase-js";

import { authJson } from "./http";

/** Map known codes; never send raw provider errors or tokens to the browser. */
export function authErrorResponse(error: AuthError, fallback: string, status = 400) {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return authJson({ error: "Too many attempts. Please wait a few minutes and try again." }, 429);
  }

  switch (error.code) {
    case "email_not_confirmed":
      return authJson({ error: "Confirm your email before signing in. Check your inbox for the confirmation link." }, 403);
    case "weak_password":
      return authJson({ error: "Choose a stronger password with at least 8 characters. Avoid common or previously exposed passwords." }, 400);
    case "same_password":
      return authJson({ error: "Choose a password that is different from your current password." }, 400);
    case "reauthentication_needed":
    case "reauthentication_not_valid":
      return authJson({ error: "Request a new password reset email, then use its link to try again." }, 401);
    case "email_address_invalid":
      return authJson({ error: "Enter a valid email address." }, 400);
    case "email_address_not_authorized":
      return authJson({ error: "Email delivery is not available for this address yet. The workspace administrator needs to configure email delivery." }, 503);
    case "signup_disabled":
      return authJson({ error: "New account registration is currently unavailable." }, 503);
  }

  if (!error.status || error.status >= 500) {
    return authJson({ error: "The account service is temporarily unavailable. Please try again." }, 503);
  }

  return authJson({ error: fallback }, status);
}
