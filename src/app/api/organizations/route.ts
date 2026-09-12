import type { NextRequest } from "next/server";

import { authJson } from "@/lib/auth/http";
import { handleOrganizationPost, organizationErrorResponse } from "@/lib/organizations/http";
import { organizationNameSchema } from "@/lib/organizations/schemas";
import { getOrganizationContext } from "@/lib/organizations/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  return handleOrganizationPost(request, organizationNameSchema, async ({ name }) => {
    const context = await getOrganizationContext();
    if (!context.user) return authJson({ error: "Log in to create an organization.", code: "unauthenticated" }, 401);
    // The RPC makes creation atomic and safely handles a repeated submission.
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_organization", { p_name: name })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) return organizationErrorResponse(error);
    return authJson({ redirectTo: "/dashboard" });
  });
}
