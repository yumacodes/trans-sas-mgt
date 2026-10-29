# Deploying the web app to Vercel

Separate Vercel project from the API, with Root Directory `apps/web` and the Vite
preset. `vercel.json` adds the SPA fallback; without it every URL except `/` is a 404.

Vite reads `VITE_*` at **build** time and bakes the values into the bundle, so these
must exist in the Vercel project before the build, not just at run time:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — the same public values as in the root
  `.env` (anon/publishable key only; the build refuses a service_role key).
- `VITE_API_URL` — the deployed API, e.g. `https://trans-sas-mgt-api.vercel.app/api/v1`.
  The `/api/v1` default only works in development, where Vite proxies to localhost.

The API's `CORS_ORIGINS` must list this app's origin, and its `APP_URL` should point here
so password-reset links land on the deployed app. Both live in the API project's
environment; see `apps/api/DEPLOY.md`.

Changing any of these takes effect on the next deployment.
