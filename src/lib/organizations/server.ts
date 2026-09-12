import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/utils/supabase/server";

import type { Organization, OrganizationMember } from "./types";

export type OrganizationErrorCode =
  | "setup-required"
  | "unavailable"
  | "forbidden"
  | "conflict"
  | "invalid-input"
  | "member-unavailable";

const organizationErrors: Record<OrganizationErrorCode, { message: string; status: number }> = {
  "setup-required": { message: "Organization setup is not complete yet. Apply the organization database migration, then try again.", status: 503 },
  unavailable: { message: "We could not load your organization. Please try again.", status: 503 },
  forbidden: { message: "You do not have permission to make this organization change.", status: 403 },
  conflict: { message: "This account already belongs to an organization. Refresh the page to continue.", status: 409 },
  "invalid-input": { message: "Check the organization details and try again.", status: 400 },
  "member-unavailable": { message: "This account cannot be added. They need a confirmed ShiftTrack account that does not already belong to an organization.", status: 409 },
};

export class OrganizationServiceError extends Error {
  readonly code: OrganizationErrorCode;
  readonly status: number;

  constructor(code: OrganizationErrorCode) {
    super(organizationErrors[code].message);
    this.name = "OrganizationServiceError";
    this.code = code;
    this.status = organizationErrors[code].status;
  }
}

/** Never send database messages, user metadata, or SQL details to the browser. */
export function organizationServiceError(error: unknown, operation = "organization-request"): OrganizationServiceError {
  if (error instanceof OrganizationServiceError) return error;
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  // Keep the underlying failure diagnosable on the server without recording
  // credentials, account details, query values, or raw provider messages.
  const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const safeCode = typeof code === "string" && /^[a-z0-9_]{1,64}$/i.test(code) ? code : undefined;
  console.error("[ShiftTrack workspace]", JSON.stringify({
    operation,
    code: safeCode ?? "unknown",
    status: typeof details.status === "number" ? details.status : undefined,
    errorType: error instanceof Error ? error.name : undefined,
    validationFields: error instanceof z.ZodError ? error.issues.map((issue) => issue.path.join(".")) : undefined,
  }));
  switch (code) {
    case "42P01":
    case "42883":
    case "PGRST202":
    case "PGRST205":
      return new OrganizationServiceError("setup-required");
    case "42501":
      return new OrganizationServiceError("forbidden");
    case "23505":
      return new OrganizationServiceError("conflict");
    case "22023":
    case "23514":
      return new OrganizationServiceError("invalid-input");
    case "P0002":
      return new OrganizationServiceError("member-unavailable");
    default:
      return new OrganizationServiceError("unavailable");
  }
}

const roleSchema = z.enum(["owner", "manager", "employee"]);
const membershipSchema = z.object({ id: z.string().uuid(), organization_id: z.string().uuid(), role: roleSchema });
const organizationSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) });
const memberSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  created_at: z.string(),
});

export type OrganizationContext = {
  user: User | null;
  organization: Organization | null;
};

/** Request-local memoization only; identity and memberships are read again on each request. */
export const getOrganizationContext = cache(async (): Promise<OrganizationContext> => {
  let operation = "create-client";
  try {
    const supabase = await createClient();
    operation = "verify-user";
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Only confirmed authentication failures mean signed out. A temporary
      // provider or network failure must not trigger the client's identity reload.
      const sessionIsMissing = authError.name === "AuthSessionMissingError";
      const invalidSessionCodes = ["session_not_found", "refresh_token_not_found", "refresh_token_already_used", "user_not_found", "bad_jwt"];
      const invalidSession = authError.name !== "AuthRetryableFetchError" && (
        authError.status === 401 || authError.status === 403 || invalidSessionCodes.includes(authError.code ?? "")
      );
      if (sessionIsMissing || invalidSession) {
        return { user: null, organization: null };
      }
      throw organizationServiceError(authError, operation);
    }
    if (!auth.user) return { user: null, organization: null };

    operation = "read-membership";
    const { data: membershipData, error: membershipError } = await supabase
      .from("memberships")
      .select("id, organization_id, role")
      .eq("user_id", auth.user.id)
      .abortSignal(AbortSignal.timeout(10_000))
      .maybeSingle();
    if (membershipError) throw organizationServiceError(membershipError, operation);
    if (!membershipData) return { user: auth.user, organization: null };

    operation = "validate-membership";
    const membership = membershipSchema.parse(membershipData);
    operation = "read-organization";
    const { data: organizationData, error: organizationError } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", membership.organization_id)
      .abortSignal(AbortSignal.timeout(10_000))
      .single();
    if (organizationError) throw organizationServiceError(organizationError, operation);
    operation = "validate-organization";
    const organization = organizationSchema.parse(organizationData);

    return {
      user: auth.user,
      organization: { ...organization, role: membership.role, membershipId: membership.id },
    };
  } catch (error) {
    throw organizationServiceError(error, operation);
  }
});

/** The roster RPC checks membership and returns only colleagues in this organization. */
export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  let operation = "read-members-context";
  try {
    const context = await getOrganizationContext();
    if (!context.user || context.organization?.id !== organizationId) {
      throw new OrganizationServiceError("forbidden");
    }
    const supabase = await createClient();
    operation = "read-members";
    const { data, error } = await supabase.rpc("get_organization_members", { p_organization_id: organizationId })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) throw organizationServiceError(error, operation);
    operation = "validate-members";
    return z.array(memberSchema).parse(data).map((member) => ({
      id: member.id,
      userId: member.user_id,
      name: member.name.trim().slice(0, 80) || member.email.split("@")[0] || "Teammate",
      email: member.email,
      role: member.role,
      createdAt: member.created_at,
    }));
  } catch (error) {
    throw organizationServiceError(error, operation);
  }
}
