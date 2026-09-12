import type { NextRequest } from "next/server";

import { authJson } from "@/lib/auth/http";
import { handleOwnerOrganizationPost, organizationErrorResponse } from "@/lib/organizations/http";
import { organizationNameSchema } from "@/lib/organizations/schemas";

export async function POST(request: NextRequest) {
  return handleOwnerOrganizationPost(request, organizationNameSchema, async ({ name }, context, supabase) => {
    const { error } = await supabase.rpc("rename_organization", { p_organization_id: context.organization.id, p_name: name })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) return organizationErrorResponse(error);
    return authJson({ message: "Organization name saved." });
  });
}
