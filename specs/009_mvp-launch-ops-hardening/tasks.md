# Tasks: 009_mvp-launch-ops-hardening

> Gates for every task: `pnpm typecheck` · `pnpm lint` (ratchet 52 warnings) · `pnpm -r --if-present test` · `bash .github/scripts/check-translations.sh` · `node .agents/agents/verify_i18n.mjs` (no NEW hardcoded-Arabic hits). Docs-only commits run `check-doc-links.sh` instead of the code gates. Hard boundary: never stage the owner's uncommitted files (`Footer.tsx`, `LanguageToggle.tsx`, `admin-shell/Sidebar.tsx`, `FooterDeveloper.tsx`, `en/aiAssistant.json`, build artifacts) — explicit-path `git add` only.

## 1. Spec landing

- [ ] 1.1 `docs/MVP_REPORT.md` committed: `docs: add MVP readiness report (pass 2)`
- [ ] 1.2 specs/009 + specs/010 committed: `docs(specs): land 009 MVP-launch ops hardening + 010 e2e study-flow smoke specs`

## 2. RLS audit tool + first run (G3.1)

- [x] 2.1 `scripts/audit-rls.mjs`: read-only audit (RLS enabled per public table, policy dump, subject_lectures read-policy check), `.env` loader per seed-mvp-launch pattern, writes `docs/audits/rls-audit-<date>.md`
- [x] 2.2 Run against prod DB — **PASS: 48/48 tables RLS-enabled, 170 policies, 9 anon-write warnings all reviewed-safe** (details in `checklists/rls-audit.md`; full report stays local — `docs/audits/` is gitignored by design). Notes: `subject_lectures` read policy is `TO public` (superset of migration 007's role list — cosmetic drift); prod evolved far beyond migration history (170 vs 41 policies) — reconciliation is post-MVP

## 3. Retire one-off RLS script (G3.2)

- [x] 3.1 Gate passed (audit PASS + policy contract matches) → `.openclaw-rls-open.mjs` moved to `.trash/` (file was untracked; no git operation needed)

## 4. Runbooks: env sweep, AI smoke, role propagation (G3.5, G2.1, G3.4)

- [x] 4.1 Executed `checklists/env-sweep.md` — **GAPS FOUND**: 2 real missing vars (Cloudinary public pair — no source of truth anywhere, `getCloudinaryUrl` hard-throws), 2 likely-intentional absences (`AI_GATEWAY_API_KEY` = the `ai_chat_disabled` gate, Puter fallback primary; `VERCEL_MCP_BYPASS_SECRET` = MCP fail-closed). `SUPABASE_SERVICE_ROLE_KEY` ✅ present. Owner action list recorded in the checklist
- [x] 4.2 Owner-assisted: AI chat round-trip + rate-limit rejection in prod (expected via Puter fallback); record in checklist
  - **2026-11-28 (agent-run, test user) — PARTIAL, see #351:** rate-limit rejection **verified live** (sequential burst: requests 1–10 rejected downstream, request #11 → **429** with `Retry-After`, on `/api/ai-chat`); fallback gate confirmed (`/api/ai/chat` → **503 `ai_chat_disabled`**, matching §3); the Puter round-trip itself was **not completed** — the Puter primary path requires a per-user Puter sign-in (dialog reached; throwaway-account creation not automated), and a NEW defect was found: `/api/ai-chat` 401s at the edge for authenticated users (**#374**).
  evidence: 2026-11-28 agent-run with a disposable prod test user (created/deleted via admin REST) — `ai-chat` v6 + `summarize-chat` v29 deployed (#380 runbook); `POST https://masarx.vercel.app/api/ai-chat` with a seeded real session cookie → **200** JSON mode (`{content:"probe-ok",usage:{promptTokens:99,completionTokens:3}}`) and **200** SSE mode (delta frames → `data: [DONE]`, usage 100+13); the 429 rejection from the PARTIAL record above stands. Function logs show two `POST | 200` rows and **no `gemini-pro` 404** (the #380 fix live). Architecture note: the "Puter fallback" expectation predates the current edge-serve path — the round-trip ran through the primary `/api/ai-chat` edge proxy; the Puter per-user sign-in itself was not exercised. Full evidence: Masar-X/Masar-x#380 (comment 7242193957).
- [x] 4.3 Owner-assisted: admin demotion propagation test; record in `checklists/role-propagation.md`
  evidence: 2026-11-28 agent-run with a disposable prod test user — promote → `app_metadata.role='admin'` via the sync trigger + admin dashboard renders (`System Admin`); demote → trigger strips the claim instantly (DB-verified `role=null`), `/en/admin-dashboard` immediately bounces, and the next token refresh drops the claim (grant_type=refresh_token → role None). Full table in `checklists/role-propagation.md`.
- [x] 4.4 Commit results: `docs(specs): record 009 runbook results`

## 5. Dependabot (G3.6)

- [x] 5.1 `.github/dependabot.yml` (npm `/` recursive + github-actions, weekly, reviewer fotedev, minor/patch group; Electron major/minor ignored per I6) + `.gitignore` whitelist entry (`!.github/dependabot.yml` — `.github/*` was ignore-all) → `8e88cd2`

## 6. Route hygiene (G1.4, G1.5)

- [x] 6.1 `/add`: i18n-router redirect + `common.loading` string (no new keys) — verify_i18n 162→161 → `08fee5d`
- [x] 6.2 `الرئيسية`: zero references found (grep) → moved to `.trash/` (pre-approved disposition) → `08fee5d`. Post-run: stale `.next/dev/types` validator broke typecheck — fixed by `rm -rf apps/web/.next/dev/types` (known pattern from admin-shell rework)
- [x] 6.3 Gates green: typecheck ✓, lint 52/52 ratchet ✓, web vitest 46/46 ✓, translations ✓, verify_i18n 161 ✓

## 7. Sentry cleanup (G7.1)

- [x] 7.1 DSN check: `SENTRY_DSN` absent locally AND in Vercel prod (env sweep) → Sentry dormant by config; no test event possible/needed
- [x] 7.2 `api/sentry-example-api/` retired → `.trash/` (mirrored path); typecheck+lint green → `d8c56f8`

## 8. Report pass 3

- [x] 8.1 States flipped for G1.4, G1.5, G2.1, G3.1, G3.2, G3.4, G3.5, G3.6, G6.1, G7.1; new finding G3.9 (prod/migration drift); §8 re-ranked; changelog pass 3
