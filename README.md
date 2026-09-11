# ShiftTrack

ShiftTrack is a responsive shift-task dashboard with Supabase registration, email confirmation, login, password recovery, and protected account access. Accounts are real; tasks and teammates are still browser-local demo data. Built with Next.js App Router, TypeScript, Tailwind CSS, and shadcn-style Radix UI components.

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

Verify the connection, then start the app:

```bash
npm run check:supabase
npm run dev
```

For the existing local workspace, open `SaaS/shifttrack`; no new clone is needed. If `.env.local` is already configured, keep it instead of copying the example over it. Restart the development server after changing environment variables.

Complete the Supabase settings below, then open [registration](http://127.0.0.1:3000/register) or [login](http://127.0.0.1:3000/login). Signed-out visitors to `/dashboard` are redirected to `/login`.

Use `127.0.0.1:3000` consistently. `localhost:3000` is a different origin and cookie host. The configured `NEXT_PUBLIC_SITE_URL` determines email destinations and which origin may submit account forms; change it alongside the Supabase URL settings when using a different address or deploying.

## Configure Supabase Auth

In your Supabase development project's dashboard:

1. Open **Authentication → URL Configuration**. Set **Site URL** to `http://127.0.0.1:3000` and add `http://127.0.0.1:3000/**` under **Redirect URLs**, then save. These settings allow the confirmation and password recovery callbacks. Use exact callback URLs for production. [Supabase redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls)
2. In **Authentication → Sign In / Providers**, enable email/password sign-in and keep **Confirm email** enabled. Hosted projects enable confirmation by default. [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
3. Keep the default **Confirm signup** and **Reset password** email links using `{{ .ConfirmationURL }}`. The app supplies `/auth/callback?next=/dashboard` for signup and `/auth/callback?next=/reset-password` for recovery. Open each email link in the same browser and profile used to submit the form; the PKCE exchange needs the verifier cookie from that browser. [Supabase SSR flow](https://supabase.com/docs/guides/auth/server-side/advanced-guide)

Supabase's default email service sends only to addresses belonging to members of your **Supabase project organization**, with a current limit of two emails per hour. For an initial test, use your Supabase account's email address. Configure custom SMTP before inviting other people to register; adding local teammates in ShiftTrack does not authorize their addresses for Supabase email delivery. [Supabase email delivery restrictions and SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp)

### Try your first real account

1. Register at `/register` with your name, email, and a password of at least eight characters.
2. Open the confirmation email in the same browser. You should reach `/dashboard`, see your name, and remain signed in after refreshing.
3. Check **Authentication → Users** in Supabase to see the account and its confirmation status.
4. Use **Sign out**, then verify that opening `/dashboard` sends you to login. Sign in again with your email and password.
5. From `/forgot-password`, request a recovery email. Its link opens `/reset-password`; saving a new password signs out the current session and returns you to login.

These are live account operations to perform yourself. Automated tests use an isolated local Auth fixture; they do not establish that the hosted project's email delivery or dashboard configuration is correct.

### Optional email templates for another browser

The `/auth/confirm` endpoint also supports token-hash links that do not need the original browser's PKCE verifier. To use this alternative, replace the link target in **Confirm signup** with `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, and in **Reset password** with `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. Keep the Site URL accurate; these templates always use it. A local `127.0.0.1` link still needs to be opened on the computer running the app. [Supabase confirmation endpoint example](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)

## What works

- Registration, email confirmation, login, logout, and password recovery.
- Server-verified dashboard access and a greeting using the signed-in account's name.
- Overview totals, completion progress, and recent activity.
- Create and assign tasks; mark them complete.
- Search tasks, filter by status or teammate, and sort by due time.
- View the team and add local demo members.
- Save demo display settings and organization in Settings.
- Responsive navigation and accessible dialogs.

Tasks, members, activity, and settings persist in this browser's `localStorage` under `shifttrack-demo-v1:<user-id>`. Each account gets its own demo workspace in the app; this remains browser storage, not a database permission boundary or shared cloud workspace. Previous data stored under the unscoped `shifttrack-demo-v1` key is not imported into an account. If browser storage is unavailable, changes remain available for the current session. Choose **Settings → Reset demo** to restore the original sample workspace for the signed-in account.

Demo display settings do not update your Supabase account profile. Team roles, task assignments, and additions on the team screen are sample records; they do not grant permissions or create invitations.

The dashboard represents a fixed sample shift. Its displayed date, due times, and initial statuses are demo data; overdue status is not calculated from the current clock. Task frequency is saved as a preview setting, but daily or weekly tasks do not automatically repeat.

## Authentication implementation

`@supabase/supabase-js` and `@supabase/ssr` are installed. Browser and server client helpers use the public environment variables. The Next.js 16 request hook lives in `src/proxy.ts`, using the current `proxy` convention in place of `middleware`.

Before matched page requests render, the proxy calls `supabase.auth.getClaims()` to validate or refresh an existing session. Refreshed cookies reach both the current server request and the browser. The dashboard layout and page additionally call `getAuthenticatedUser()`, which verifies the current user with `supabase.auth.getUser()` before rendering. The password update page and endpoint also require a verified user. Authentication responses use `Cache-Control: private, no-store`.

Account forms submit JSON to `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, and `/api/auth/reset-password`. Sign out sends a POST to `/api/auth/logout` and ends the current Supabase session with `scope: "local"`. Mutations validate the request origin against `NEXT_PUBLIC_SITE_URL`; input validation and mapped provider errors return readable messages. Callback redirects accept only the dashboard or password update destination.

Open dashboard tabs synchronize account changes after login, logout, and email callbacks. Focus checks use `/api/auth/session` to verify identity without returning session tokens. Account form inputs stay disabled until their JavaScript handlers are ready, and their native form method is POST.

In a Server Component, Server Action, or Route Handler, verify the current user before accessing account data:

```ts
import { getAuthenticatedUser } from "@/lib/auth/user";

const user = await getAuthenticatedUser();
// Check user before reading account-specific data or performing a mutation.
```

For direct Supabase calls, import `createClient` from `@/utils/supabase/server` and await it for each request. The server helper also accepts an optional cookie store obtained with `await cookies()`. Client Components can import `createClient` from `@/utils/supabase/client` and call it without `await`.

`npm run check:supabase` loads `.env.local` and checks the public Supabase Auth settings endpoint. It verifies connectivity and acceptance of the publishable key without creating users, sending emails, or writing database records. It does not test login or database permissions. No database table, including the tutorial's `todos` table, is required for this setup.

## Checks

Run from the project directory:

```bash
npm run lint
npm run typecheck
npm run build
npm run check:supabase
```

Install Chromium once before running the Playwright browser tests:

```bash
npx playwright install chromium
npm run test:e2e
```

To serve a production build, run `npm run start` after `npm run build`.

Playwright starts an isolated Next.js instance on `127.0.0.1:3100` and a mock Supabase Auth service on `127.0.0.1:3101`, overriding credentials for those processes. It does not use `.env.local` for Auth requests or send real confirmation/reset emails. The suite covers account flows, session guards, cookie refresh, account-specific demo storage, and the existing dashboard interactions. Keep both test ports free. The mock validates the application's integration behavior; use the manual account walkthrough above to verify your real project and email delivery.

The scripts use Next.js's Webpack option so builds work in environments where Turbopack's local compiler processes are restricted.

With the development server running, `node scripts/visual-check.mjs` captures login and registration at desktop and mobile sizes in the ignored `artifacts/` directory. Optionally set `SHIFTTRACK_STORAGE_STATE` to an existing signed-in Playwright storage-state file to include dashboard previews; keep that file outside Git because it contains session credentials. The automated suite also captures authenticated previews using its local test service.

## Next stages

The next milestone is organizations, memberships, and database-enforced owner/manager/employee permissions, followed by moving tasks and team data into Supabase tables with row-level security. Automatic recurrence, actual account invitations, and reports remain future milestones.

## Main files

| File | Purpose |
| --- | --- |
| `src/app/page.tsx` | Entry route. |
| `src/app/(auth)/` | Login, registration, recovery, and password update screens. |
| `src/app/api/auth/` | JSON account mutations, input validation, and same-origin checks. |
| `src/app/auth/callback/route.ts` | PKCE code exchange and safe redirect. |
| `src/app/auth/confirm/route.ts` | Token-hash signup/recovery verification for custom email templates. |
| `src/app/dashboard/layout.tsx` | Server-side dashboard access guard. |
| `src/app/dashboard/page.tsx` | Verified account identity passed to the dashboard. |
| `src/app/layout.tsx` | Application layout and metadata. |
| `src/app/globals.css` | Theme, layout, and responsive styles. |
| `src/components/dashboard.tsx` | Overview, tasks, team, settings, and forms. |
| `src/components/ui/` | Reusable buttons, inputs, textareas, and dialogs. |
| `src/lib/use-workspace.ts` | Validated browser persistence and workspace actions. |
| `src/lib/demo-data.ts` | Sample workspace records and shared types. |
| `src/lib/auth/` | Verified user lookup, schemas, response helpers, and redirect rules. |
| `src/lib/utils.ts` | Tailwind class merging helper. |
| `src/utils/supabase/config.ts` | Validate public Supabase environment configuration. |
| `src/utils/supabase/client.ts` | Browser Supabase client. |
| `src/utils/supabase/server.ts` | Request-scoped server Supabase client and cookie handling. |
| `src/utils/supabase/proxy.ts` | Validate and refresh sessions, propagating cookie updates. |
| `src/proxy.ts` | Next.js request hook and route matcher for session refresh. |
| `scripts/check-supabase.mjs` | Read-only Supabase connection check. |
| `tests/auth.spec.ts` | Account-flow, redirect, validation, and session checks. |
| `tests/support/supabase-server.mjs` | Local Auth fixture used only by tests. |
| `.env.example` | Public configuration template; copy to ignored `.env.local`. |

Setup references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Tailwind CSS with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), and [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
