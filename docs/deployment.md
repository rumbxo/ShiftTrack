# Deploy ShiftTrack

The application and SQL files are prepared locally. No hosting account is connected, no deployment has been created, and the new tasks migration has not been applied to Supabase by these changes. This guide describes a Vercel deployment once you choose that hosting account and a stable production address.

## Prepare the application and database

1. Apply the unapplied [database migrations](../supabase/README.md#apply-the-migrations) to the Supabase project you will use online. If both organization migrations are already applied, run only `202609120001_tasks.sql`.
2. Complete the [two-account workflow](../README.md#verify-shared-tasks-with-two-real-accounts) locally: assignment, employee completion, manager permissions, recurrence, and access removal.
3. Run the checks from the repository root:

```bash
npm run lint
npm run typecheck
npm run test:db
npm run build
npm run test:e2e
```

4. Commit and push the reviewed application changes to `rumbxo/ShiftTrack` when ready to publish them. Keep `.env.local` out of Git. This guide does not commit or push changes for you.

## Import the GitHub repository

In Vercel, choose **Add New → Project**, connect the intended GitHub account, and import `rumbxo/ShiftTrack`. Vercel supports this Next.js app's server-rendered pages and route handlers. [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | `./` — `package.json` is at the Git repository root. |
| Build command | `npm run build` |
| Install command | Default npm installation. |
| Output directory | Leave the Next.js default (`.next`). |
| Production branch | `main`, if it contains your reviewed release. |

The local folder is named `SaaS/shifttrack`, but `shifttrack` itself is the Git repository. Do not select an extra `shifttrack` subdirectory in Vercel. Leave `NEXT_DIST_DIR` unset in production; `.next/e2e` is only for local browser tests.

Vercel's first deployment of a new project is a production deployment. Afterward, pushes to the production branch normally update production, while other branches create previews. Configure production values before using the live app. [Vercel deployment environments](https://vercel.com/docs/deployments/environments)

## Set the production environment

In the project's environment variable settings, add these values for **Production**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The URL of the Supabase project where all migrations were applied. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | That project's publishable key from its Connect dialog. |
| `NEXT_PUBLIC_SITE_URL` | Your actual stable HTTPS production origin: a chosen custom domain or the assigned Vercel project domain. |

`NEXT_PUBLIC_SITE_URL` must contain only the origin, with no path, query, or hash. Open the app at that same address. ShiftTrack checks form request origins against this value and uses it for email links; a different deployment URL will not have working form submissions with the production origin configured.

The Supabase URL and publishable key are public client configuration. Do not add a service-role key, database password, or Supabase access token to these variables. The application does not need them.

Set the actual assigned production address once available, then deploy or redeploy with these values. Environment changes affect new deployments; redeploy after changing any value. [Vercel environment variable management](https://vercel.com/docs/environment-variables/managing-environment-variables)

Use separate settings for previews if you need to test them. A stable preview address needs its own matching `NEXT_PUBLIC_SITE_URL` and Supabase callback entries. For isolated preview data, use a separate Supabase project with the same migrations. Do not expect a random preview URL to accept forms configured for the production origin.

## Configure production email links

In the selected Supabase project, open **Authentication → URL Configuration**:

1. Set **Site URL** to exactly the production origin used in `NEXT_PUBLIC_SITE_URL`.
2. Add both callback URLs below, replacing the example origin with that actual address.
3. Save the settings. Use exact production callback paths; keep wildcard entries limited to development or explicitly configured previews. [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls)

```text
https://your-app.example.com/auth/callback?next=/dashboard
https://your-app.example.com/auth/callback?next=/reset-password
```

The example domain is a placeholder, not a deployed ShiftTrack address. Keep default confirmation and password reset email links using `{{ .ConfirmationURL }}` unless you deliberately configured the token-hash alternative in the [Auth setup](../README.md#optional-email-templates-for-another-browser). For default links, use the same browser profile that requested the email so the PKCE verifier cookie is available.

Keep email confirmation enabled. Configure custom SMTP before public registration: Supabase's default email service restricts recipients to members of the Supabase project organization and is intended for initial testing. Adding someone to a ShiftTrack workspace does not grant email-delivery eligibility. [Supabase SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp)

Local development can retain its `http://127.0.0.1:3000/**` redirect entry when using the same Supabase project. Its `.env.local` should continue to use the local origin. Token-hash templates based on `{{ .SiteURL }}` always point to the project's configured Site URL.

## Verify the live deployment

Open the stable production address and repeat these checks:

1. Register, confirm the email, and create or join a workspace. Confirmation should return to the HTTPS production address.
2. Sign out, sign in, reload, and request a password reset. Its link should open the production password form; saving should return to login.
3. With two accounts in separate browser profiles, assign a task and complete it as its employee. Confirm the owner's dashboard receives the saved completion after refresh.
4. Complete a recurring task and verify one future occurrence appears. Refresh again to confirm it remains a single occurrence.
5. Confirm the employee cannot manage tasks or members, then check the manager role and removal workflow described in the README.
6. Open the workspace on a second device and verify its saved tasks and members.

If the dashboard reports a setup error, check that all three SQL migrations were applied to the project named by the deployment's Supabase URL. A successful Vercel build does not apply SQL. If form submissions fail or email links point elsewhere, compare the browser origin, `NEXT_PUBLIC_SITE_URL`, Supabase Site URL, and allowed callbacks, then redeploy after any environment change.
