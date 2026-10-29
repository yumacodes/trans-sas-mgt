# Deploying the API to Vercel

The API runs as a single Vercel serverless function: `api/index.js` exports the Express
app built by `pnpm build` (tsup → `dist/app.js`), and the catch-all rewrite in
`vercel.json` sends every request to it, keeping the original path so `/health` and
`/api/v1/...` reach their normal routes.

## Project settings (set once, not stored in this repo)

| Setting | Value | Why |
| --- | --- | --- |
| Root Directory | `apps/api` | The build runs here; pnpm still installs the whole workspace, so `@tsm/shared` resolves. |
| Framework Preset | *Other* (none) | Vercel's Express preset compiles `src/app.ts` with its own tsc settings and fails on the default imports; the function here is prebuilt instead. |
| Output Directory | `public` | A serverless-only project still needs one. It holds a single placeholder page; the rewrite shadows everything else. |

Deploy from the **workspace root** (`vercel deploy --prod`), not from `apps/api`, so the
upload includes `pnpm-lock.yaml` and `packages/`.

## Environment variables

Set these in the Vercel project (Production), from the values in the root `.env`:

`DATABASE_URL` (transaction pooler, port 6543), `DIRECT_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_STORAGE_BUCKET`,
`CORS_ORIGINS` (the web app's origins), `APP_URL`, `LOG_LEVEL`, `TRUST_PROXY=1`.

Optional: the `SMTP_*` / `MAIL_*` block enables the Communication module. Without it the
app runs normally and that page shows a setup notice.

`PORT` is ignored on Vercel. Copy values without the surrounding quotes used in `.env`.
Changing a variable only takes effect on the next deployment.

## Limits

Message delivery continues after the response via `waitUntil` (see `src/lib/background.ts`)
and must finish inside the function's `maxDuration` (60s in `vercel.json`). Recipients left
`pending` by a send that was cut short are picked up by the message's Retry action.
