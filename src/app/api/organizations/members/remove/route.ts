import type { NextRequest } from "next/server";

import { authJson } from "@/lib/auth/http";
import { handleOwnerOrganizationPost, organizationErrorResponse } from "@/lib/organizations/http";
import { removeOrganizationMemberSchema } from "@/lib/organizations/schemas";

export async function POST(request: NextRequest) {
  return handleOwnerOrganizationPost(request, removeOrganizationMemberSchema, async ({ membershipId }, _context, supabase) => {
    const { error } = await supabase.rpc("remove_organization_member", { p_membership_id: membershipId })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) return organizationErrorResponse(error);
    return authJson({ message: "Organization member removed." });
  });
}
