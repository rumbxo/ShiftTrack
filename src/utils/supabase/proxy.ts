import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig } from "./config";

export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // The page must receive the refreshed session during this same request.
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        const previousCookies = response.cookies.getAll();
        response = NextResponse.next({ request });
        previousCookies.forEach((cookie) => response.cookies.set(cookie));

        // The browser must also receive every update, including deleted chunks.
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  // Creating the client alone does not refresh a session. This validates the
  // current token and refreshes an expired session before returning its cookies.
  const { data, error } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  const isProtectedPage = path === "/dashboard" || path.startsWith("/dashboard/") || path === "/workspace" || path === "/onboarding";
  if (isProtectedPage) {
    response.headers.set("Cache-Control", "private, no-store");
    // An Auth outage is not a confirmed sign-out. The page still verifies the
    // user and displays an unavailable state without rendering workspace data.
    const unavailable = error && (!error.status || error.status === 429 || error.status >= 500);
    if (!unavailable && (error || !data?.claims?.sub)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      const redirect = NextResponse.redirect(loginUrl);
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
  }

  // Protected pages and every mutation also verify the user on the server.
  return response;
}
