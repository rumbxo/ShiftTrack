# ShiftTrack

The first stage of ShiftTrack: a responsive local dashboard for managing a team's shift tasks. Built with Next.js App Router, TypeScript, Tailwind CSS, and shadcn-style Radix UI components.

## Run locally

Clone the repository and start the app:

```bash
git clone git@github.com:rumbxo/ShiftTrack.git
cd ShiftTrack
npm install
npm run dev
```

For the existing local workspace, open `SaaS/shifttrack` and run `npm run dev`; no new clone is needed.

Open [the dashboard](http://127.0.0.1:3000/dashboard). No account or environment variables are required for this stage.

## What works

- Overview totals, completion progress, and recent activity.
- Create and assign tasks; mark them complete.
- Search tasks, filter by status or teammate, and sort by due time.
- View the team and add local demo members.
- Save your name and organization in Settings.
- Responsive navigation and accessible dialogs.

Tasks, members, activity, and settings persist in this browser's `localStorage` under `shifttrack-demo-v1`. They are not shared across devices or users. If browser storage is unavailable, changes remain available for the current session. Choose **Settings → Reset demo** to restore the original sample workspace.

The dashboard represents a fixed sample shift. Its displayed date, due times, and initial statuses are demo data; overdue status is not calculated from the current clock. Task frequency is saved as a preview setting, but daily or weekly tasks do not automatically repeat.

## Checks

Run from the project directory:

```bash
npm run lint
npm run typecheck
npm run build
```

Install Chromium once before running the Playwright browser tests:

```bash
npx playwright install chromium
npm run test:e2e
```

To serve a production build, run `npm run start` after `npm run build`.

The scripts use Next.js's Webpack option so builds work in environments where Turbopack's local compiler processes are restricted. To capture desktop and mobile previews while the app is running, use `node scripts/visual-check.mjs`; screenshots are saved in the ignored `artifacts/` folder.

## Next stages

Supabase and authentication are not connected yet. Shared database storage, access control, automatic recurrence, actual account invitations, and reports remain future milestones. The team screen currently creates local demo records.

`.env.example` reserves `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for future setup. When that integration is implemented, copy it to `.env.local` and use only the public project URL and public anonymous key in these variables. Never put a Supabase service-role key or other secret in a `NEXT_PUBLIC_` variable. Adding these values alone does not enable authentication or persistence.

## Main files

| File | Purpose |
| --- | --- |
| `src/app/page.tsx` | Entry route. |
| `src/app/dashboard/page.tsx` | Dashboard route. |
| `src/app/layout.tsx` | Application layout and metadata. |
| `src/app/globals.css` | Theme, layout, and responsive styles. |
| `src/components/dashboard.tsx` | Overview, tasks, team, settings, and forms. |
| `src/components/ui/` | Reusable buttons, inputs, textareas, and dialogs. |
| `src/lib/use-workspace.ts` | Validated browser persistence and workspace actions. |
| `src/lib/demo-data.ts` | Sample workspace records and shared types. |
| `src/lib/utils.ts` | Tailwind class merging helper. |

Setup references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind CSS with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
