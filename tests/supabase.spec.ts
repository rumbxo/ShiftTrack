// Next's server test utilities need its normal AsyncLocalStorage bootstrap
// when imported outside a running Next.js request process.
import "next/dist/server/node-environment-baseline";
import { expect, test } from "@playwright/test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config } from "../src/proxy";
import { getSupabaseConfig } from "../src/utils/supabase/config";
import { updateSession } from "../src/utils/supabase/proxy";

const projectUrl = "https://shifttrack-tests.supabase.co";
const publishableKey = "sb_publishable_shifttrack_test_key";
const sessionCookie = "sb-shifttrack-tests-auth-token";
const user = {
  id: "fbb456ac-47e1-4566-8965-25a56ab49975",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

function accessToken(expiresAt: number) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: user.id, aud: "authenticated", exp: expiresAt }),
    Buffer.from("synthetic-test-signature").toString("base64url"),
  ].join(".");
}

function session(expiresAt: number, refreshToken: string) {
  return {
    access_token: accessToken(expiresAt),
    refresh_token: refreshToken,
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
}

function requestWithExpiredSession() {
  const encoded = `base64-${Buffer.from(
    JSON.stringify(session(Math.floor(Date.now() / 1000) - 3600, "old-refresh-token")),
  ).toString("base64url")}`;
  const split = Math.ceil(encoded.length / 2);

  // A previously larger session may be chunked even when its replacement fits
  // in one cookie. Both old chunks must be expired in the browser.
  return new NextRequest("http://localhost:3000/dashboard", {
    headers: {
      cookie: `${sessionCookie}.0=${encoded.slice(0, split)}; ${sessionCookie}.1=${encoded.slice(split)}; theme=dark`,
      "x-correlation-id": "refresh-test",
    },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.describe("Supabase session setup", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalUrl: string | undefined;
  let originalKey: string | undefined;
  let unexpectedRequests: string[];

  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = projectUrl;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;
    unexpectedRequests = [];
    globalThis.fetch = async (input) => {
      unexpectedRequests.push(String(input));
      throw new Error("This test must not make external requests.");
    };
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
    expect(unexpectedRequests).toEqual([]);
  });

  test("missing environment variables produce an actionable configuration error", () => {
    expect(getSupabaseConfig()).toEqual({ url: projectUrl, publishableKey });

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => getSupabaseConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    process.env.NEXT_PUBLIC_SUPABASE_URL = projectUrl;

    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => getSupabaseConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  test("an anonymous dashboard request redirects without fetching auth or setting cookies", async () => {
    const response = await updateSession(
      new NextRequest("http://localhost:3000/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(response.cookies.getAll()).toEqual([]);
  });

  test("refresh reaches the browser and server render, removing obsolete cookie chunks", async () => {
    const refreshedSession = session(
      Math.floor(Date.now() / 1000) + 3600,
      "new-refresh-token",
    );
    const authRequests: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === projectUrl && url.pathname === "/auth/v1/token") {
        authRequests.push("refresh");
        expect(url.searchParams.get("grant_type")).toBe("refresh_token");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: "old-refresh-token" });
        return jsonResponse(refreshedSession);
      }
      if (url.origin === projectUrl && url.pathname === "/auth/v1/user") {
        authRequests.push("verify");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Bearer ${refreshedSession.access_token}`,
        );
        return jsonResponse(user);
      }
      unexpectedRequests.push(url.toString());
      throw new Error("Unexpected auth request.");
    };

    const request = requestWithExpiredSession();
    const response = await updateSession(request);

    expect(authRequests).toEqual(["refresh", "verify"]);
    const refreshedCookie = response.cookies.get(sessionCookie);
    expect(refreshedCookie).toBeDefined();
    const value = refreshedCookie!.value;
    expect(value).toMatch(/^base64-/);
    const storedSession = JSON.parse(
      Buffer.from(value.slice("base64-".length), "base64url").toString(),
    );
    expect(storedSession.refresh_token).toBe("new-refresh-token");
    expect(request.cookies.get(sessionCookie)?.value).toBe(value);
    expect(request.cookies.get("theme")?.value).toBe("dark");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(`${sessionCookie}=${value}`);
    expect(response.headers.get("x-middleware-request-x-correlation-id")).toBe("refresh-test");
    expect(response.headers.get("x-correlation-id")).toBeNull();
    expect(refreshedCookie?.path).toBe("/");
    expect(refreshedCookie?.sameSite).toBe("lax");
    expect(refreshedCookie?.maxAge).toBeGreaterThan(0);
    for (const suffix of [".0", ".1"]) {
      expect(response.cookies.get(sessionCookie + suffix)?.value).toBe("");
      expect(response.cookies.get(sessionCookie + suffix)?.maxAge).toBe(0);
      expect(request.cookies.get(sessionCookie + suffix)?.value ?? "").toBe("");
    }
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  test("a revoked refresh token clears expired session cookies", async () => {
    let refreshRequests = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.origin === projectUrl && url.pathname === "/auth/v1/token") {
        refreshRequests += 1;
        return jsonResponse({
          code: "refresh_token_not_found",
          message: "Invalid Refresh Token: Refresh Token Not Found",
        }, 400);
      }
      unexpectedRequests.push(url.toString());
      throw new Error("Unexpected auth request.");
    };

    const request = requestWithExpiredSession();
    const response = await updateSession(request);

    expect(refreshRequests).toBe(1);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(response.cookies.get(sessionCookie)).toBeUndefined();
    for (const suffix of [".0", ".1"]) {
      expect(response.cookies.get(sessionCookie + suffix)?.value).toBe("");
      expect(response.cookies.get(sessionCookie + suffix)?.maxAge).toBe(0);
      expect(request.cookies.get(sessionCookie + suffix)?.value ?? "").toBe("");
    }
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  test("a temporary Auth rate limit preserves cookies for the page's verified error handling", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.origin === projectUrl && url.pathname === "/auth/v1/user") {
        return jsonResponse({ code: "over_request_rate_limit", message: "Too many requests" }, 429);
      }
      unexpectedRequests.push(url.toString());
      throw new Error("Unexpected auth request.");
    };
    const encoded = `base64-${Buffer.from(JSON.stringify(session(Math.floor(Date.now() / 1000) + 3600, "active-refresh-token"))).toString("base64url")}`;
    const request = new NextRequest("http://localhost:3000/workspace", { headers: { cookie: `${sessionCookie}=${encoded}` } });
    const response = await updateSession(request);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.cookies.getAll()).toEqual([]);
    expect(request.cookies.get(sessionCookie)?.value).toBe(encoded);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  test("proxy covers application and auth routes while excluding static assets", () => {
    for (const url of ["/", "/dashboard", "/workspace", "/onboarding", "/auth/callback?code=test", "/api/organizations", "/api/tasks"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), url).toBe(true);
    }
    for (const url of [
      "/_next/static/chunks/app.js",
      "/_next/image?url=%2Flogo.png&w=64&q=75",
      "/favicon.ico",
      "/icon.svg",
      "/images/avatar.png",
      "/images/avatar.jpg",
      "/images/avatar.jpeg",
      "/images/avatar.gif",
      "/images/avatar.webp",
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), url).toBe(false);
    }
  });
});
