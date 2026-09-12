import type { NextRequest } from "next/server";

import { authJson } from "@/lib/auth/http";
import { handleOwnerOrganizationPost, organizationErrorResponse } from "@/lib/organizations/http";
import { setOrganizationMemberRoleSchema } from "@/lib/organizations/schemas";

export async function POST(request: NextRequest) {
  return handleOwnerOrganizationPost(request, setOrganizationMemberRoleSchema, async ({ membershipId, role }, _context, supabase) => {
    const { error } = await supabase.rpc("set_organization_member_role", { p_membership_id: membershipId, p_role: role })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) return organizationErrorResponse(error);
    return authJson({ message: "Member role saved." });
  });
}
