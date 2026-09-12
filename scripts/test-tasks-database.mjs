import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

// Execute the exact production SQL, including RLS and grants, in PostgreSQL.
// The Auth fixture matches the hosted varchar email type. PGlite has one
// connection; request concurrency is protected by SQL locks but not simulated.
const db = new PGlite();
let checks = 0;
async function check(name, run) {
  await run();
  console.log(`✓ ${name}`);
  checks += 1;
}
async function asUser(userId, sql, params = [], role = "authenticated") {
  assert.ok(["authenticated", "anon"].includes(role));
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    return tx.query(sql, params);
  });
}
async function scalar(userId, sql, params = []) {
  return Object.values((await asUser(userId, sql, params)).rows[0])[0];
}
async function denied(userId, sql, params = [], code = "42501", role = "authenticated") {
  await assert.rejects(asUser(userId, sql, params, role), (error) => {
    assert.equal(error.code, code, `${sql}: ${error.message}`);
    return true;
  });
}
async function task(id) {
  return (await db.query("select * from public.tasks where id = $1", [id])).rows[0];
}
const createSql = "select public.create_task($1, $2, $3, $4, $5, $6, $7, $8)";
const updateSql = "select public.update_task($1, $2, $3, $4, $5, $6, $7, $8)";
const users = Object.fromEntries(["owner", "manager", "employee", "colleague", "foreign", "outsider"]
  .map((name) => [name, { id: randomUUID(), email: `${name}@example.com` }]));
let org;
let foreignOrg;
let ownerMember;
let managerMember;
let employeeMember;
let colleagueMember;
let foreignMember;
function input(overrides = {}) {
  return {
    organization: org, title: "  Check fire exits  ", description: "  Inspect every exit.  ",
    category: "Safety", assignee: employeeMember, due: "2030-01-31T14:00:00Z",
    frequency: "once", timeZone: "UTC", ...overrides,
  };
}
function params(value, taskId) {
  return [taskId ?? value.organization, value.title, value.description, value.category,
    value.assignee, value.due, value.frequency, value.timeZone];
}
async function create(user = users.owner, overrides = {}) {
  return scalar(user.id, createSql, params(input(overrides)));
}
async function nextDue(anchor, previous, frequency, timeZone, completed) {
  const rows = (await db.query("select private.next_task_due($1, $2, $3, $4, $5) as due",
    [anchor, previous, frequency, timeZone, completed])).rows;
  return rows[0].due?.toISOString() ?? null;
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key, email varchar(255), email_confirmed_at timestamptz,
      deleted_at timestamptz, is_anonymous boolean not null default false,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const filename of ["202609110001_organizations.sql", "202609110002_fix_member_email_type.sql", "202609120001_tasks.sql"]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8"));
  }
  for (const user of Object.values(users)) {
    await db.query("insert into auth.users(id, email, email_confirmed_at) values ($1, $2, now())", [user.id, user.email]);
  }
  org = await scalar(users.owner.id, "select public.create_organization('Day shift')");
  foreignOrg = await scalar(users.foreign.id, "select public.create_organization('Other shift')");
  ownerMember = await scalar(users.owner.id, "select id from public.memberships where user_id = $1", [users.owner.id]);
  foreignMember = await scalar(users.foreign.id, "select id from public.memberships where user_id = $1", [users.foreign.id]);
  managerMember = await scalar(users.owner.id, "select public.add_organization_member($1, $2, 'manager')", [org, users.manager.email]);
  employeeMember = await scalar(users.owner.id, "select public.add_organization_member($1, $2, 'employee')", [org, users.employee.email]);
  colleagueMember = await scalar(users.owner.id, "select public.add_organization_member($1, $2, 'employee')", [org, users.colleague.email]);

  await check("task migration enables RLS and removes broad default privileges", async () => {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid = 'public.tasks'::regclass")).rows[0].relrowsecurity, true);
    await denied(null, "select * from public.tasks", [], "42501", "anon");
    for (const user of Object.values(users)) {
      await denied(user.id, "truncate public.tasks");
      await denied(user.id, "insert into public.tasks(organization_id, title) values ($1, 'Bypass')", [org]);
      await denied(user.id, "update public.tasks set title = 'Bypass'");
      await denied(user.id, "delete from public.tasks");
    }
  });

  await check("public task RPCs are invokers and elevated helpers use locked search paths", async () => {
    const result = await db.query(`select n.nspname, p.proname, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.proname in ('create_task', 'update_task', 'complete_task', 'delete_task',
        'lock_task_member', 'validate_task_input', 'next_task_due')`);
    assert.equal(result.rows.length, 11);
    for (const row of result.rows) {
      assert.equal(row.prosecdef, row.nspname === "private");
      assert.deepEqual(row.proconfig, ['search_path=""']);
    }
    for (const signature of ["private.lock_task_member(uuid)",
      "private.validate_task_input(uuid,text,text,text,uuid,timestamptz,text,text)",
      "private.next_task_due(timestamptz,timestamptz,text,text,timestamptz)"]) {
      for (const role of ["anon", "authenticated"]) {
        assert.equal((await db.query("select has_function_privilege($1, $2, 'execute') as allowed", [role, signature])).rows[0].allowed, false);
      }
    }
    await denied(null, createSql, params(input()), "42501", "anon");
    await denied(null, "select public.update_task($1, 'T', '', 'Safety', null, now(), 'once', 'UTC')", [randomUUID()], "42501", "anon");
    await denied(null, "select public.complete_task($1)", [randomUUID()], "42501", "anon");
    await denied(null, "select public.delete_task($1)", [randomUUID()], "42501", "anon");
  });

  let ownerTask;
  let managerTask;
  let otherTask;
  await check("owners and managers save normalized tasks with trusted creator identity", async () => {
    ownerTask = await create();
    managerTask = await create(users.manager, { title: "Manager task", assignee: managerMember });
    otherTask = await create(users.foreign, { organization: foreignOrg, assignee: foreignMember });
    const row = await task(ownerTask);
    assert.equal(row.title, "Check fire exits");
    assert.equal(row.description, "Inspect every exit.");
    assert.equal(row.created_by, users.owner.id);
    assert.equal(row.assignee_id, employeeMember);
    assert.equal(row.organization_id, org);
    assert.equal(row.completed_at, null);
    assert.equal(row.parent_task_id, null);
    assert.equal(row.frequency, "once");
    assert.equal((await task(managerTask)).created_by, users.manager.id);
  });

  await check("all workspace roles can read tasks while RLS isolates other workspaces and outsiders", async () => {
    for (const user of [users.owner, users.manager, users.employee, users.colleague]) {
      const rows = (await asUser(user.id, "select id, organization_id from public.tasks")).rows;
      assert.equal(rows.length, 2);
      assert.ok(rows.every((row) => row.organization_id === org));
    }
    assert.deepEqual((await asUser(users.foreign.id, "select id from public.tasks")).rows, [{ id: otherTask }]);
    assert.deepEqual((await asUser(users.outsider.id, "select * from public.tasks")).rows, []);
    assert.deepEqual((await asUser(null, "select * from public.tasks")).rows, []);
  });

  await check("employees, outsiders, and cross-workspace owners cannot create tasks", async () => {
    for (const user of [users.employee, users.colleague, users.outsider, users.foreign]) {
      await denied(user.id, createSql, params(input()));
      await denied(user.id, createSql.replace("public.", "private."), params(input()));
    }
    await denied(null, createSql, params(input()));
    await denied(users.owner.id, createSql, params(input({ organization: foreignOrg })));
  });

  await check("input validation rejects malformed fields, unknown zones, and unavailable assignees", async () => {
    for (const override of [
      { title: null }, { title: " " }, { title: "T".repeat(161) },
      { description: null }, { description: "D".repeat(2001) },
      { category: "Admin" }, { category: null },
      { due: null }, { due: "infinity" }, { due: "-infinity" }, { due: "10000-01-01T00:00:00Z" },
      { frequency: null }, { frequency: "yearly" },
      { timeZone: null }, { timeZone: "MadeUp/City" }, { timeZone: "PST8PDTCustom" },
      { assignee: foreignMember }, { assignee: randomUUID() },
    ]) {
      await denied(users.owner.id, createSql, params(input(override)), "22023");
    }
    const id = await create(users.owner, { title: "T".repeat(160), description: "D".repeat(2000), assignee: null });
    assert.equal((await task(id)).assignee_id, null);
  });

  await check("the composite foreign key also rejects privileged cross-workspace assignment", async () => {
    await assert.rejects(db.query("update public.tasks set assignee_id = $1 where id = $2", [foreignMember, ownerTask]),
      (error) => error.code === "23503");
    assert.equal((await task(ownerTask)).assignee_id, employeeMember);
  });

  await check("owners and managers edit pending task details and reassign within their workspace", async () => {
    assert.equal(await scalar(users.manager.id, updateSql, params(input({ title: "Updated inspection", assignee: colleagueMember }), ownerTask)), ownerTask);
    assert.equal((await task(ownerTask)).title, "Updated inspection");
    assert.equal((await task(ownerTask)).assignee_id, colleagueMember);
    assert.equal((await task(ownerTask)).created_by, users.owner.id);
    await scalar(users.owner.id, updateSql, params(input(), ownerTask));
    for (const user of [users.employee, users.foreign, users.outsider]) {
      await denied(user.id, updateSql, params(input(), ownerTask));
    }
    await denied(users.owner.id, updateSql, params(input({ assignee: foreignMember }), ownerTask), "22023");
    await denied(users.owner.id, updateSql, params(input(), otherTask));
    await denied(users.owner.id, updateSql, params(input(), randomUUID()));
  });

  await check("employees complete only their assigned tasks and completion is idempotent", async () => {
    await denied(users.colleague.id, "select public.complete_task($1)", [ownerTask]);
    await denied(users.employee.id, "select public.complete_task($1)", [managerTask]);
    await denied(users.foreign.id, "select public.complete_task($1)", [ownerTask]);
    await denied(users.outsider.id, "select public.complete_task($1)", [ownerTask]);
    await denied(users.owner.id, "select public.complete_task($1)", [randomUUID()]);
    assert.equal(await scalar(users.employee.id, "select public.complete_task($1)", [ownerTask]), ownerTask);
    const completed = await task(ownerTask);
    assert.equal(completed.completed_by, users.employee.id);
    assert.ok(completed.completed_at instanceof Date);
    assert.equal(await scalar(users.owner.id, "select public.complete_task($1)", [ownerTask]), ownerTask);
    assert.deepEqual(await task(ownerTask), completed);
    assert.equal((await db.query("select count(*)::int as count from public.tasks where parent_task_id = $1", [ownerTask])).rows[0].count, 0);
  });

  await check("owners and managers can complete any workspace task, including unassigned tasks", async () => {
    for (const user of [users.owner, users.manager]) {
      const id = await create(users.owner, { assignee: null });
      await denied(users.employee.id, "select public.complete_task($1)", [id]);
      await scalar(user.id, "select public.complete_task($1)", [id]);
      assert.equal((await task(id)).completed_by, user.id);
    }
  });

  await check("completed tasks cannot be edited or deleted even by their owner", async () => {
    const before = await task(ownerTask);
    for (const user of [users.owner, users.manager]) {
      await denied(user.id, updateSql, params(input(), ownerTask), "55000");
      await denied(user.id, "select public.delete_task($1)", [ownerTask], "55000");
    }
    assert.deepEqual(await task(ownerTask), before);
  });

  await check("only owners and managers can delete a pending task from their workspace", async () => {
    const id = await create();
    for (const user of [users.employee, users.foreign, users.outsider]) {
      await denied(user.id, "select public.delete_task($1)", [id]);
    }
    await asUser(users.manager.id, "select public.delete_task($1)", [id]);
    assert.equal(await task(id), undefined);
    await denied(users.owner.id, "select public.delete_task($1)", [otherTask]);
    await denied(users.owner.id, "select public.delete_task($1)", [randomUUID()]);
  });

  await check("daily and weekly recurrence skips missed intervals and never schedules before completion", async () => {
    assert.equal(await nextDue("2030-01-01T09:00:00Z", "2030-01-01T09:00:00Z", "daily", "UTC", "2030-01-05T10:00:00Z"), "2030-01-06T09:00:00.000Z");
    assert.equal(await nextDue("2030-01-01T09:00:00Z", "2030-01-01T09:00:00Z", "weekly", "UTC", "2030-01-09T10:00:00Z"), "2030-01-15T09:00:00.000Z");
    assert.equal(await nextDue("2030-01-01T09:00:00Z", "2030-01-01T09:00:00Z", "daily", "UTC", "2029-12-25T10:00:00Z"), "2030-01-02T09:00:00.000Z");
    assert.equal(await nextDue("2030-01-01T09:00:00Z", "2030-01-01T09:00:00Z", "daily", "UTC", "2030-01-02T09:00:00Z"), "2030-01-03T09:00:00.000Z");
    assert.equal(await nextDue("2030-01-01T09:00:00Z", "2030-01-01T09:00:00Z", "once", "UTC", "2030-01-01T10:00:00Z"), null);
  });

  await check("monthly recurrence retains January 31 through February and handles leap years and missed months", async () => {
    const january = "2030-01-31T09:00:00Z";
    const february = await nextDue(january, january, "monthly", "UTC", january);
    assert.equal(february, "2030-02-28T09:00:00.000Z");
    assert.equal(await nextDue(january, february, "monthly", "UTC", february), "2030-03-31T09:00:00.000Z");
    assert.equal(await nextDue(january, february, "monthly", "UTC", "2030-06-30T09:00:00Z"), "2030-07-31T09:00:00.000Z");
    assert.equal(await nextDue("2032-01-31T09:00:00Z", "2032-01-31T09:00:00Z", "monthly", "UTC", "2032-01-31T09:00:00Z"), "2032-02-29T09:00:00.000Z");
  });

  await check("daily and weekly recurrence keep local wall time across spring and fall DST changes", async () => {
    assert.equal(await nextDue("2030-03-09T14:00:00Z", "2030-03-09T14:00:00Z", "daily", "America/New_York", "2030-03-09T15:00:00Z"), "2030-03-10T13:00:00.000Z");
    assert.equal(await nextDue("2030-11-02T13:00:00Z", "2030-11-02T13:00:00Z", "daily", "America/New_York", "2030-11-02T14:00:00Z"), "2030-11-03T14:00:00.000Z");
    assert.equal(await nextDue("2030-03-03T14:00:00Z", "2030-03-03T14:00:00Z", "weekly", "America/New_York", "2030-03-03T15:00:00Z"), "2030-03-10T13:00:00.000Z");
  });

  await check("DST gaps and repeated hours follow PostgreSQL rules without permanently shifting the anchor", async () => {
    const anchor = "2030-03-09T07:30:00Z"; // 02:30 EST, nonexistent the next day.
    const gap = await nextDue(anchor, anchor, "daily", "America/New_York", anchor);
    assert.equal(gap, "2030-03-10T07:30:00.000Z"); // 03:30 EDT for this occurrence only.
    assert.equal(await nextDue(anchor, gap, "daily", "America/New_York", gap), "2030-03-11T06:30:00.000Z");
    assert.equal(await nextDue("2030-11-02T05:30:00Z", "2030-11-02T05:30:00Z", "daily", "America/New_York", "2030-11-02T05:30:00Z"), "2030-11-03T06:30:00.000Z");
  });

  let recurringTask;
  let childTask;
  await check("recurring completion atomically creates exactly one pending successor with preserved fields", async () => {
    recurringTask = await create(users.manager, { frequency: "monthly", timeZone: "America/New_York" });
    await scalar(users.employee.id, "select public.complete_task($1)", [recurringTask]);
    const rows = (await db.query("select * from public.tasks where parent_task_id = $1", [recurringTask])).rows;
    assert.equal(rows.length, 1);
    childTask = rows[0].id;
    const parent = await task(recurringTask);
    const child = rows[0];
    assert.equal(child.due_at.toISOString(), "2030-02-28T14:00:00.000Z");
    for (const column of ["organization_id", "title", "description", "category", "assignee_id", "frequency", "time_zone", "created_by", "recurrence_anchor_at"]) {
      assert.deepEqual(child[column], parent[column]);
    }
    assert.equal(child.completed_at, null);
    assert.equal(child.completed_by, null);
    await scalar(users.employee.id, "select public.complete_task($1)", [recurringTask]);
    assert.deepEqual((await db.query("select * from public.tasks where parent_task_id = $1", [recurringTask])).rows, rows);
    assert.deepEqual(await task(recurringTask), parent);
    await assert.rejects(db.query(`insert into public.tasks (organization_id,title,category,due_at,recurrence_anchor_at,parent_task_id)
      select organization_id,title,category,due_at,recurrence_anchor_at,parent_task_id from public.tasks where id = $1`, [childTask]),
    (error) => error.code === "23505");
  });

  await check("editing details preserves a clamped month anchor while changing schedule starts a new anchor", async () => {
    const child = await task(childTask);
    await scalar(users.manager.id, updateSql, params(input({ title: "Reassigned recurring inspection", due: child.due_at.toISOString(),
      frequency: "monthly", timeZone: "America/New_York", assignee: colleagueMember }), childTask));
    assert.deepEqual((await task(childTask)).recurrence_anchor_at, child.recurrence_anchor_at);
    await scalar(users.colleague.id, "select public.complete_task($1)", [childTask]);
    const grandchild = (await db.query("select * from public.tasks where parent_task_id = $1", [childTask])).rows[0];
    assert.equal(grandchild.due_at.toISOString(), "2030-03-31T13:00:00.000Z");
    await scalar(users.owner.id, updateSql, params(input({ due: "2030-04-15T12:00:00Z", frequency: "weekly", timeZone: "America/New_York" }), grandchild.id));
    assert.equal((await task(grandchild.id)).recurrence_anchor_at.toISOString(), "2030-04-15T12:00:00.000Z");
  });

  await check("deleting a pending recurring successor stops that chain without rewriting its history", async () => {
    const id = await create(users.owner, { frequency: "daily" });
    await scalar(users.owner.id, "select public.complete_task($1)", [id]);
    const child = (await db.query("select id from public.tasks where parent_task_id = $1", [id])).rows[0].id;
    await asUser(users.manager.id, "select public.delete_task($1)", [child]);
    await scalar(users.owner.id, "select public.complete_task($1)", [id]);
    assert.equal((await db.query("select count(*)::int as count from public.tasks where parent_task_id = $1", [id])).rows[0].count, 0);
    assert.ok((await task(id)).completed_at);
  });

  await check("completion of overdue recurring tasks skips the backlog and creates one future task", async () => {
    const id = await create(users.owner, { due: "2001-01-01T09:00:00Z", frequency: "daily" });
    await scalar(users.employee.id, "select public.complete_task($1)", [id]);
    const parent = await task(id);
    const rows = (await db.query("select * from public.tasks where parent_task_id = $1", [id])).rows;
    assert.equal(rows.length, 1);
    assert.ok(rows[0].due_at > parent.completed_at);
    assert.ok(rows[0].due_at.getTime() - parent.completed_at.getTime() <= 24 * 60 * 60 * 1000);
    assert.equal(rows[0].due_at.getUTCHours(), 9);
  });

  await check("a successor creation failure rolls back completion instead of leaving a broken recurring task", async () => {
    const id = await create(users.owner, { due: "9998-12-31T09:00:00Z", frequency: "weekly" });
    const before = await task(id);
    await denied(users.owner.id, "select public.complete_task($1)", [id], "22023");
    assert.deepEqual(await task(id), before);
    assert.equal((await db.query("select count(*)::int as count from public.tasks where parent_task_id = $1", [id])).rows[0].count, 0);
  });

  await check("demoting a manager immediately removes task administration permissions", async () => {
    await asUser(users.owner.id, "select public.set_organization_member_role($1, 'employee')", [managerMember]);
    await denied(users.manager.id, createSql, params(input()));
    await denied(users.manager.id, updateSql, params(input(), managerTask));
    await denied(users.manager.id, "select public.delete_task($1)", [managerTask]);
    // Their own assignment remains completable as an employee.
    await scalar(users.manager.id, "select public.complete_task($1)", [managerTask]);
    await asUser(users.owner.id, "select public.set_organization_member_role($1, 'manager')", [managerMember]);
  });

  await check("membership removal preserves tasks and history, clears assignments, and revokes all task access", async () => {
    const pending = await create(users.owner, { frequency: "weekly" });
    const taskCount = (await db.query("select count(*)::int as count from public.tasks")).rows[0].count;
    const originalCompletion = (await task(ownerTask)).completed_at;
    await asUser(users.owner.id, "select public.remove_organization_member($1)", [employeeMember]);
    assert.equal((await db.query("select count(*)::int as count from public.tasks")).rows[0].count, taskCount);
    assert.equal((await task(pending)).assignee_id, null);
    assert.equal((await task(ownerTask)).assignee_id, null);
    assert.deepEqual((await task(ownerTask)).completed_at, originalCompletion);
    assert.equal((await task(ownerTask)).completed_by, users.employee.id);
    assert.deepEqual((await asUser(users.employee.id, "select * from public.tasks")).rows, []);
    await denied(users.employee.id, "select public.complete_task($1)", [pending]);
    await denied(users.employee.id, "select public.complete_task($1)", [ownerTask]);
    await denied(users.employee.id, createSql, params(input()));
    await denied(users.owner.id, updateSql, params(input(), pending), "22023");
    await scalar(users.manager.id, updateSql, params(input({ assignee: ownerMember, frequency: "weekly" }), pending));
    assert.equal((await task(pending)).assignee_id, ownerMember);
    await scalar(users.owner.id, "select public.complete_task($1)", [pending]);
  });

  await check("rejoining does not inherit assignments attached to a previous membership ID", async () => {
    const newMember = await scalar(users.owner.id, "select public.add_organization_member($1, $2, 'employee')", [org, users.employee.email]);
    assert.notEqual(newMember, employeeMember);
    await denied(users.employee.id, "select public.complete_task($1)", [ownerTask]);
    assert.equal((await task(ownerTask)).assignee_id, null);
  });

  console.log(`\n${checks} task database checks passed using the exact migrations in PostgreSQL (PGlite).`);
} finally {
  await db.close();
}
