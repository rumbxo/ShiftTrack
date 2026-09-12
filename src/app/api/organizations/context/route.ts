import { authJson } from "@/lib/auth/http";
import { organizationErrorResponse } from "@/lib/organizations/http";
import { getOrganizationContext } from "@/lib/organizations/server";

/** Refresh identity and access from Auth and the database, never from client metadata. */
export async function GET() {
  try {
    const { user, organization } = await getOrganizationContext();
    return authJson({ userId: user?.id ?? "", organization });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
