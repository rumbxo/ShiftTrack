import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "./config";

/** Create one client per server request; never cache a signed-in user's client. */
export async function createClient(
  cookieStore?: Awaited<ReturnType<typeof cookies>>,
) {
  const store = cookieStore ?? (await cookies());
  const { url, publishableKey } = getSupabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            store.set(name, value, options);
          });
        } catch {
          // Server Components can read cookies but cannot write them.
          // src/proxy.ts refreshes the session before the component renders.
          // Server Actions and Route Handlers can write cookies through this helper.
        }
      },
    },
  });
}
