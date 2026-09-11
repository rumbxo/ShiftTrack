import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";

import { getSiteUrl } from "./redirects";

export function authJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Browser mutations must originate from the configured application. */
export function checkAuthOrigin(request: NextRequest): NextResponse | null {
  try {
    if (request.headers.get("origin") !== getSiteUrl()) {
      return authJson({ error: "This request could not be verified. Refresh the page and try again." }, 403);
    }
  } catch {
    return authJson({ error: "Account access is not configured yet. Please try again later." }, 503);
  }
  return null;
}

export function authUnavailable() {
  return authJson({ error: "We could not reach the account service. Please try again." }, 503);
}

export async function handleAuthPost<T>(
  request: NextRequest,
  schema: ZodType<T>,
  handle: (input: T) => Promise<NextResponse>,
) {
  const blocked = checkAuthOrigin(request);
  if (blocked) return blocked;

  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return authJson({ error: "Submit the form as JSON." }, 415);
  }

  let payload: unknown;
  try {
    // Auth forms are tiny; cap requests before passing them to validation.
    const length = Number(request.headers.get("content-length") || "0");
    if (length > 16_384) return authJson({ error: "This form is too large." }, 413);
    const body = await request.text();
    if (body.length > 16_384) return authJson({ error: "This form is too large." }, 413);
    payload = JSON.parse(body);
  } catch {
    return authJson({ error: "The form could not be read. Refresh the page and try again." }, 400);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Zod's type errors are implementation details, not useful form instructions.
    const error = issue?.code === "invalid_type" ? "Complete all required fields." : issue?.message;
    return authJson({ error: error || "Check your details and try again." }, 400);
  }

  try {
    return await handle(parsed.data);
  } catch {
    return authUnavailable();
  }
}

export function authRedirect(path: string) {
  return NextResponse.redirect(new URL(path, getSiteUrl()), {
    status: 303,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
