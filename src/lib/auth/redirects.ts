/** Only destinations needed by the account flows are accepted. */
export function sanitizeNextPath(value: unknown): "/dashboard" | "/reset-password" {
  return value === "/reset-password" ? "/reset-password" : "/dashboard";
}

/** Use a configured origin rather than trusting Host or forwarded headers. */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("Set NEXT_PUBLIC_SITE_URL to the public address of ShiftTrack.");
  }

  const url = new URL(configured || "http://127.0.0.1:3000");
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTP or HTTPS origin without a path.");
  }

  return url.origin;
}
