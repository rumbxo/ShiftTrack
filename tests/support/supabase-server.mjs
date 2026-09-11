// An HTTP fixture for the real Supabase SDK, confined to the Playwright run.
// Nothing in the application imports this file or enables an auth bypass.
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const origin = "http://127.0.0.1:3100";
const publishableKey = "sb_publishable_test_fixture";
const jwtSecret = "shifttrack-local-auth-test-fixture-only";
const defaultPassword = "ShiftTrack-Test-123!";
const users = new Map();
const refreshTokens = new Map();
const emailLinks = new Map();
const authCodes = new Map();
const tokenHashes = new Map();

function userId(email) {
  const hex = createHash("sha256").update(email.toLowerCase()).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function seedUser({ email, name = "Ahmand Edmonds", password = defaultPassword, confirmed = true }) {
  const now = new Date().toISOString();
  const record = {
    password,
    user: {
      id: userId(email),
      aud: "authenticated",
      role: "authenticated",
      email: email.toLowerCase(),
      email_confirmed_at: confirmed ? now : undefined,
      confirmed_at: confirmed ? now : undefined,
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: name },
      identities: [],
      created_at: now,
      updated_at: now,
      is_anonymous: false,
    },
  };
  users.set(record.user.email, record);
  return record;
}

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  return `${unsigned}.${createHmac("sha256", jwtSecret).update(unsigned).digest("base64url")}`;
}

function session(record, expiresIn = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const refreshToken = randomUUID();
  refreshTokens.set(refreshToken, record.user.email);
  return {
    access_token: jwt({
      iss: "http://127.0.0.1:3101/auth/v1",
      sub: record.user.id,
      aud: "authenticated",
      role: "authenticated",
      email: record.user.email,
      app_metadata: record.user.app_metadata,
      user_metadata: record.user.user_metadata,
      iat: now,
      exp: now + expiresIn,
      session_id: randomUUID(),
      aal: "aal1",
      amr: [{ method: "password", timestamp: now }],
      is_anonymous: false,
    }),
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: now + expiresIn,
    refresh_token: refreshToken,
    user: record.user,
  };
}

function authenticatedUser(request) {
  try {
    const token = request.headers.authorization?.replace(/^Bearer /, "");
    const [header, body, signature] = token.split(".");
    const expected = createHmac("sha256", jwtSecret).update(`${header}.${body}`).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    const record = users.get(claims.email);
    return record?.user.id === claims.sub ? record : null;
  } catch {
    return null;
  }
}

function createEmailLink(record, type, body, redirectTo) {
  const code = randomUUID();
  const tokenHash = randomUUID();
  const callback = new URL(redirectTo || "/auth/callback", origin);
  callback.searchParams.set("code", code);
  const confirm = new URL("/auth/confirm", origin);
  confirm.searchParams.set("token_hash", tokenHash);
  confirm.searchParams.set("type", type);
  const link = {
    email: record.user.email,
    type,
    code,
    tokenHash,
    url: callback.toString(),
    confirmationUrl: confirm.toString(),
    codeChallenge: body.code_challenge,
    consumed: false,
  };
  emailLinks.set(`${record.user.email}:${type}`, link);
  authCodes.set(code, link);
  tokenHashes.set(tokenHash, link);
}

function confirmLink(link) {
  link.consumed = true;
  const record = users.get(link.email);
  record.user.email_confirmed_at = new Date().toISOString();
  record.user.confirmed_at = record.user.email_confirmed_at;
  return session(record);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:3101");
  const send = (body, status = 200) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(body));
  };
  const error = (message, code = "validation_failed", status = 400) => send({ message, code }, status);
  if (request.method === "OPTIONS") return send({});
  if (url.pathname === "/health") return send({ ok: true });

  let body = {};
  try {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    if (raw) body = JSON.parse(raw);
  } catch {
    return error("Invalid JSON");
  }

  // Fixture controls are served only by this standalone test process.
  if (url.pathname === "/__test/users" && request.method === "POST") {
    if (typeof body.email !== "string") return error("An email is required");
    return send(seedUser(body).user);
  }
  if (url.pathname === "/__test/email-link") {
    const link = emailLinks.get(`${url.searchParams.get("email")}:${url.searchParams.get("type")}`);
    return link ? send(link) : error("No email was requested", "not_found", 404);
  }

  if (request.headers.apikey !== publishableKey) return error("Invalid API key", "invalid_api_key", 401);

  if (url.pathname === "/auth/v1/token" && request.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const record = users.get(body.email?.toLowerCase());
      if (!record || record.password !== body.password) return error("Invalid login credentials", "invalid_credentials");
      if (!record.user.email_confirmed_at) return error("Email not confirmed", "email_not_confirmed");
      return send(session(record));
    }
    if (grant === "refresh_token") {
      const email = refreshTokens.get(body.refresh_token);
      if (!email) return error("Invalid Refresh Token: Refresh Token Not Found", "refresh_token_not_found");
      refreshTokens.delete(body.refresh_token);
      return send(session(users.get(email)));
    }
    if (grant === "pkce") {
      const link = authCodes.get(body.auth_code);
      if (!link || link.consumed) return error("Invalid authorization code", "flow_state_not_found");
      const challenge = createHash("sha256").update(body.code_verifier || "").digest("base64url");
      if (!link.codeChallenge || challenge !== link.codeChallenge) return error("Invalid code verifier", "bad_code_verifier");
      return send({ ...confirmLink(link), redirect_type: link.type === "recovery" ? "recovery" : "signup" });
    }
  }

  if (url.pathname === "/auth/v1/signup" && request.method === "POST") {
    const email = body.email?.toLowerCase();
    let record = users.get(email);
    if (!record) record = seedUser({ email, name: body.data?.full_name, password: body.password, confirmed: false });
    createEmailLink(record, "signup", body, url.searchParams.get("redirect_to"));
    return send(record.user);
  }

  if (url.pathname === "/auth/v1/recover" && request.method === "POST") {
    const record = users.get(body.email?.toLowerCase());
    if (record) createEmailLink(record, "recovery", body, url.searchParams.get("redirect_to"));
    return send({});
  }

  if (url.pathname === "/auth/v1/verify" && request.method === "POST") {
    const link = tokenHashes.get(body.token_hash);
    if (!link || link.consumed || (body.type !== link.type && body.type !== "email")) return error("Token has expired or is invalid", "otp_expired");
    return send(confirmLink(link));
  }

  if (url.pathname === "/auth/v1/user") {
    const record = authenticatedUser(request);
    if (!record) return error("Invalid JWT", "bad_jwt", 401);
    if (request.method === "PUT") {
      if (body.password) record.password = body.password;
      if (body.data) record.user.user_metadata = { ...record.user.user_metadata, ...body.data };
      record.user.updated_at = new Date().toISOString();
    }
    return send(record.user);
  }

  if (url.pathname === "/auth/v1/logout" && request.method === "POST") {
    const record = authenticatedUser(request);
    if (!record) return error("Invalid JWT", "bad_jwt", 401);
    // Hosted Supabase access tokens can remain valid until expiry after logout;
    // the application must clear its browser session correctly.
    return send({});
  }

  return error(`Unhandled fixture endpoint ${request.method} ${url.pathname}`, "not_found", 404);
});

server.listen(3101, "127.0.0.1", () => {
  process.stdout.write("Local Supabase Auth fixture listening on 127.0.0.1:3101\n");
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
