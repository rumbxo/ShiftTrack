# ShiftTrack

ShiftTrack is a responsive shift-task dashboard with Supabase authentication, shared workspaces, saved tasks, and database-enforced roles. Owners and managers assign work to real teammates; employees complete their assigned tasks. Daily, weekly, and monthly tasks create their next occurrence when completed. Built with Next.js App Router, TypeScript, Tailwind CSS, and shadcn-style Radix UI components.

**Existing setup:** if both organization migrations are already applied, run the new [tasks migration](supabase/migrations/202609120001_tasks.sql) in your Supabase SQL Editor, then refresh the dashboard. These application changes do not apply SQL to the hosted project or deploy the website.

## Run locally

Clone the repository and install dependencies:

```bash
git clone git@github.com:rumbxo/ShiftTrack.git
cd ShiftTrack
npm install
cp .env.example .env.local
```

Fill in `.env.local` with your Supabase project's URL and publishable key from its **Connect** dialog:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
```

`.env.local` is ignored by Git. These variables are public client configuration; never put a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.

Complete the [Auth configuration](#configure-supabase-auth) and apply the [database migrations](#configure-the-workspace-database) below before using the dashboard. Then verify the connection and start the app:

```bash
npm run check:supabase
npm run dev
```

For the existing local workspace, open `SaaS/shifttrack`; no new clone is needed. If `.env.local` is already configured, keep it instead of copying the example over it. Restart the development server after changing environment variables.

Open [registration](http://127.0.0.1:3000/register) or [login](http://127.0.0.1:3000/login). Signed-out visitors to `/dashboard` are redirected to `/login`. Signed-in accounts without a membership reach `/onboarding` to create a workspace or wait for an owner to add them. New workspaces start with no tasks. A missing database migration displays a setup message.

Use `127.0.0.1:3000` consistently. `localhost:3000` is a different origin and cookie host. The configured `NEXT_PUBLIC_SITE_URL` determines email destinations and which origin may submit account and workspace forms; change it alongside the Supabase URL settings when using a different address or deploying.

## Configure Supabase Auth

In your Supabase development project's dashboard:

1. Open **Authentication → URL Configuration**. Set **Site URL** to `http://127.0.0.1:3000` and add `http://127.0.0.1:3000/**` under **Redirect URLs**, then save. These settings allow the confirmation and password recovery callbacks. Use exact callback URLs for production. [Supabase redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls)
2. In **Authentication → Sign In / Providers**, enable email/password sign-in and keep **Confirm email** enabled. Hosted projects enable confirmation by default. [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
3. Keep the default **Confirm signup** and **Reset password** email links using `{{ .ConfirmationURL }}`. The app supplies `/auth/callback?next=/dashboard` for signup and `/auth/callback?next=/reset-password` for recovery. Open each email link in the same browser and profile used to submit the form; the PKCE exchange needs the verifier cookie from that browser. [Supabase SSR flow](https://supabase.com/docs/guides/auth/server-side/advanced-guide)

Supabase's default email service sends only to addresses belonging to members of your **Supabase project organization**, with a current limit of two emails per hour. For an initial test, use your Supabase account's email address. Configure custom SMTP before inviting other people to register; adding a ShiftTrack workspace member does not authorize their address for Supabase email delivery. [Supabase email delivery restrictions and SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp)

### Try your first real account

1. Register at `/register` with your name, email, and a password of at least eight characters.
2. Open the confirmation email in the same browser. A new account reaches `/onboarding`; an existing workspace member reaches `/dashboard`. Create your workspace as described below, then verify that the dashboard shows your name and remains signed in after refreshing.
3. Check **Authentication → Users** in Supabase to see the account and its confirmation status.
4. Use **Sign out**, then verify that opening `/dashboard` sends you to login. Sign in again with your email and password.
5. From `/forgot-password`, request a recovery email. Its link opens `/reset-password`; saving a new password signs out the current session and returns you to login.

Registration, email confirmation, login, and sign-out have been manually confirmed in the current development project. The steps above are also the verification checklist for a new deployment. Automated tests use an isolated local Auth fixture; they do not establish that a hosted project's email delivery or dashboard configuration is correct.

### Optional email templates for another browser

The `/auth/confirm` endpoint also supports token-hash links that do not need the original browser's PKCE verifier. To use this alternative, replace the link target in **Confirm signup** with `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, and in **Reset password** with `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. Keep the Site URL accurate; these templates always use it. A local `127.0.0.1` link still needs to be opened on the computer running the app. [Supabase confirmation endpoint example](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)

## Configure the workspace database

Apply these migrations in order to the same Supabase project configured in `.env.local`:

- [202609110001_organizations.sql](supabase/migrations/202609110001_organizations.sql) creates the workspace tables and permissions. Run it once.
- [202609110002_fix_member_email_type.sql](supabase/migrations/202609110002_fix_member_email_type.sql) fixes the member roster’s email return type for Supabase Auth.
- [202609120001_tasks.sql](supabase/migrations/202609120001_tasks.sql) adds saved tasks, task permissions, and recurrence. Run it once.

**Already ran both organization files? Run only `202609120001_tasks.sql`.** If you ran the first file but have not run the email-type repair, run the repair and then the tasks migration. Do not rerun `202609110001_organizations.sql`. The new files preserve existing organizations and memberships.

1. Open that project's **SQL Editor** and create a new query.
2. Copy each complete, unapplied migration file into its own query and run it as the database owner, in the order above. Each file runs in a transaction.
3. Return to the app and refresh `/dashboard`. An existing member should see the saved-task dashboard; a confirmed account without a workspace should reach `/onboarding`.

No database-admin connection is configured in this workspace. Starting the app, running tests, or checking Supabase connectivity does not deploy migrations. If you use Supabase CLI migrations, apply these files through that workflow instead of also running them manually. Keep the `private` schema out of the Data API's exposed schemas. See [database setup and security details](supabase/README.md).

### Verify shared tasks with two real accounts

Use two browser profiles so both accounts can stay signed in. These steps verify the hosted project; automated tests use local fixtures.

1. Sign in with your confirmed owner account. Create a workspace at `/onboarding` if needed. Click the **organization name in the sidebar** and confirm Workspace settings shows you as **Owner**.
2. In the second browser profile, register and confirm a second account. **Leave it on `/onboarding` without creating a workspace.** Your Supabase email configuration must permit delivery to its address.
3. As the owner, open **Workspace settings → Add an existing account**, enter the second account's email, select **Employee**, and add it. Access is granted immediately; no invitation email is sent.
4. In the employee's browser, click **Check my access**. Both accounts should see the same organization and member roster.
5. As the owner, click **Create task**. Name it `Check the exits`, assign it to the employee, choose **One-time**, and set a due date. Create a second task assigned to yourself.
6. In the employee's dashboard, click **Refresh tasks** or return focus to the page. Both tasks should appear. The employee can complete `Check the exits`, but cannot complete your task or create, edit, or delete tasks.
7. Complete `Check the exits` as the employee. Refresh the owner's dashboard and confirm the completion appears. Reload both browsers and confirm the same saved records remain.
8. As the owner, change the employee to **Manager** in Workspace settings. Refresh their browser. The manager can now create, edit, delete pending tasks, and complete any workspace task, while membership controls remain owner-only.
9. Create a **Daily**, **Weekly**, or **Monthly** task and complete it. Confirm the completed occurrence remains and exactly one new pending occurrence appears with a later due date. Refresh again to check that no duplicate is created.
10. To check removal, assign another pending task to the second account, then remove that member in Workspace settings. Their next access refresh returns them to onboarding. The task remains **Unassigned**, and the owner can reassign it.

For a separate-workspace check, the removed account can create its own workspace. Its dashboard should start empty and cannot see the first workspace's tasks. Database tests also check direct requests using another workspace's task IDs.

Each account belongs to one organization. Owners can rename their organization, add existing confirmed accounts that have no organization, switch members between manager and employee, and remove those members. The owner cannot be demoted or removed. Ownership transfer and organization deletion are not implemented yet.

## What works

- Registration, email confirmation, login, logout, and password recovery.
- Verified account access, workspace creation, and saved organization names and memberships.
- Owner-managed membership and a real member roster in Team and `/workspace`.
- Saved tasks shared by everyone in the organization, including unassigned work.
- Owner/manager task creation, editing, assignment, and deletion of pending tasks.
- Employee completion of assigned tasks; owner/manager completion of any workspace task.
- Daily, weekly, and monthly recurrence created atomically on completion.
- Overview totals, completion progress, current overdue status, and recent creation/completion activity.
- Search tasks, filter by status or teammate, and sort by due time.
- Refresh after changes, when returning to the page, and every 30 seconds while the page is visible.
- Responsive navigation and accessible dialogs.

Supabase is the source of truth for tasks and memberships. New workspaces start empty; old browser demo records are not imported or displayed. Browser storage only notifies other tabs about changes; it does not save workspace records. Other devices receive updates on their next refresh. If a refresh fails, the dashboard identifies its last loaded data and offers **Try again**.

Dates appear in the viewing device's time zone. Recurring tasks retain the time zone captured when created. A repeat is scheduled only when the current occurrence is completed; no background scheduler creates a backlog while it remains open. The next due date is the first scheduled time after both the current due date and completion time. Missed intervals are skipped. Monthly schedules retain their original day, so January 31 becomes February 28 and then March 31 in a non-leap year. See [recurrence details](supabase/README.md#recurrence).

Completed tasks cannot be edited, reopened, or deleted through the app. Removing a member clears their task assignments, including historical assignments, while retaining task and completion records. Owners and managers can reassign remaining pending tasks. Set a pending task to **One-time**, or delete it, to stop its future repeats.

Recent activity is derived from the current task rows' creation and completion timestamps. It is not a separate audit log: edits and reassignments are not recorded as events, and deleting a pending task also removes its creation activity.

## Authentication implementation

`@supabase/supabase-js` and `@supabase/ssr` are installed. Browser and server client helpers use the public environment variables. The Next.js 16 request hook lives in `src/proxy.ts`, using the current `proxy` convention in place of `middleware`.

Before matched page requests render, the proxy calls `supabase.auth.getClaims()` to validate or refresh an existing session. Refreshed cookies reach both the current server request and the browser. The dashboard and workspace pages use `getOrganizationContext()`, which verifies the current user with `supabase.auth.getUser()` and reads their membership before rendering. The password update page and endpoint also require a verified user. Authentication, organization, and task API responses use `Cache-Control: private, no-store`.

Account forms submit JSON to `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, and `/api/auth/reset-password`. Sign out sends a POST to `/api/auth/logout` and ends the current Supabase session with `scope: "local"`. Mutations validate the request origin against `NEXT_PUBLIC_SITE_URL`; input validation and mapped provider errors return readable messages. Callback redirects accept only the dashboard or password update destination.

Open tabs synchronize account changes after login, logout, and email callbacks. Workspace pages also refresh access when focused using `/api/organizations/context`, checking current identity, membership, role, and organization name without returning session tokens. Other account pages use `/api/auth/session`. Temporary service failures do not trigger an identity-change reload. Account form inputs stay disabled until their JavaScript handlers are ready, and their native form method is POST.

In a Server Component, Server Action, or Route Handler, verify the current user before accessing account data:

```ts
import { getAuthenticatedUser } from "@/lib/auth/user";

const user = await getAuthenticatedUser();
// Check user before reading account-specific data or performing a mutation.
```

For direct Supabase calls, import `createClient` from `@/utils/supabase/server` and await it for each request. The server helper also accepts an optional cookie store obtained with `await cookies()`. Client Components can import `createClient` from `@/utils/supabase/client` and call it without `await`.

`npm run check:supabase` loads `.env.local` and checks the public Supabase Auth settings endpoint. It verifies connectivity and acceptance of the publishable key without creating users, sending emails, or writing database records. It does not test login, database permissions, or whether migrations have been applied. The dashboard requires all three migrations above; the tutorial's `todos` table is not used.

## Workspace implementation

Organization roles come from `memberships.role`, never editable account metadata or form-supplied organization IDs. Row-level security restricts organization, membership, and task reads to the caller's organization. Authenticated clients have no direct table-write privileges. Validated database functions enforce owner-only membership changes and the task permissions described above. Task assignment uses a membership ID and a composite foreign key requiring the same organization. The API verifies identity, request origin, and input before invoking functions with the signed-in user's Supabase client. No service-role key is used by the application.

Organization creation and owner assignment are atomic. Repeating an owner's creation request returns their existing organization without renaming it; an existing manager or employee cannot create another organization. Task mutations and membership changes lock the organization before checking permission, so removed or demoted members cannot mutate tasks using an old role. Completing a task and creating its next occurrence are one transaction; retrying completion keeps the original result and cannot create duplicate successors. Missing migrations and service errors render an explicit unavailable state. See [supabase/README.md](supabase/README.md) for the permission matrix and database design.

## Checks

Run from the project directory:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:db
npm run check:supabase
```

Install Chromium once before running the Playwright browser tests:

```bash
npx playwright install chromium
npm run test:e2e
```

To serve a production build, run `npm run start` after `npm run build`.

`npm run test:db` runs the exact production migrations in PostgreSQL through PGlite, using local test Auth accounts and Supabase-style roles. Its 46 checks cover organization and task permissions, RLS isolation, rejected direct writes, owner protections, member removal, completion retries, monthly anchors, daylight-saving transitions, and recurrence rollback. It makes no network requests, uses no cloud credentials, and does not apply migrations to your hosted project. Its single database connection does not simulate concurrent sessions.

Playwright builds and starts an isolated production Next.js instance on `127.0.0.1:3100` and a mock Supabase Auth/database service on `127.0.0.1:3101`, overriding credentials for both the build and server processes. The production test build lives in `.next/e2e`; using it avoids development reloads during failure tests. It does not use `.env.local` for service requests or send real confirmation/reset emails. The suite covers account flows, session guards, cookie refresh, workspace onboarding, memberships, shared task persistence, cross-account completion, recurrence, permissions, and responsive layouts. Keep both test ports free. The HTTP fixture validates application integration; it does not execute RLS or prove that a cloud migration has been applied. Use the database checks for SQL and the manual walkthrough above for your real project.

The scripts use Next.js's Webpack option so builds work in environments where Turbopack's local compiler processes are restricted.

With the development server running, `node scripts/visual-check.mjs` captures login and registration at desktop and mobile sizes in the ignored `artifacts/` directory. Optionally set `SHIFTTRACK_STORAGE_STATE` to an existing signed-in Playwright storage-state file to include dashboard previews; keep that file outside Git because it contains session credentials. The automated suite also captures authenticated previews using its local test service.

## Put the app online

The [deployment guide](docs/deployment.md) walks through importing `rumbxo/ShiftTrack` into Vercel, setting the production environment, and configuring Supabase email callbacks. Hosting has not been connected or deployed by these changes. Choose the hosting account and production address, then follow that guide after verifying the shared-task workflow.

Independent scheduled recurrence, email invitations, ownership transfer, account deletion, audit history, and reports remain future stages.

## Main files

| File | Purpose |
| --- | --- |
| `src/app/page.tsx` | Entry route. |
| `src/app/(auth)/` | Login, registration, recovery, and password update screens. |
| `src/app/api/auth/` | JSON account mutations, input validation, and same-origin checks. |
| `src/app/auth/callback/route.ts` | PKCE code exchange and safe redirect. |
| `src/app/auth/confirm/route.ts` | Token-hash signup/recovery verification for custom email templates. |
| `src/app/dashboard/layout.tsx` | Server-side dashboard access guard. |
| `src/app/dashboard/page.tsx` | Verified account, organization, tasks, and roster loaded for the dashboard. |
| `src/app/onboarding/page.tsx` | Workspace creation or access instructions for accounts without membership. |
| `src/app/workspace/page.tsx` | Shared organization settings and member roster. |
| `src/app/api/organizations/` | Organization creation, owner mutations, and access-context refresh. |
| `src/app/api/tasks/` | Shared reads and validated create, update, complete, and delete requests. |
| `src/app/layout.tsx` | Application layout and metadata. |
| `src/app/globals.css` | Theme, layout, and responsive styles. |
| `src/components/dashboard.tsx` | Overview, tasks, team, settings, and forms. |
| `src/components/organizations/` | Workspace setup, membership management, and unavailable screens. |
| `src/components/ui/` | Reusable buttons, inputs, textareas, and dialogs. |
| `src/lib/tasks/` | Task types, validation, verified reads, display helpers, and refresh/mutation state. |
| `src/lib/auth/` | Verified user lookup, schemas, response helpers, and redirect rules. |
| `src/lib/organizations/` | Verified organization context, roster reads, schemas, and API helpers. |
| `src/lib/utils.ts` | Tailwind class merging helper. |
| `src/utils/supabase/config.ts` | Validate public Supabase environment configuration. |
| `src/utils/supabase/client.ts` | Browser Supabase client. |
| `src/utils/supabase/server.ts` | Request-scoped server Supabase client and cookie handling. |
| `src/utils/supabase/proxy.ts` | Validate and refresh sessions, propagating cookie updates. |
| `src/proxy.ts` | Next.js request hook and route matcher for session refresh. |
| `scripts/check-supabase.mjs` | Read-only Supabase connection check. |
| `supabase/migrations/202609110001_organizations.sql` | Organization tables, RLS policies, and protected database functions. |
| `supabase/migrations/202609110002_fix_member_email_type.sql` | Roster email return-type repair for Supabase Auth. |
| `supabase/migrations/202609120001_tasks.sql` | Saved task table, permissions, and recurrence functions. |
| `scripts/test-database.mjs` | Organization migration and permission checks using PGlite. |
| `scripts/test-tasks-database.mjs` | Task permissions, completion, and recurrence checks using PGlite. |
| `tests/auth.spec.ts` | Account-flow, redirect, validation, and session checks. |
| `tests/organizations.spec.ts` | Workspace onboarding, membership, role, and setup integration checks. |
| `tests/dashboard.spec.ts` | Dashboard interactions and responsive layout checks. |
| `tests/tasks.spec.ts` | Shared task workflow, persistence, recurrence, and permission checks. |
| `tests/support/supabase-server.mjs` | Local Auth and database HTTP fixture used only by tests. |
| `docs/deployment.md` | Hosting, production environment, Auth callbacks, and live verification. |
| `.env.example` | Public configuration template; copy to ignored `.env.local`. |

Setup references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Tailwind CSS with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), and [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
