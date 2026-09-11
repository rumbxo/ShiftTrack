import { cache } from "react";

import { createClient } from "@/utils/supabase/server";

/** Verify identity with Auth; cookie contents alone never establish a user. */
export const getAuthenticatedUser = cache(async () => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
});
