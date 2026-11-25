# Masar X - Architecture

One-page map of the workspace boundaries and the client/server data flow
rules the codebase is actually organized around. Paths are relative to the
repository root unless noted.

## Workspace

- `apps/web` - Next.js 16 + React 19 PWA; the source of truth for product
  behavior.
- `apps/desktop` - Electron shell running the same Next.js app from a local
  loopback server (loopback-only Host guard lives in `apps/web/src/proxy.ts`).
- `apps/mobile` - Expo / React Native port aiming at feature parity.
- `packages/shared` (imported as `masarx-shared`) - cross-app code:
  `messages/{ar,en}` translations, `i18n/`, `format/`, `ai/` (shared AI
  client), `supabase/` (client factory), `schedules/` (parser + timetable
  data), `types/` (DB types + Zod schemas), `branding/` (faculty presets).
- `supabase/` - SQL `migrations/` and Deno Edge `functions/` (ai-chat,
  summarize-chat, upload-file, upload-avatar, delete-file, delete-avatar,
  process-pdf, cloudinary-webhook, auth-hook-email, request-password-reset,
  reset-password). Edge Functions are deployed manually by the owner; no CI
  workflow deploys them.

## Web data flow - server side (never in the browser bundle)

Everything on the Next.js server surface talks to Supabase with
cookie-based or service-role clients:

- `apps/web/src/proxy.ts` (middleware): nonce + CSP headers, i18n routing,
  and session refresh via `updateSession()` in
  `apps/web/src/lib/supabase/proxy.ts`, which also gates `/non-academic`,
  `/admin*`, `/profile`, `/quiz-attempts` and `/add-*` routes.
- `apps/web/src/lib/supabase/server.ts` - `createClient()` (`@supabase/ssr`
  + `next/headers` cookies) for Server Components, Route Handlers and
  Server Actions; `getCachedUser()` dedupes the per-render auth roundtrip.
- `apps/web/src/lib/supabase/admin.ts` - `getSupabaseAdmin()`
  service-role client, `import "server-only"`, bypasses RLS; trusted server
  contexts only, after the caller is verified.
- Server Actions: `apps/web/src/actions/auth.ts`, `content.ts`,
  `profile.ts` - authenticate via the server client, write via the admin
  client, `revalidatePath()` what they changed.
- Route Handlers: `apps/web/src/app/api/**/route.ts` (admin metrics, AI,
  auth sync, health, MCP, metrics events).
- The anon key is public by design; Row Level Security is the authorization
  layer for everything that is not the service-role client above.

## Web data flow - browser side

- `apps/web/src/lib/supabase.ts` (`@/lib/supabase`) - the shared browser
  client singleton.
- `apps/web/src/lib/supabase/client.ts` (`@/lib/supabase/client`) - a fresh
  cookie-aware client per call for callers that must own their instance.
- Both build on the `masarx-shared/supabase` factory
  (`packages/shared/src/supabase/`), which refuses a service-role JWT and
  tags every request with a `client-info` header.
- Consumers: hooks under `apps/web/src/hooks/`, the contexts
  (`AuthContext`, `PlatformSettingsContext`), and client components.
  Browser clients are RLS-bound with the anon key.
- Ratchet: `no-restricted-imports` in `apps/web/eslint.config.mjs` forbids
  importing the browser client (`@/lib/supabase`, `@/lib/supabase/client`,
  or any relative spelling) from `apps/web/src` outside
  `src/lib/supabase/**`; the grandfathered files are listed in
  `apps/web/eslint-supabase-allowlist.mjs` (48 files - `profile/page.tsx`
  tracks as T-011b, `courses/[courseId]/page.tsx` as T-011c). New
  browser-side Supabase usage means an allowlist edit; prefer a server path
  instead.

## AI boundary

Contract (`specs/004-multi-platform-expansion/contracts/ai-boundary.md`):
the AI provider key never appears in any client bundle. Three paths:

- Puter.js, client-side (`apps/web/src/lib/puter.ts`, `@heyputer/puter.js`):
  user-supplied compute, no server key involved; the primary chat path.
- `POST /api/ai/chat` (`apps/web/src/app/api/ai/chat/route.ts`): server-side
  streaming through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`); fails
  closed with 503 when unset; JWT auth + per-user rate limiting.
- `POST /api/ai-chat` (`apps/web/src/app/api/ai-chat/route.ts`):
  authenticated proxy to the `ai-chat` Edge Function, used by the shared
  client (`packages/shared/src/ai/`); the provider key lives only in the
  Edge Function's env.
- ESLint (`apps/web/eslint.config.mjs`) forbids direct `openai` /
  `@anthropic-ai/sdk` imports in client contexts.

## Storage

Cloudinary (PDFs + images), brokered by Edge Functions so no Cloudinary
credential reaches the browser: `uploadToCloudinary()`
(`apps/web/src/lib/cloudinary.ts`) posts base64 to the `upload-file`
function; deletes go through `delete-file` / `delete-avatar`;
`cloudinary-webhook` and `process-pdf` complete the pipeline.

## Metrics & rate limiting

Upstash Redis over plain REST, fail-open everywhere: product metrics in
`apps/web/src/lib/metrics.ts` (counters + HyperLogLog daily active users),
sliding-window rate limiting in `apps/web/src/lib/rate-limit.ts`
(Upstash, then Supabase REST fallback, then in-memory).

## Releases

Web deploys from `main` via Vercel; desktop and mobile ship through GitHub
Releases (`.github/workflows/release.yml`). See
`docs/agents/references/02-release-pipeline.md`.
