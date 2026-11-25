---
id: T-004
title: "Enforce fail-closed auth-hook-email verification (Standard Webhooks)"
priority: P0
status: done
depends_on: []
touches:
  - "supabase/functions/auth-hook-email/index.ts"
  - "supabase/functions/_shared/tests/handler-auth-hook-email.test.ts"
  - "supabase/config.toml"
owner_action: true
area: supabase
estimate: 0.5d
---

## Context

State before this card (line refs describe the code as it was):

- `index.ts` read `SEND_EMAIL_HOOK_SECRET` at module load and fell back to an unverified "RESTRICTED mode" (only a `console.warn`) when it was empty, letting anon-key callers invoke the handler.
- `supabase/functions/_shared/tests/` had no coverage for `auth-hook-email`.
- `AGENTS.md` ledger rows (036-wave1c, 040-review-remediation) note Edge Functions are deployed by hand and `SEND_EMAIL_HOOK_SECRET` is still owed.

Contract defect found while implementing (verified 2026-11-25; inherited from `main` — this card makes the "secret set" path the official gate, so it had to be resolved):

- The official Supabase send-email-hook docs (https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook, "Updated Oct 22, 2026") specify the Standard Webhooks contract: dashboard secret `v1,whsec_...`, verification via `standardwebhooks` `Webhook.verify(payload, headers)` over `webhook-id`/`webhook-timestamp`/`webhook-signature`, deploy with `--no-verify-jwt`.
- supabase/auth#2499 (open, created 2026-04-22): "send_email Auth Hook does not attach Authorization header despite signing secret being configured" — the legacy `Authorization: Bearer <JWT>` scheme the code implemented is not reliably sent by GoTrue.
- TDD red: a request carrying a valid Standard Webhooks signature and no `Authorization` header was rejected `401` by the previous verifier, which returned `false` when the bearer was missing (`verifyHookJwt` in `index.ts` on `main`). The same request passes after the rework.
- `supabase/config.toml` had no `[functions.auth-hook-email]` block, so the platform default `verify_jwt = true` would reject hook calls at the gateway before the function ran (`cloudinary-webhook` at config.toml:24-25 is the `verify_jwt = false` precedent).

## Goal

Fail-closed gate (500 when `SEND_EMAIL_HOOK_SECRET` is missing outside local dev, 401 on an invalid or missing signature) plus verification aligned with the documented Standard Webhooks contract (dependency-free Web Crypto implementation equivalent to `standardwebhooks@1.0.0.verify`: strip `v1,whsec_`, HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`, several `v1,` signatures, 5-minute timestamp tolerance), offline Deno handler tests and `verify_jwt = false` at the gateway. Setting the secret and deploying the function stay with the owner (#314).

## Non-goals

- Modifying other Edge Functions or `_shared/` modules.
- Deploying the Edge Function or changing Dashboard secrets (owner-run, tracked in #314).

## Steps

1. [done] Fail-closed gate kept unchanged: missing/empty secret outside `ENVIRONMENT === 'development'` -> 500 `Auth hook misconfigured`.
2. [done] Replace the legacy `Authorization` JWT verifier with `verifyStandardWebhook` (raw body read once, signature over the exact transmitted bytes).
3. [done] Add `supabase/config.toml` `[functions.auth-hook-email]` `verify_jwt = false`.
4. [done] Convert the 4 JWT tests to Standard Webhooks and add: `v1,whsec_`-prefixed secret -> 200, unprefixed base64 secret -> 200, tampered body -> 401, stale timestamp (replay, 1h) -> 401, missing webhook-* headers -> 401, malformed/non-`v1` signature -> 401.
5. [done] Review follow-up: decode and verify each `v1,` signature entry on its own, so one malformed entry no longer aborts the list (GoTrue joins entries with ", "); regression test added; unused JWT helpers removed from the test file.
6. [done] `pnpm tasks:lint` OK.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] `cd supabase/functions && deno check --config deno.jsonc ./*/index.ts` exits 0.
  evidence: `deno check --config deno.jsonc ./*/index.ts` (Deno 2.9.7) -> `Check` for all 11 function entrypoints, `deno check exit=0`.
- [x] Handler tests cover the Standard Webhooks contract + fail-closed gate and pass.
  evidence: `cd supabase/functions && deno test --allow-env --import-map=_shared/tests/import-map.json _shared/tests/handler-auth-hook-email.test.ts` -> `ok | 12 passed | 0 failed (56ms)`, `handler exit=0`.
- [x] TDD red first: the `v1,whsec_` test failed on the previous verifier.
  evidence: run against the previous verifier -> `FAILED | 0 passed | 1 failed`, `assertion failed: expected 200, got 401: {"error":"Unauthorized"}`; the same test passes after the rework.
- [x] One malformed signature entry does not block a valid one.
  evidence: `handler: comma-space multi-signature header with a malformed entry still accepts the valid one -> 200 ... ok (1ms)` (handler test file, 12 passed).
- [x] Full Deno Edge suite stays green.
  evidence: `deno test --allow-env --import-map=_shared/tests/import-map.json _shared/tests/ cloudinary-webhook/signature_test.ts` -> `ok | 148 passed | 0 failed (2s)`, `full exit=0`.
- [x] Gateway config aligned with the hook contract.
  evidence: `supabase/config.toml` gains `[functions.auth-hook-email]` with `verify_jwt = false` (precedent `cloudinary-webhook` at config.toml:24-25).
- [x] `pnpm tasks:lint` passes.
  evidence: `node scripts/tasks.mjs lint` -> `tasks:lint OK (24 card(s) checked)`, `lint exit=0`.

## Evidence

- TDD red against the previous verifier: `deno test --filter "whsec" ...` -> `FAILED | 0 passed | 1 failed`, `assertion failed: expected 200, got 401: {"error":"Unauthorized"}`.
- Handler tests after the rework (Deno 2.9.7): `ok | 12 passed | 0 failed`.
- Full Deno Edge suite: `ok | 148 passed | 0 failed` (`_shared/tests/` and `cloudinary-webhook/signature_test.ts` in one run).
- Contract references: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook (Updated Oct 22, 2026); supabase/auth#2499 (open).
- Not run here: the production deploy, the secret and a real signup/recovery. They are the owner steps in #314.

## Rollback

1. Disable the Send Email hook in the Supabase Dashboard (Auth -> Hooks) — email sending falls back to the default SMTP WITHOUT any redeploy.
2. Then redeploy the previous function version: `git revert <merge-commit>` and `supabase functions deploy auth-hook-email --no-verify-jwt`.

## Owner steps

Tracked in #314 (`needs: owner`): set `SEND_EMAIL_HOOK_SECRET` to the Dashboard's `v1,whsec_...` value, deploy with `--no-verify-jwt`, then a real signup and recovery. The merge deploys no Edge Function; the hook only changes when the deploy command in #314 is run.

## Open questions

- None.
