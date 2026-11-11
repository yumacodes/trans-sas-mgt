# Trans Sas Management

Internal business management system for a medical equipment company: clients, stock, proformas, tender price schedules, acceptance letters, expenses and company administration.

## Architecture

A pnpm monorepo:

| Path | What it is |
| --- | --- |
| `apps/web` | React, Vite and TypeScript frontend |
| `apps/api` | Express and Prisma API. The only code that talks to the database |
| `packages/shared` | Validation schemas, types, permissions and money calculations used by both |

Trust boundaries:

- The browser holds only the Supabase URL and anon key. It signs in with Supabase Auth and sends the session token to the API.
- The API verifies that token on every request and enforces permissions and branch access itself.
- Prisma connects with a privileged database role that bypasses Row Level Security, so RLS is not relied on for authorisation. It is enabled on tables to block direct access through the Supabase client.
- Files live in a private Supabase Storage bucket and are served through short-lived signed links issued by the API.

### Branch data

| Record | Scope |
| --- | --- |
| Proformas, tenders, acceptance letters | Belong to one branch |
| Clients, expenses | Belong to a branch, or company-wide when no branch is set |
| Stock balances and movements | Per branch |
| Stock catalogue, company profile, roles | Shared |

Users holding `branches.all_access` see every branch. Everyone else sees only the branches they are assigned to.

## Requirements

- Node.js 22 or newer
- pnpm 11.9.0 (`npm install -g pnpm@11.9.0`)
- A Supabase project

## Setup

```sh
git clone https://github.com/yumacodes/trans-sas-mgt.git
cd trans-sas-mgt
pnpm install
cp .env.example .env
```

Fill in `.env`; each value's location in the Supabase dashboard is described in `.env.example`. There is one `.env`, at the repository root. Never commit it. Only `VITE_` variables reach the browser, so never give a secret that prefix.

Supabase needs:

- **Auth:** email sign-in enabled. There is no public registration; administrators create users.
- **Storage:** a private bucket named as in `SUPABASE_STORAGE_BUCKET`.
- **Database:** `DATABASE_URL` is the transaction pooler (port 6543), used by the running API. `DIRECT_URL` is the session pooler (port 5432), used for migrations. Some networks block port 5432.

Then:

```sh
pnpm db:deploy   # apply migrations
pnpm db:seed     # development data only; its records are marked [DEMO]
pnpm dev         # web on http://localhost:5173, API on port 4000
```

## Initial administrator

Create the user in Supabase Auth, then run the seed with the admin variables described in `apps/api/prisma/seed.ts`. Never add a public route that grants privileged access.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run web and API together |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check every package |
| `pnpm lint` | Lint |
| `pnpm build` | Production build |
| `pnpm db:migrate` | Create a migration during development |
| `pnpm db:deploy` | Apply migrations |

GitHub Actions runs typecheck, lint, tests and build on every push to `main`.

## Deployment

Two Vercel projects deploy from this repository:

- `trans-sas-mgt`: the web app, root directory `apps/web`.
- `trans-sas-mgt-api`: the API, root directory `apps/api`.

To deploy the API by hand, run `vercel deploy --prod` from the **repository root**. Running it inside `apps/api` deploys to the wrong project.

Apply database migrations before deploying code that depends on them.

## Troubleshooting

- **`EPERM ... query_engine` during install or `prisma generate` on Windows:** a running dev server has the Prisma engine locked. Stop `pnpm dev` and retry.
- **`P1001` when migrating:** your network is blocking port 5432. Try another network.
- **"Couldn't load this information" after a schema change:** the API is running older code or the migration hasn't been applied.
- **Documents print `[DEMO]` in the letterhead:** update Admin > Company Profile.
