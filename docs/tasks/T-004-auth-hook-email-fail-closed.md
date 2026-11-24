---
id: T-004
title: "Enforce fail-closed auth-hook-email JWT verification"
priority: P0
status: todo
depends_on: []
touches:
  - "supabase/functions/auth-hook-email/index.ts"
  - "supabase/functions/_shared/tests/handler-auth-hook-email.test.ts"
owner_action: true
area: supabase
estimate: 0.5d
---

## Context

- [VERIFIED] `supabase/functions/auth-hook-email/index.ts:32` reads `SEND_EMAIL_HOOK_SECRET = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? ''` at module load.
- [VERIFIED] `supabase/functions/auth-hook-email/index.ts:102-116` falls back to `"RESTRICTED mode"` with only a `console.warn` when `SEND_EMAIL_HOOK_SECRET` is empty, allowing unverified callers with the public anon key to invoke the handler (`verifyHookJwt` at lines `50-70` only runs inside the `else` branch at line `107`).
- [VERIFIED] `supabase/functions/_shared/tests/` has 14 Deno test files (e.g. `supabase/functions/_shared/tests/handler-request-password-reset.test.ts:1-26` using `import-map.json` + `stubs/std-server.ts`), and `supabase/functions/cloudinary-webhook/signature_test.ts`, with zero tests covering `auth-hook-email`.
- [VERIFIED] `AGENTS.md` ledger rows `036-wave1c-chat-interaction-perf` and `040-review-remediation` note that Edge Functions are owner-deployed and that `owner still owes SEND_EMAIL_HOOK_SECRET`.
- [INFERRED] **HARD PRECONDITION:** Whether `SEND_EMAIL_HOOK_SECRET` is currently configured in production Supabase Edge Function secrets cannot be verified from this repo; merging and deploying fail-closed code before the secret is confirmed set in prod (`supabase secrets list`, which prints names only) will break all production auth emails (`signup`, `recovery`, `magiclink`, `email_change`, `invite`).

## Goal

Make `supabase/functions/auth-hook-email/index.ts` fail closed (`500` when `SEND_EMAIL_HOOK_SECRET` is missing, `401` on invalid/missing JWT), add offline Deno handler tests, and enforce the pre-merge owner secret check before deploying.

## Non-goals

- Modifying other Edge Functions or `_shared/` modules outside `auth-hook-email` tests.
- Deploying Edge Functions or mutating Supabase Dashboard secrets autonomously (owner-owned).

## Steps

1. Edit `supabase/functions/auth-hook-email/index.ts:102-116` so `!SEND_EMAIL_HOOK_SECRET` logs an error and returns HTTP `500` JSON `{ error: 'Auth hook misconfigured' }` (fail-closed) instead of entering restricted mode, and update the file header comment (`supabase/functions/auth-hook-email/index.ts:9-17`).
2. Add `supabase/functions/_shared/tests/handler-auth-hook-email.test.ts` following the `supabase/functions/_shared/tests/handler-request-password-reset.test.ts` pattern (`std-server.ts` stub + `import-map.json`) covering: missing `SEND_EMAIL_HOOK_SECRET` -> `500`, missing/invalid JWT -> `401`, valid HS256 JWT + allowlisted redirect -> `200`, and disallowed redirect -> `400`.
3. Run `deno check --config deno.jsonc ./*/index.ts` (from `supabase/functions`) and `deno test --allow-env --import-map=supabase/functions/_shared/tests/import-map.json supabase/functions/_shared/tests/` (matching `.github/workflows/ci.yml:533-544`).
4. Label the PR `blocked` and `owner-action` and include exact owner pre-merge commands (`supabase secrets list` to verify `SEND_EMAIL_HOOK_SECRET` exists in prod before merge, `supabase secrets set SEND_EMAIL_HOOK_SECRET=...` if absent, and `supabase functions deploy auth-hook-email`). **HARD PRECONDITION:** PR MUST NOT merge until the owner verifies `SEND_EMAIL_HOOK_SECRET` is present in prod and comments `"owner step done"` on the PR.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `cd supabase/functions && deno check --config deno.jsonc ./*/index.ts` exits 0.
- [ ] `deno test --allow-env --import-map=supabase/functions/_shared/tests/import-map.json supabase/functions/_shared/tests/handler-auth-hook-email.test.ts` exits 0 covering `500` (missing secret), `401` (bad JWT), `400` (bad redirect), and `200` (valid HS256 JWT).
- [ ] PR is labeled `blocked` and `owner-action`, and owner confirms `SEND_EMAIL_HOOK_SECRET` appears in `supabase secrets list` (BEFORE merge) and comments `"owner step done"` on the PR.
- [ ] Owner deploys `supabase functions deploy auth-hook-email` after merge.

## Evidence

## Rollback

Revert `supabase/functions/auth-hook-email/index.ts` via `git revert <commit>` and redeploy the previous function version via `supabase functions deploy auth-hook-email` if auth emails fail due to a secret mismatch.

## Open questions

- Confirm with the owner whether `SEND_EMAIL_HOOK_SECRET` is already set in production Supabase Edge Function secrets before merging and deploying.
