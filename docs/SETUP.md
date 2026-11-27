# Setup guide

This is the human walkthrough for getting the Masar X monorepo running
locally. It covers the pnpm workspace: `apps/web` (Next.js 16, production),
`apps/desktop` (Electron), `apps/mobile` (Expo), and the shared
`packages/shared` (types, i18n messages, Supabase client factory, AI client).
For the short verify-checklist version see
[`docs/agents/references/00-setup.md`](agents/references/00-setup.md).

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | >= 24 | Pinned in `.nvmrc`; CI runs Node 24 |
| pnpm | 9.15.4 | Pinned via `packageManager` in `package.json`; enable with `corepack enable` |
| Supabase project | latest | Database, auth, storage, Edge Functions |
| Cloudinary account | optional | Needed for file/image uploads |

## Install

```bash
git clone https://github.com/Masar-X/Masar-x.git
cd Masar-x
corepack enable
pnpm install
```

`pnpm install` links every workspace to `packages/shared` via the workspace
protocol — no per-app install is needed. Native-module postinstall builds run
only for the allow-list in `pnpm-workspace.yaml` (`onlyBuiltDependencies`);
read the comment there before adding a dependency with a build script.

## Environment variables

Copy the template and fill in real values — never commit `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Required | Scope | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | client | Supabase publishable key |
| `DATABASE_URL` | Yes | server only | Direct Postgres connection (Drizzle / admin scripts) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Yes | client | Upload cloud name |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Yes | client | Unsigned upload preset |
| `NEXT_PUBLIC_SITE_URL` | Yes | client | Canonical site URL (OG tags, sitemaps) |
| `NEXT_PUBLIC_GA_ID` | No | client | Google Analytics ID |
| `NEXT_PUBLIC_FACULTY` | No | client | Faculty white-label preset (`fcai-asnu`, `bis`) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | server only | Durable rate limiting (flows fail open when unset) |
| `SENTRY_DSN` | No | server only | Error monitoring (blank = disabled) |
| `VERCEL_MCP_BYPASS_SECRET` | No | server only | Auth secret for `/api/mcp` |
| `ANALYZE` | No | build | Enable the Next.js bundle analyzer |

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time and
are visible to every browser — keep real secrets out of them.
[`.env.example`](../.env.example) is the authoritative, commented list.

## Database

The Supabase project is the single backend. Point the Supabase env vars at
your project, then apply the timestamped migrations in `supabase/migrations/`
in lexical order. The full replay procedure (roles, extensions prelude,
migrations, seed, SQL harnesses) is documented in
[`supabase/tests/README.md`](../supabase/tests/README.md), and CI replays the
same chain in its `db-verify` job.

Optional seed data:

- `pnpm seed:launch --dry-run` — probe the schema and print the planned MVP
  launch seed (three Term-1 subjects, lectures, a demo quiz) without writing;
  drop `--dry-run` to write. Needs `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
- `pnpm --filter web setup-subjects` — rewrite subjects from
  `apps/web/src/config/subjects.config.ts`.

## Development

```bash
pnpm dev            # web app at http://localhost:3000
pnpm dev:desktop    # Electron shell over a local Next.js server
pnpm dev:mobile     # Expo dev server
```

Mobile simulators: `pnpm --filter mobile ios` / `pnpm --filter mobile android`.

## Verification

```bash
pnpm typecheck      # TypeScript across all workspaces
pnpm lint           # ESLint (web); desktop/mobile have their own lint scripts
pnpm test           # vitest suites across all workspaces
```

Playwright e2e for the web app: `pnpm --filter web test:e2e`. The run contract
(env vars, seeded-cookie auth, the fresh-worktree `.env.local` note) is
[`docs/agents/references/12-e2e-testing.md`](agents/references/12-e2e-testing.md).

## Production build & deploy

- **Web** — `pnpm build` (Next.js standalone output). Deployed on Vercel; the
  deployment config lives at `apps/web/vercel.json`.
- **Desktop** — `pnpm build:desktop`; pushing a tag runs `release.yml` and
  publishes installers to GitHub Releases.
- **Mobile** — Expo/EAS builds are owner-operated; CI does not deploy them.
- **Edge Functions** — deployed by hand from `supabase/functions/`; never by CI.

## Troubleshooting

Known pitfalls (Vercel installs, the pnpm allow-list syntax, Windows env vars,
Electron builds, theme hydration, …) live in
[`docs/agents/references/01-gotchas.md`](agents/references/01-gotchas.md) —
search by subsystem before debugging from scratch.

## License

AGPL-3.0-only for code; content and brand assets carry their own carve-outs —
see [`NOTICE.md`](../NOTICE.md).
