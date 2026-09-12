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
const organizations = new Map();
const memberships = new Map();
const databaseErrors = new Map();
const tasks = new Map();
const taskErrors = new Map();
const taskPageLimits = new Map();

function seedTask({ organizationId, createdBy, title = "Shared safety check", description = "", category = "Safety", assigneeId = null, dueAt = new Date(Date.now() + 3_600_000).toISOString(), frequency = "once", timeZone = "UTC", completedAt = null, completedBy = null, parentTaskId = null, recurrenceAnchorAt = dueAt }) {
  const task = {
    id: randomUUID(), organization_id: organizationId, title, description, category,
    assignee_id: assigneeId, due_at: dueAt, frequency, time_zone: timeZone,
    completed_at: completedAt, completed_by: completedBy, created_at: new Date().toISOString(),
    created_by: createdBy, parent_task_id: parentTaskId, recurrence_anchor_at: recurrenceAnchorAt,
  };
  tasks.set(task.id, task);
  return task;
}

// Browser recurrence scenarios use UTC. The actual migration's SQL suite tests
// timezone and calendar edge cases independently of this lightweight fixture.
function nextFixtureDueAt(task) {
  const anchor = new Date(task.recurrence_anchor_at);
  const after = Math.max(Date.now(), new Date(task.due_at).getTime());
  if (task.frequency !== "monthly") {
    const interval = (task.frequency === "weekly" ? 7 : 1) * 86_400_000;
    return new Date(anchor.getTime() + (Math.floor((after - anchor.getTime()) / interval) + 1) * interval).toISOString();
  }
  const next = new Date(anchor);
  let month = 0;
  do {
    month += 1;
    next.setUTCDate(1);
    next.setUTCFullYear(anchor.getUTCFullYear(), anchor.getUTCMonth() + month);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  } while (next.getTime() <= after);
  return next.toISOString();
}

function membershipFor(userId) {
  return [...memberships.values()].find((member) => member.user_id === userId);
}

function seedMembership({ organizationId, userId, role = "employee" }) {
  const existing = membershipFor(userId);
  if (existing) return existing;
  const member = { id: randomUUID(), organization_id: organizationId, user_id: userId, role, created_at: new Date().toISOString() };
  memberships.set(member.id, member);
  return member;
}

function seedOrganization({ ownerId, name = "Oak Street Group Home" }) {
  const existing = membershipFor(ownerId);
  if (existing) return organizations.get(existing.organization_id);
  const organization = { id: randomUUID(), name, created_at: new Date().toISOString() };
  organizations.set(organization.id, organization);
  seedMembership({ organizationId: organization.id, userId: ownerId, role: "owner" });
  return organization;
}

function filterRows(rows, url) {
  const filtered = rows.filter((row) => [...url.searchParams].every(([key, value]) => {
    if (["select", "order", "limit", "offset"].includes(key)) return true;
    if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
    if (value.startsWith("gt.")) return String(row[key]) > value.slice(3);
    if (value === "is.null") return row[key] === null;
    if (value === "not.is.null") return row[key] !== null;
    return false;
  }));
  const order = url.searchParams.get("order");
  if (order) {
    filtered.sort((left, right) => {
      for (const term of order.split(",")) {
        const [field, direction] = term.split(".");
        const comparison = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
        if (comparison) return comparison * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? filtered.length);
  return filtered.slice(offset, offset + limit);
}

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
  if (url.pathname === "/__test/organizations" && request.method === "POST") {
    return send(seedOrganization(body));
  }
  if (url.pathname === "/__test/memberships" && request.method === "POST") {
    return send(seedMembership(body));
  }
  if (url.pathname === "/__test/database-error" && request.method === "POST") {
    if (body.code) databaseErrors.set(body.userId, body.code);
    else databaseErrors.delete(body.userId);
    return send({ ok: true });
  }
  if (url.pathname === "/__test/tasks" && request.method === "POST") return send(seedTask(body));
  if (url.pathname === "/__test/task-error" && request.method === "POST") {
    if (body.code) taskErrors.set(body.userId, { code: body.code, operation: body.operation ?? "all" });
    else taskErrors.delete(body.userId);
    return send({ ok: true });
  }
  if (url.pathname === "/__test/task-page-limit" && request.method === "POST") {
    if (!Number.isInteger(body.limit) || body.limit < 1) return error("Choose a positive row cap.");
    taskPageLimits.set(body.userId, body.limit);
    return send({ ok: true });
  }

  if (request.headers.apikey !== publishableKey) return error("Invalid API key", "invalid_api_key", 401);

  // This lightweight PostgREST fixture exercises application requests and UI.
  // PostgreSQL policy tests separately prove the actual migration's permissions.
  if (url.pathname.startsWith("/rest/v1/")) {
    const record = authenticatedUser(request);
    const databaseError = (message, code = "42501", status = 403) => send({ message, code, details: null, hint: null }, status);
    if (!record) return databaseError("Authentication required");
    const fault = databaseErrors.get(record.user.id);
    if (fault) return databaseError("Fixture database error", fault, ["42P01", "PGRST205"].includes(fault) ? 404 : 503);
    const current = membershipFor(record.user.id);
    const ownOrganization = organizations.get(current?.organization_id);
    const path = url.pathname.slice("/rest/v1/".length);
    const taskOperation = path === "tasks" ? "read" : /rpc\/(?:create|update|complete|delete)_task$/.test(path) ? "write" : null;
    const taskFault = taskErrors.get(record.user.id);
    if (taskOperation && taskFault && ["all", taskOperation].includes(taskFault.operation)) {
      return databaseError("Fixture task service error", taskFault.code, ["42P01", "PGRST205"].includes(taskFault.code) ? 404 : 503);
    }

    if (request.method === "GET" && path === "tasks") {
      const rows = filterRows([...tasks.values()].filter((task) => task.organization_id === current?.organization_id), url).slice(0, taskPageLimits.get(record.user.id) ?? 1000);
      if (request.headers.accept?.includes("application/vnd.pgrst.object+json")) {
        if (rows.length !== 1) return databaseError("Cannot coerce the result to a single JSON object", "PGRST116", 406);
        return send(rows[0]);
      }
      return send(rows);
    }

    if (request.method === "GET" && ["organizations", "memberships"].includes(path)) {
      const available = path === "organizations"
        ? ownOrganization ? [ownOrganization] : []
        : [...memberships.values()].filter((member) => member.organization_id === current?.organization_id);
      const rows = filterRows(available, url);
      if (request.headers.accept?.includes("application/vnd.pgrst.object+json")) {
        if (rows.length !== 1) return databaseError("Cannot coerce the result to a single JSON object", "PGRST116", 406);
        return send(rows[0]);
      }
      return send(rows);
    }

    if (path.startsWith("rpc/") && request.method === "POST") {
      const rpc = path.slice(4);
      if (["create_task", "update_task", "complete_task", "delete_task"].includes(rpc)) {
        if (!current) return databaseError("Workspace membership is required.");
        const task = body.p_task_id ? tasks.get(body.p_task_id) : null;
        if (rpc !== "create_task" && (!task || task.organization_id !== current.organization_id)) return databaseError("Task access required.");
        if (body.p_organization_id && body.p_organization_id !== current.organization_id) return databaseError("Task access required.");
        const canManage = ["owner", "manager"].includes(current.role);
        if (rpc === "complete_task") {
          if (!canManage && task.assignee_id !== current.id) return databaseError("Only the assigned employee can complete this task.");
          if (!task.completed_at) {
            task.completed_at = new Date().toISOString();
            task.completed_by = record.user.id;
            if (task.frequency !== "once" && ![...tasks.values()].some((candidate) => candidate.parent_task_id === task.id)) {
              seedTask({
                organizationId: task.organization_id, createdBy: task.created_by, title: task.title,
                description: task.description, category: task.category, assigneeId: task.assignee_id,
                dueAt: nextFixtureDueAt(task), frequency: task.frequency, timeZone: task.time_zone,
                parentTaskId: task.id, recurrenceAnchorAt: task.recurrence_anchor_at,
              });
            }
          }
          return send(task.id);
        }
        if (!canManage) return databaseError("Only owners and managers can manage tasks.");
        if (rpc === "delete_task") {
          if (task.completed_at) return databaseError("Completed tasks cannot be deleted.", "55000", 409);
          tasks.delete(task.id);
          return send(null);
        }
        if (task?.completed_at) return databaseError("Completed tasks cannot be edited.", "55000", 409);
        const assignee = body.p_assignee_id ? memberships.get(body.p_assignee_id) : null;
        if (body.p_assignee_id && assignee?.organization_id !== current.organization_id) return databaseError("Choose a member of this workspace.", "22023", 400);
        if (!body.p_title?.trim() || !body.p_due_at || Number.isNaN(new Date(body.p_due_at).getTime())) return databaseError("Enter valid task details.", "22023", 400);
        const fields = {
          title: body.p_title.trim(), description: body.p_description ?? "", category: body.p_category,
          assignee_id: body.p_assignee_id ?? null, due_at: body.p_due_at,
          frequency: body.p_frequency, time_zone: body.p_time_zone,
        };
        if (rpc === "update_task") {
          const scheduleChanged = fields.due_at !== task.due_at || fields.frequency !== task.frequency || fields.time_zone !== task.time_zone;
          Object.assign(task, fields, scheduleChanged ? { recurrence_anchor_at: fields.due_at } : {});
          return send(task.id);
        }
        return send(seedTask({
          organizationId: current.organization_id, createdBy: record.user.id, title: fields.title,
          description: fields.description, category: fields.category, assigneeId: fields.assignee_id,
          dueAt: fields.due_at, frequency: fields.frequency, timeZone: fields.time_zone,
        }).id);
      }
      if (rpc === "create_organization") {
        if (current?.role === "owner") return send(current.organization_id);
        if (current) return databaseError("You already belong to a workspace.", "23505", 409);
        const name = body.p_name?.trim();
        if (!name || name.length > 120) return databaseError("Enter a workspace name between 1 and 120 characters.", "22023", 400);
        return send(seedOrganization({ ownerId: record.user.id, name }).id);
      }
      if (rpc === "get_organization_members") {
        if (!current || current.organization_id !== body.p_organization_id) return databaseError("Workspace access required.");
        return send([...memberships.values()].filter((member) => member.organization_id === current.organization_id).map((member) => {
          const account = [...users.values()].find((candidate) => candidate.user.id === member.user_id)?.user;
          return { id: member.id, user_id: member.user_id, role: member.role, created_at: member.created_at, name: account?.user_metadata.full_name ?? "", email: account?.email ?? "" };
        }));
      }
      if (current?.role !== "owner") return databaseError("Only the workspace owner can make this change.");
      if (body.p_organization_id && body.p_organization_id !== current.organization_id) return databaseError("Only the workspace owner can make this change.");
      if (rpc === "rename_organization") {
        ownOrganization.name = body.p_name.trim();
        return send(null);
      }
      if (rpc === "add_organization_member") {
        const target = users.get(body.p_email?.trim().toLowerCase());
        if (!target?.user.email_confirmed_at) return databaseError("A confirmed account with that email was not found.", "P0002", 404);
        if (membershipFor(target.user.id)) return databaseError("This account is unavailable to add.", "P0002", 409);
        if (!["manager", "employee"].includes(body.p_role)) return databaseError("Choose manager or employee.", "22023", 400);
        return send(seedMembership({ organizationId: current.organization_id, userId: target.user.id, role: body.p_role }).id);
      }
      if (["set_organization_member_role", "remove_organization_member"].includes(rpc)) {
        const target = memberships.get(body.p_membership_id);
        if (!target || target.organization_id !== current.organization_id) return databaseError("Only the workspace owner can make this change.");
        if (target.role === "owner") return databaseError("The owner cannot be changed or removed.", "42501", 403);
        if (rpc === "remove_organization_member") memberships.delete(target.id);
        else {
          if (!["manager", "employee"].includes(body.p_role)) return databaseError("Choose manager or employee.", "22023", 400);
          target.role = body.p_role;
        }
        return send(null);
      }
    }
    return databaseError(`Unhandled fixture endpoint ${request.method} ${url.pathname}`, "not_found", 404);
  }

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
