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

Pre-PR state (line refs describe the code BEFORE this fix round):
- [VERIFIED] `index.ts` read `SEND_EMAIL_HOOK_SECRET` at module load and fell back to an unverified "RESTRICTED mode" (only a `console.warn`) when it was empty, letting anon-key callers invoke the handler.
- [VERIFIED] `supabase/functions/_shared/tests/` had zero coverage for `auth-hook-email` before this card.
- [VERIFIED] `AGENTS.md` ledger rows (036-wave1c, 040-review-remediation) note Edge Functions are owner-deployed and the owner still owes `SEND_EMAIL_HOOK_SECRET`.

Fix-round contract defect (verified 2026-11-25, inherited from main — this PR made the "secret set" path the official gate, so it had to resolve it):
- [VERIFIED] The official Supabase send-email-hook docs (https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook, "Updated Oct 22, 2026") specify the Standard Webhooks contract: dashboard secret `v1,whsec_...`, verification via `standardwebhooks` `Webhook.verify(payload, headers)` over `webhook-id`/`webhook-timestamp`/`webhook-signature`, deploy with `--no-verify-jwt`.
- [VERIFIED] supabase/auth#2499 (open, created 2026-04-22): "send_email Auth Hook does not attach Authorization header despite signing secret being configured" — the legacy `Authorization: Bearer <JWT>` scheme the pre-fix code implemented is not reliably sent by GoTrue.
- [VERIFIED] TDD red: a request signed with a valid Standard Webhooks signature and a dashboard-style `v1,whsec_...` secret was rejected `401` by the pre-fix verifier (`base64ToBytes("v1,whsec_...")` throws -> catch -> false). Fixed by the rework below; the test flipped green.
- [VERIFIED] `supabase/config.toml` had no `[functions.auth-hook-email]` block, so the platform default `verify_jwt = true` would reject hook calls at the gateway before the function ran (`cloudinary-webhook` at config.toml:24-25 is the `verify_jwt = false` precedent).

## Goal

Fail-closed gate (500 when `SEND_EMAIL_HOOK_SECRET` is missing outside local dev, 401 on invalid/missing signature) PLUS verification aligned with the documented Standard Webhooks contract (dependency-free Web Crypto implementation equivalent to `standardwebhooks@1.0.0.verify`: strip `v1,whsec_`, HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`, multi-`v1,` signature support, 5-minute timestamp tolerance), offline Deno handler tests, `verify_jwt = false` gateway config, and owner pre-merge/post-deploy steps.

## Non-goals

- Modifying other Edge Functions or `_shared/` modules.
- Deploying Edge Functions or mutating Supabase Dashboard secrets autonomously (owner-owned).

## Steps

1. [done] Fail-closed gate kept unchanged: missing/empty secret outside `ENVIRONMENT === 'development'` -> 500 `Auth hook misconfigured`.
2. [done] Replace the legacy `Authorization` JWT verifier with `verifyStandardWebhook` (raw body read once, signature over the exact transmitted bytes).
3. [done] Add `supabase/config.toml` `[functions.auth-hook-email]` `verify_jwt = false`; document `supabase functions deploy auth-hook-email --no-verify-jwt`.
4. [done] Convert the 4 JWT tests to Standard Webhooks and add: `v1,whsec_`-prefixed secret -> 200, unprefixed base64 secret -> 200, tampered body -> 401, stale timestamp (replay, 1h) -> 401, missing webhook-* headers -> 401, malformed/non-`v1` signature -> 401.
5. [done] `pnpm tasks:lint` OK (22 cards).

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] `cd supabase/functions && deno check --config deno.jsonc ./*/index.ts` exits 0.
  evidence: `deno check --config deno.jsonc ./*/index.ts` -> exit 0 (all 11 function entrypoints; checkExit=0).
- [x] Handler tests cover the Standard Webhooks contract + fail-closed gate and pass.
  evidence: `deno test --allow-env --import-map=supabase/functions/_shared/tests/import-map.json supabase/functions/_shared/tests/handler-auth-hook-email.test.ts` -> `ok | 11 passed | 0 failed (39ms)`.
- [x] TDD red first: the `v1,whsec_` test failed on the pre-fix verifier.
  evidence: pre-fix run -> `FAILED | 0 passed | 1 failed` with `assertion failed: expected 200, got 401: {"error":"Unauthorized"}`; the same test passes after the rework.
- [x] Full Deno Edge suite stays green.
  evidence: full `_shared/tests/` run -> `ok | 140 passed | 0 failed (832ms)`; `cloudinary-webhook/signature_test.ts` -> `ok | 7 passed | 0 failed (9ms)`.
- [x] Gateway config aligned with the hook contract.
  evidence: `supabase/config.toml` gains `[functions.auth-hook-email]` with `verify_jwt = false` (precedent `cloudinary-webhook`).
- [x] `pnpm tasks:lint` passes.
  evidence: `tasks:lint OK (22 card(s) checked)`.
- [ ] PR is labeled `blocked` and `owner-action`; owner confirms `SEND_EMAIL_HOOK_SECRET` exists in `supabase secrets list` with the Dashboard's `v1,whsec_...` value (BEFORE merge) and comments `"owner step done"`.
- [ ] Owner merges, then deploys `supabase functions deploy auth-hook-email --no-verify-jwt`.
- [ ] Owner triggers a REAL signup and recovery on a test account and confirms BOTH emails arrive; if either fails, apply Rollback immediately.

## Evidence

- TDD red (pre-fix, in-session capture): `deno test --filter "whsec" ...` -> `FAILED | 0 passed | 1 failed`, `assertion failed: expected 200, got 401: {"error":"Unauthorized"}`.
- Handler tests (post-fix, Deno 2.9.7): `ok | 11 passed | 0 failed (39ms)`.
- Full Deno Edge suite: `ok | 140 passed | 0 failed (832ms)`; cloudinary signature tests: `ok | 7 passed | 0 failed (9ms)`.
- `deno check --config deno.jsonc ./*/index.ts` -> exit 0. `pnpm tasks:lint` -> `tasks:lint OK (22 card(s) checked)`.
- Contract references: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook (Updated Oct 22, 2026); supabase/auth#2499 (open).

## Rollback

1. Disable the Send Email hook in the Supabase Dashboard (Auth -> Hooks) — email sending falls back to the default SMTP WITHOUT any redeploy.
2. Then redeploy the previous function version: `git revert <merge-commit>` and `supabase functions deploy auth-hook-email --no-verify-jwt`.

## Owner steps (exact order)

1. Check the Dashboard (Auth -> Hooks): is the Send Email hook enabled, and on which URI?
2. `supabase secrets list` — confirm `SEND_EMAIL_HOOK_SECRET` exists with the Dashboard's `v1,whsec_...` value.
3. Comment `"owner step done"` on PR #333, then merge.
4. `supabase functions deploy auth-hook-email --no-verify-jwt`.
5. Trigger a REAL signup and recovery and confirm both emails arrive; if either fails, apply Rollback.

## Open questions

- None (the prod-secret precondition is tracked as the owner-gated acceptance criteria above).
