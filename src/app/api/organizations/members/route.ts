import type { NextRequest } from "next/server";

import { authJson } from "@/lib/auth/http";
import { handleOwnerOrganizationPost, organizationErrorResponse } from "@/lib/organizations/http";
import { addOrganizationMemberSchema } from "@/lib/organizations/schemas";

export async function POST(request: NextRequest) {
  return handleOwnerOrganizationPost(request, addOrganizationMemberSchema, async ({ email, role }, context, supabase) => {
    const { error } = await supabase.rpc("add_organization_member", {
      p_organization_id: context.organization.id,
      p_email: email,
      p_role: role,
    }).abortSignal(AbortSignal.timeout(10_000));
    if (error) return organizationErrorResponse(error);
    return authJson({ message: "Organization member added." });
  });
}
