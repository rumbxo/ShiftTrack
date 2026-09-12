import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

// Run the production migrations unchanged in PostgreSQL WASM. Only the surrounding
// Auth schema/roles are fixtures; no cloud credentials or network are used.
// PGlite has one connection, so these tests do not simulate concurrent sessions.
const db = new PGlite();
let checks = 0;

async function check(name, run) {
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}

async function asUser(userId, sql, params = [], role = "authenticated") {
  assert.ok(["authenticated", "anon"].includes(role));
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    return tx.query(sql, params);
  });
}

async function denied(userId, sql, params = [], code = "42501", role = "authenticated") {
  let captured;
  await assert.rejects(asUser(userId, sql, params, role), (error) => {
    assert.equal(error.code, code, `${sql}: ${error.message}`);
    captured = error;
    return true;
  });
  return captured;
}

async function privilegedDenied(sql, params, code) {
  await assert.rejects(db.query(sql, params), (error) => {
    assert.ok([code].flat().includes(error.code), `${error.code}: ${error.message}`);
    return true;
  });
}

async function scalar(userId, sql, params = []) {
  const result = await asUser(userId, sql, params);
  return Object.values(result.rows[0])[0];
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      -- Match Supabase Auth's actual type; a TEXT fixture hides RPC return-type errors.
      email varchar(255),
      email_confirmed_at timestamptz,
      deleted_at timestamptz,
      is_anonymous boolean not null default false,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    -- Reproduce older Supabase projects' permissive defaults. The migration
    -- must remove these privileges rather than relying on fresh PG defaults.
    alter default privileges in schema public
      grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on functions to anon, authenticated, service_role;
  `);
  const migration = await readFile(
    new URL("../supabase/migrations/202609110001_organizations.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);

  const users = {
    alice: { id: randomUUID(), email: "alice@example.com", name: "Alice Owner" },
    bob: { id: randomUUID(), email: "bob@example.com", name: "Bob Owner" },
    mae: { id: randomUUID(), email: "mae@example.com", name: "Mae Employee" },
    ben: { id: randomUUID(), email: "ben@example.com", name: "B".repeat(150) },
    next: { id: randomUUID(), email: "next@example.com", name: "Next Member" },
    waiting: { id: randomUUID(), email: "waiting@example.com", unconfirmed: true },
    guest: { id: randomUUID(), email: "guest@example.com", anonymous: true },
    deleted: { id: randomUUID(), email: "deleted@example.com", deleted: true },
    noEmail: { id: randomUUID(), email: null },
    duplicateA: { id: randomUUID(), email: "duplicate@example.com" },
    duplicateB: { id: randomUUID(), email: "duplicate@example.com" },
  };
  for (const user of Object.values(users)) {
    await db.query(`
      insert into auth.users (id, email, email_confirmed_at, deleted_at, is_anonymous, raw_user_meta_data)
      values ($1, $2, $3, $4, $5, $6)
    `, [
      user.id, user.email, user.unconfirmed ? null : new Date(),
      user.deleted ? new Date() : null, user.anonymous ?? false,
      JSON.stringify({ full_name: user.name ?? "", role: "owner" }),
    ]);
  }
  const { alice, bob, mae, ben, next } = users;
  let orgA;
  let orgB;
  let ownerA;
  let ownerB;
  let memberMae;
  let memberBen;

  await check("migration enables RLS and restricts table privileges despite permissive defaults", async () => {
    const result = await db.query(`select relname, relrowsecurity from pg_class
      where oid in ('public.organizations'::regclass, 'public.memberships'::regclass)`);
    assert.equal(result.rows.length, 2);
    assert.ok(result.rows.every((row) => row.relrowsecurity));
    for (const table of ["organizations", "memberships"]) {
      await denied(null, `select * from public.${table}`, [], "42501", "anon");
      await denied(alice.id, `truncate public.${table}`);
    }
  });

  await check("all public RPCs are invokers and private definers pin search_path", async () => {
    const result = await db.query(`select n.nspname, p.proname, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' or (n.nspname = 'public' and p.proname in
        ('create_organization', 'rename_organization', 'add_organization_member',
         'set_organization_member_role', 'remove_organization_member', 'get_organization_members'))`);
    assert.equal(result.rows.length, 14);
    for (const row of result.rows) {
      assert.equal(row.prosecdef, row.nspname === "private");
      assert.deepEqual(row.proconfig, ['search_path=""']);
    }
    assert.equal((await db.query(`select has_function_privilege('authenticated',
      'private.lock_organization_owner(uuid)', 'execute') as allowed`)).rows[0].allowed, false);
    await denied(null, "select public.create_organization('Anonymous')", [], "42501", "anon");
    await denied(null, "select private.current_organization_id()", [], "42501", "anon");
  });

  await check("only a confirmed, non-anonymous, active Auth account can create a workspace", async () => {
    for (const userId of [null, randomUUID(), users.waiting.id, users.guest.id, users.deleted.id, users.noEmail.id]) {
      await denied(userId, "select public.create_organization('Denied')");
    }
    assert.equal((await db.query("select count(*)::int as count from public.organizations")).rows[0].count, 0);
  });

  await check("workspace creation atomically assigns exactly one owner and trims its name", async () => {
    orgA = await scalar(alice.id, "select public.create_organization($1)", ["  Opening Shift  "]);
    const orgs = (await asUser(alice.id, "select * from public.organizations")).rows;
    assert.equal(orgs.length, 1);
    assert.equal(orgs[0].name, "Opening Shift");
    const members = (await asUser(alice.id, "select * from public.memberships")).rows;
    assert.equal(members.length, 1);
    assert.equal(members[0].user_id, alice.id);
    assert.equal(members[0].role, "owner");
    ownerA = members[0].id;
  });

  await check("repeated owner creation returns the same organization without renaming or duplication", async () => {
    assert.equal(await scalar(alice.id, "select public.create_organization('A different name')"), orgA);
    assert.equal(await scalar(alice.id, "select name from public.organizations"), "Opening Shift");
    assert.equal(await scalar(alice.id, "select count(*)::int from public.memberships"), 1);
  });

  await check("invalid workspace names fail without leaving an organization or membership", async () => {
    for (const name of [null, "", "   ", "X".repeat(121)]) {
      await denied(next.id, "select public.create_organization($1)", [name], "22023");
    }
    assert.equal((await db.query("select count(*)::int as count from public.organizations")).rows[0].count, 1);
    assert.deepEqual((await asUser(next.id, "select * from public.memberships")).rows, []);
  });

  await check("RLS isolates two organizations and returns no rows for an unaffiliated account", async () => {
    orgB = await scalar(bob.id, "select public.create_organization('Evening Shift')");
    ownerB = await scalar(bob.id, "select id from public.memberships");
    assert.deepEqual((await asUser(alice.id, "select id from public.organizations")).rows, [{ id: orgA }]);
    assert.deepEqual((await asUser(bob.id, "select id from public.organizations")).rows, [{ id: orgB }]);
    assert.deepEqual((await asUser(next.id, "select * from public.organizations")).rows, []);
    assert.deepEqual((await asUser(null, "select * from public.memberships")).rows, []);
    await denied(alice.id, "select * from public.get_organization_members($1)", [orgB]);
    await denied(next.id, "select * from public.get_organization_members($1)", [orgA]);
  });

  await check("owners add confirmed accounts as employee or manager using normalized emails", async () => {
    memberMae = await scalar(alice.id, "select public.add_organization_member($1, $2)", [orgA, "  MAE@example.com  "]);
    memberBen = await scalar(alice.id, "select public.add_organization_member($1, $2, $3)", [orgA, ben.email, "manager"]);
    assert.equal(await scalar(mae.id, "select role from public.memberships where user_id = $1", [mae.id]), "employee");
    assert.equal(await scalar(ben.id, "select role from public.memberships where user_id = $1", [ben.id]), "manager");
  });

  await check("the original roster reproduces the hosted varchar-to-text error", async () => {
    const error = await denied(alice.id, "select * from public.get_organization_members($1)", [orgA], "42804");
    assert.match(error.detail, /character varying.*text.*email/);
  });

  await check("the email-type repair preserves existing workspaces, memberships, and execution grants", async () => {
    const organizationsBefore = (await db.query("select * from public.organizations order by id")).rows;
    const membershipsBefore = (await db.query("select * from public.memberships order by id")).rows;
    const repair = await readFile(
      new URL("../supabase/migrations/202609110002_fix_member_email_type.sql", import.meta.url),
      "utf8",
    );
    await db.exec(repair);
    // CREATE OR REPLACE makes an accidental repeated repair safe as well.
    await db.exec(repair);
    assert.deepEqual((await db.query("select * from public.organizations order by id")).rows, organizationsBefore);
    assert.deepEqual((await db.query("select * from public.memberships order by id")).rows, membershipsBefore);
    const grants = (await db.query(`select
      has_function_privilege('anon', 'private.get_organization_members(uuid)', 'execute') as anon,
      has_function_privilege('authenticated', 'private.get_organization_members(uuid)', 'execute') as authenticated
    `)).rows[0];
    assert.deepEqual(grants, { anon: false, authenticated: true });
  });

  await check("anonymous clients have no table write or public RPC permissions", async () => {
    for (const [sql, params] of [
      ["insert into public.organizations(name) values ('Anonymous')", []],
      ["update public.organizations set name = 'Anonymous' where id = $1", [orgA]],
      ["delete from public.organizations where id = $1", [orgA]],
      ["insert into public.memberships(organization_id, user_id, role) values ($1, $2, 'employee')", [orgA, next.id]],
      ["update public.memberships set role = 'owner' where id = $1", [memberMae]],
      ["delete from public.memberships where id = $1", [memberMae]],
      ["select public.create_organization('Anonymous')", []],
      ["select public.rename_organization($1, 'Anonymous')", [orgA]],
      ["select public.add_organization_member($1, $2, 'employee')", [orgA, next.email]],
      ["select public.set_organization_member_role($1, 'manager')", [memberMae]],
      ["select public.remove_organization_member($1)", [memberMae]],
      ["select * from public.get_organization_members($1)", [orgA]],
    ]) {
      await denied(null, sql, params, "42501", "anon");
    }
  });

  await check("members can read their full roster but cannot read Auth users or another roster", async () => {
    for (const user of [alice, mae, ben]) {
      assert.equal(await scalar(user.id, "select count(*)::int from public.memberships"), 3);
      const rows = (await asUser(user.id, "select * from public.get_organization_members($1)", [orgA])).rows;
      assert.deepEqual(rows.map((row) => row.role), ["owner", "manager", "employee"]);
      assert.equal(rows.find((row) => row.user_id === ben.id).name.length, 80);
      assert.equal(rows.find((row) => row.user_id === mae.id).email, mae.email);
      await denied(user.id, "select * from auth.users");
      await denied(user.id, "select * from public.get_organization_members($1)", [orgB]);
    }
  });

  await check("unavailable member targets produce one generic response without account enumeration", async () => {
    const messages = new Set();
    for (const email of ["missing@example.com", users.waiting.email, users.guest.email,
      users.deleted.email, users.duplicateA.email, alice.email, bob.email, mae.email]) {
      const error = await denied(alice.id, "select public.add_organization_member($1, $2, 'employee')", [orgA, email], "P0002");
      messages.add(error.message);
    }
    assert.equal(messages.size, 1);
    assert.equal(await scalar(alice.id, "select count(*)::int from public.memberships"), 3);
  });

  await check("managers and employees cannot administer membership or rename workspaces", async () => {
    for (const user of [mae, ben]) {
      await denied(user.id, "select public.rename_organization($1, 'Takeover')", [orgA]);
      await denied(user.id, "select public.add_organization_member($1, $2, 'employee')", [orgA, next.email]);
      await denied(user.id, "select public.set_organization_member_role($1, 'manager')", [memberMae]);
      await denied(user.id, "select public.remove_organization_member($1)", [memberMae]);
      // Calling a private implementation directly cannot bypass the same checks.
      await denied(user.id, "select private.rename_organization($1, 'Takeover')", [orgA]);
    }
  });

  await check("existing members cannot bootstrap a second organization or elevate user metadata", async () => {
    for (const user of [mae, ben]) {
      await denied(user.id, "select public.create_organization('Second workspace')", [], "23505");
    }
    // Every fixture claims role=owner in editable metadata; membership role wins.
    assert.equal(await scalar(ben.id, "select role from public.memberships where user_id = $1", [ben.id]), "manager");
    assert.equal((await db.query("select count(*)::int as count from public.organizations")).rows[0].count, 2);
  });

  await check("direct inserts, updates, deletes, and role escalation are blocked at table grants", async () => {
    for (const user of [alice, mae, ben]) {
      await denied(user.id, "insert into public.organizations(name) values ('Bypass')");
      await denied(user.id, "insert into public.memberships(organization_id, user_id, role) values ($1, $2, 'owner')", [orgA, next.id]);
      await denied(user.id, "update public.memberships set role = 'owner' where id = $1", [memberMae]);
      await denied(user.id, "update public.memberships set user_id = $1 where id = $2", [next.id, ownerA]);
      await denied(user.id, "update public.memberships set organization_id = $1 where id = $2", [orgB, memberMae]);
      await denied(user.id, "delete from public.memberships where id = $1", [ownerA]);
      await denied(user.id, "update public.organizations set name = 'Bypass' where id = $1", [orgA]);
      await denied(user.id, "delete from public.organizations where id = $1", [orgA]);
    }
  });

  await check("an owner cannot mutate another workspace or unknown member IDs", async () => {
    await denied(alice.id, "select public.rename_organization($1, 'Takeover')", [orgB]);
    await denied(alice.id, "select public.add_organization_member($1, $2, 'employee')", [orgB, next.email]);
    await denied(alice.id, "select public.set_organization_member_role($1, 'employee')", [ownerB]);
    await denied(alice.id, "select public.remove_organization_member($1)", [ownerB]);
    await denied(alice.id, "select public.set_organization_member_role($1, 'employee')", [randomUUID()]);
    await denied(alice.id, "select public.remove_organization_member($1)", [randomUUID()]);
  });

  await check("the owner cannot be demoted, removed, or replaced by role assignment", async () => {
    await denied(alice.id, "select public.set_organization_member_role($1, 'employee')", [ownerA]);
    await denied(alice.id, "select public.remove_organization_member($1)", [ownerA]);
    await denied(alice.id, "select public.set_organization_member_role($1, 'owner')", [memberBen], "22023");
    await denied(alice.id, "select public.add_organization_member($1, $2, 'owner')", [orgA, next.email], "22023");
    await privilegedDenied("insert into public.memberships(organization_id, user_id, role) values ($1, $2, 'owner')", [orgA, next.id], "23505");
    assert.equal(await scalar(alice.id, "select count(*)::int from public.memberships where role = 'owner'"), 1);
  });

  await check("foreign keys prevent deleting an owner Auth account or its occupied organization", async () => {
    await privilegedDenied("delete from auth.users where id = $1", [alice.id], ["23503", "23001"]);
    await privilegedDenied("delete from public.organizations where id = $1", [orgA], ["23503", "23001"]);
    assert.equal(await scalar(alice.id, "select role from public.memberships where id = $1", [ownerA]), "owner");
  });

  await check("database constraints enforce one membership per account and valid roles", async () => {
    await privilegedDenied("insert into public.memberships(organization_id, user_id, role) values ($1, $2, 'employee')", [orgB, mae.id], "23505");
    await privilegedDenied("insert into public.memberships(organization_id, user_id, role) values ($1, $2, 'admin')", [orgA, next.id], "23514");
    for (const role of [null, "admin", "OWNER", ""]) {
      await denied(alice.id, "select public.set_organization_member_role($1, $2)", [memberBen, role], "22023");
    }
  });

  await check("owners can rename with validated bounds and change manager/employee roles", async () => {
    await asUser(alice.id, "select public.rename_organization($1, '  New Opening Shift  ')", [orgA]);
    assert.equal(await scalar(mae.id, "select name from public.organizations"), "New Opening Shift");
    for (const name of [null, " ", "X".repeat(121)]) {
      await denied(alice.id, "select public.rename_organization($1, $2)", [orgA, name], "22023");
    }
    await asUser(alice.id, "select public.rename_organization($1, $2)", [orgA, "X".repeat(120)]);
    await asUser(alice.id, "select public.rename_organization($1, 'A')", [orgA]);
    await asUser(alice.id, "select public.set_organization_member_role($1, 'employee')", [memberBen]);
    assert.equal(await scalar(ben.id, "select role from public.memberships where id = $1", [memberBen]), "employee");
    await asUser(alice.id, "select public.set_organization_member_role($1, 'manager')", [memberBen]);
    assert.equal(await scalar(ben.id, "select role from public.memberships where id = $1", [memberBen]), "manager");
  });

  await check("removing a member immediately revokes RLS access and releases their workspace slot", async () => {
    await asUser(alice.id, "select public.remove_organization_member($1)", [memberMae]);
    assert.deepEqual((await asUser(mae.id, "select * from public.organizations")).rows, []);
    assert.deepEqual((await asUser(mae.id, "select * from public.memberships")).rows, []);
    await denied(mae.id, "select * from public.get_organization_members($1)", [orgA]);
    assert.equal(await scalar(alice.id, "select count(*)::int from public.memberships"), 2);
    const newOrg = await scalar(mae.id, "select public.create_organization('Mae workspace')");
    assert.notEqual(newOrg, orgA);
    assert.equal(await scalar(mae.id, "select role from public.memberships"), "owner");
    await denied(mae.id, "select * from public.get_organization_members($1)", [orgA]);
  });

  console.log(`\n${checks} database checks passed using the exact migrations in PostgreSQL (PGlite).`);
} finally {
  await db.close();
}
