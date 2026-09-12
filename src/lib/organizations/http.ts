import type { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";

import { authJson, handleAuthPost } from "@/lib/auth/http";
import { createClient } from "@/utils/supabase/server";

import { getOrganizationContext, organizationServiceError, type OrganizationContext } from "./server";
import type { Organization } from "./types";

export function organizationErrorResponse(error: unknown) {
  const mapped = organizationServiceError(error);
  return authJson({ error: mapped.message, code: mapped.code }, mapped.status);
}

export function handleOrganizationPost<T>(
  request: NextRequest,
  schema: ZodType<T>,
  handle: (input: T) => Promise<NextResponse>,
) {
  return handleAuthPost(request, schema, async (input) => {
    try {
      return await handle(input);
    } catch (error) {
      return organizationErrorResponse(error);
    }
  });
}

type OwnerContext = OrganizationContext & { organization: Organization };

/** Application checks improve feedback; each RPC independently enforces the same permission. */
export async function handleOwnerOrganizationPost<T>(
  request: NextRequest,
  schema: ZodType<T>,
  handle: (input: T, context: OwnerContext, supabase: Awaited<ReturnType<typeof createClient>>) => Promise<NextResponse>,
) {
  return handleOrganizationPost(request, schema, async (input) => {
    const context = await getOrganizationContext();
    if (!context.user) return authJson({ error: "Log in to continue.", code: "unauthenticated" }, 401);
    if (!context.organization) return authJson({ error: "Create or join an organization first.", code: "organization-required" }, 409);
    if (context.organization.role !== "owner") {
      return authJson({ error: "Only the organization owner can make this change.", code: "forbidden" }, 403);
    }
    return handle(input, { ...context, organization: context.organization }, await createClient());
  });
}
