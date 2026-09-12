# Workspace database

The database stores organizations, memberships, and tasks. Apply migrations to the Supabase project selected by `.env.local`; the app uses its publishable key and each account's session to access these records.

## Apply the migrations

| Order | Migration | Purpose |
| --- | --- | --- |
| 1 | [202609110001_organizations.sql](migrations/202609110001_organizations.sql) | Organizations, memberships, roles, and protected operations. Run once. |
| 2 | [202609110002_fix_member_email_type.sql](migrations/202609110002_fix_member_email_type.sql) | Repair the member roster's email return type. |
| 3 | [202609120001_tasks.sql](migrations/202609120001_tasks.sql) | Shared tasks, task permissions, and recurrence. Run once. |

**If both organization migrations already succeeded, run only `202609120001_tasks.sql`.** If only the first succeeded, apply the email-type repair before the tasks migration. Do not rerun the initial organization migration.

In Supabase, open **SQL Editor → New query**, paste one complete unapplied file, and run it as the database owner. Repeat for remaining files in the order above. Each file is transactional. Keep `private` out of the Data API's exposed schemas. If you already use Supabase CLI migrations, apply the files through that workflow instead of also running them manually.

No database-admin connection is configured in this workspace. The new tasks migration has not been applied to the hosted project by these changes. Starting the app, running tests, checking connectivity, or deploying the website does not apply SQL migrations.

The email-type repair fixes PostgreSQL error `42804`: the original function returned Supabase Auth's `varchar(255)` email as a declared `text` result. The repair explicitly casts it and preserves existing data and permissions. Database tests reproduce the original failure before applying the repair.

After applying the tasks migration, refresh `/dashboard`. New workspaces have no tasks. The app does not import previous browser demo data. Follow the [two-account walkthrough](../README.md#verify-shared-tasks-with-two-real-accounts) to verify the hosted database and application together.

## Permissions

| Operation within the member's workspace | Owner | Manager | Employee |
| --- | --- | --- | --- |
| Read organization, roster, and all tasks | Yes | Yes | Yes |
| Rename workspace | Yes | No | No |
| Add or remove managers/employees | Yes | No | No |
| Switch a member between manager and employee | Yes | No | No |
| Create tasks and edit or delete pending tasks | Yes | Yes | No |
| Assign pending tasks to current members or leave unassigned | Yes | Yes | No |
| Complete a pending task | Any task | Any task | Assigned to that employee only |
| Edit, reopen, or delete a completed task | No | No | No |
| Change/remove the owner or access another workspace | No | No | No |

Roles are database membership values, never editable Auth metadata. Each account belongs to one workspace. An owner can add an existing confirmed account by email only when it has no workspace; this grants access immediately and sends no email. Ownership transfer, workspace deletion, account deletion, email invitations, and multiple memberships per account are not implemented.

Removing a member retains tasks and completion records but clears their assignments, including historical assignments. Owners and managers can reassign pending tasks. Rejoining creates a new membership ID, so the account does not inherit its old assignments. Creation and completion actors use Auth user IDs; administrative hard deletion of an account clears those actor references. A foreign key blocks hard deletion while the account still has a membership. Privileged administrative soft deletion remains an administrator responsibility.

## Task data and database functions

`public.tasks` stores title, description, category, organization, nullable membership assignment, due date, frequency, time zone, creation/completion timestamps and actors, the recurrence anchor, and the preceding occurrence's ID. A composite foreign key ensures the assignee belongs to the same organization. Deleting a membership sets only the assignment to null.

The three tables expose authenticated `SELECT` only, with row-level security restricting reads to the caller's organization. Clients have no direct insert, update, or delete grants. Public RPCs are security-invoker wrappers around private implementations with an empty `search_path` and explicit execution grants. This follows Supabase's guidance for [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database function security](https://supabase.com/docs/guides/database/functions).

| Task RPC | Result |
| --- | --- |
| `create_task(organization_id, title, description, category, assignee_id, due_at, frequency, time_zone)` | New task UUID. |
| `update_task(task_id, title, description, category, assignee_id, due_at, frequency, time_zone)` | Updated task UUID; completed tasks are rejected. |
| `complete_task(task_id)` | Completed task UUID; repeat calls preserve the original completion. |
| `delete_task(task_id)` | No result; pending tasks only. |

RPC argument names use a `p_` prefix in SQL. Task mutations and membership administration lock the organization row before checking the current membership and role. This serializes task changes with member removal and demotion. Organization creation/addition also locks the target Auth account. A partial unique index protects the single owner, who cannot be removed or demoted through the RPCs.

## Recurrence

Frequency is `once`, `daily`, `weekly`, or `monthly`. Completing a repeating task creates exactly one next pending occurrence in the same transaction. That occurrence copies the details, assignment, frequency, time zone, and original creator. A unique `parent_task_id` and idempotent completion prevent duplicate successors when a request is retried.

The next occurrence is the first scheduled instant strictly after both the previous due time and completion time. Missed intervals are skipped. Overdue tasks remain open until completed; no independent cron job creates occurrences while work remains unfinished.

Schedules retain the original local wall time in the saved IANA time zone. Monthly schedules also retain the original day: January 31 becomes February 28 and then March 31 in a non-leap year. Ordinary daily and weekly tasks retain their local hour across daylight-saving changes. For a nonexistent spring-forward local time, PostgreSQL moves that occurrence through the gap; for a repeated fall-back hour, it uses the later standard-time occurrence. Later repeats still use the original wall-time anchor. [PostgreSQL timestamp transition rules](https://www.postgresql.org/docs/current/datetime-invalid-input.html)

Editing details or assignment preserves the schedule anchor. Changing the due date, frequency, or time zone starts an anchor at the new due date. Set a pending task to `once` or delete it to stop future repeats. Deleting a pending successor leaves completed ancestors intact; retrying an ancestor's completion does not recreate the deleted successor.

## Synchronization and activity

The dashboard reloads tasks and the roster after mutations, on focus, through the refresh button, and every 30 seconds while visible. Other tabs receive a change notification when browser storage is available; other devices see the update on their next refresh. Workspace records are saved in Supabase, not browser storage.

Recent activity is derived from current task rows' creation and completion timestamps. It is not a durable audit history: edits and reassignments have no event record, and deleting a pending task removes its creation activity. Completed rows remain, with the assignment-clearing behavior described above.

## Verify locally

```bash
npm run test:db
```

The 46 checks execute the exact migrations in PostgreSQL through PGlite with test Auth accounts and Supabase-style roles. They cover RLS isolation, direct-write denial, owner protection, task roles, assignment isolation, removal and rejoining, completion retries, skipped intervals, leap years, month-end anchors, daylight-saving transitions, and rollback if the successor cannot be created.

These tests make no network requests and do not use `.env.local`. PGlite uses one connection, so the suite does not simulate concurrent sessions. Browser tests use a separate HTTP fixture to verify application integration. Neither suite applies migrations or confirms the hosted project's API configuration; use the manual walkthrough for that verification.
