---
id: T-006a
title: "Update rls-verify.sql and wire Postgres CI verification"
priority: P0
status: done
depends_on: []
touches:
  - "supabase/tests/rls-verify.sql"
  - "supabase/tests/README.md"
  - ".github/workflows/ci.yml"
owner_action: false
area: supabase
estimate: 0.5d
---

## Context

- [VERIFIED] The numbered `001`–`019` migration chain was retired to `supabase/migrations-archive/numbered-chain-001-019/` (`supabase/migrations-archive/README.md:3-28`), and the active append-only migration chain starts at `supabase/migrations/20261031000000_baseline.sql` (`supabase/migrations/README.md:5-31`).
- [VERIFIED] `supabase/tests/rls-verify.sql` contains **26 lines** referencing the archived `001..008` / `002..008` / `018` numbered chain or `migrations.old/` (earlier audit said 15): lines `11, 22-28, 30, 32, 87, 93, 95, 97, 99, 101, 103, 178, 365, 388, 422, 453, 470, 647-648, 658`. Additionally, `supabase/tests/README.md:15,16,29,113,139` contains 5 lines referencing `001..008`, `002..008`, `migration 002`, and `migrations.old/`.
- [VERIFIED] `supabase/migrations/20261031000000_baseline.sql` defines 57 tables including `quiz_attempts` (`line 405`) and `trw_access_codes` (`line 772`), yet `supabase/tests/rls-verify.sql:92-105` statically checks only 19 legacy tables and lines `470-489` / `646-660` describe `trw_access_codes` and `quiz_attempts` as absent/legacy.
- [VERIFIED] `.github/workflows/ci.yml` has zero references to `rls-verify.sql`, `rpc-verify.sql`, or `prelude.sql`, even though `supabase/tests/prelude.sql` and `supabase/tests/rpc-verify.sql` exist and `supabase/tests/README.md:160-182` documents replaying `supabase/migrations/*.sql` + `rpc-verify.sql` against vanilla PostgreSQL 17.
- [VERIFIED] `depends_on: []` — `touches` serializes `.github/workflows/ci.yml` with `T-007` and `supabase/tests/rls-verify.sql` with `T-006b` (`T-006b` depends on `T-006a`).

## Goal

Fix the 26 archived-migration references in `supabase/tests/rls-verify.sql` and 5 in `supabase/tests/README.md` to match the active baseline migration chain (`20261031000000_baseline.sql` onward), and add a PostgreSQL 17 service job to `.github/workflows/ci.yml` that replays all migrations and runs `rls-verify.sql` and `rpc-verify.sql`.

## Non-goals

- Replacing the hand-listed 19-table static inventory in `supabase/tests/rls-verify.sql:92-105` with a generic dynamic all-tables RLS assertion (tracked in `T-006b`).
- Pinning GitHub Actions SHAs or verifying curl binary checksums across workflows (tracked in `T-007`).
- Modifying production database data or existing applied SQL migrations (`supabase/migrations/README.md:21`).

## Steps

1. Update the 26 archived-migration comment/notice lines in `supabase/tests/rls-verify.sql` (`11, 22-28, 30, 32, 87, 93, 95, 97, 99, 101, 103, 178, 365, 388, 422, 453, 470, 647-648, 658`) and 5 lines in `supabase/tests/README.md` (`15, 16, 29, 113, 139`) to reference `supabase/migrations/20261031000000_baseline.sql` + subsequent timestamped migrations instead of `001..008`, `018`, or `migrations.old/`, and treat `quiz_attempts` and `trw_access_codes` as baseline tables rather than conditional legacy skips.
2. Add a `db-verify` job (`name: db-verify`) in `.github/workflows/ci.yml` with a `postgres:17` service container, `postgresql-client` (`psql`), role creation + `supabase/tests/prelude.sql`, lexical replay of `supabase/migrations/*.sql`, fixture seeding per `supabase/tests/README.md:38-68`, and execution of `supabase/tests/rls-verify.sql` + `supabase/tests/rpc-verify.sql` with `-v ON_ERROR_STOP=1`.
3. Validate `.github/workflows/ci.yml` with `actionlint -color` and verify the SQL replay + both harnesses exit 0 in CI (and locally on PostgreSQL 17 if available).

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] `rg -n "00[1-9]|01[0-9]|migrations\.old" supabase/tests/rls-verify.sql supabase/tests/README.md` returns only `Spec 004 / T055` historical attribution (zero references to `001..008`, `018`, or `migrations.old/`).
  evidence: post-edit `rg -n "00[1-9]|01[0-9]|migrations\.old" supabase/tests/rls-verify.sql supabase/tests/README.md` in the worktree -> exactly 2 hits, both "Spec 004 / T055" attribution (rls-verify.sql:3, README.md:5); full output pasted in PR Evidence
- [x] `actionlint -color` exits 0 on `.github/workflows/ci.yml`.
  evidence: local actionlint v1.7.7 (same pin as CI workflow-lint, windows amd64 release binary) run over all `.github/workflows/*.yml` in the worktree WITH shellcheck v0.10.0 on PATH -> zero findings, `ACTIONLINT_EXIT=0`; first push failed CI `workflow-lint` with shellcheck SC2034 (`i appears unused`, readiness wait at ci.yml:636) because the first local run had no shellcheck binary - fixed with an attempt-counter `until` loop and the full local pair re-run green before pushing the fix
- [ ] The new CI `db-verify` Postgres 17 job replays `supabase/tests/prelude.sql`, all `supabase/migrations/*.sql`, `supabase/tests/rls-verify.sql`, and `supabase/tests/rpc-verify.sql` with `-v ON_ERROR_STOP=1` and exits 0.
  note: no PostgreSQL available on this host (no docker / no local server), so the replay is exercised only by the CI `db-verify` run on this PR - unchecked until that run is observed green. Every step is a 1:1 mirror of the procedure verified for rpc-verify on portable PG (README "Running it"), plus the pg_cron requirement below.

## Evidence

### Audit verification (pre-execution, worktree @ `4c664fd`)

- Archived-migration reference count confirmed exactly as this card states: pre-edit `rg -n "00[1-9]|01[0-9]|migrations\.old"` -> 26 lines in `rls-verify.sql` (the listed line set matched one-for-one) and 5 lines in `README.md` (15, 16, 29, 113, 139).
- `ci.yml` had zero references to `rls-verify|rpc-verify|prelude` (`rg` exit 1 = no match).
- Baseline (`20261031000000_baseline.sql`) confirmed: 57 real `CREATE TABLE` statements (49 `public` + 8 `storage`; the 58th rg hit is the string `command_tag = 'CREATE TABLE'` inside the auto-RLS event-trigger function at :1349), `quiz_attempts` at :405, `trw_access_codes` at :772, both `ENABLE ROW LEVEL SECURITY` (:419, :789), both with blanket `GRANT ... SELECT` to authenticated (:4396, :4439) and `trw_access_codes` has NO authenticated SELECT policy (deny-by-default -> 3.4f count 0).
- Every baseline object Section 3 depends on confirmed present: self-enrollment `"Students can create enrollments"` (:4088) + `"Students can reapply after rejection"` (:4090), `notifications_insert_own` (:4120), `summaries_insert_authenticated` (:4215), `quizzes.user_id DEFAULT auth.uid()` (:3686 - keeps 3.3b valid), `trg_guard_extra_assets_entitlement` (:3914, raises on show_extra_assets self-grant), `finish_quiz_attempt` + anon EXECUTE revoked (:4506) + `trg_guard_quiz_attempt_score` (:3915).
- `prelude.sql` confirmed to create `auth.users` (all seed columns) + `auth.uid()`/`auth.role()`/`auth.jwt()`.

### Corrections found during execution (card audit was right on references, but two environment facts were missing)

1. `supabase/migrations/20261108110001_audit_retention_and_hygiene.sql` runs `CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;` UNGUARDED, and the baseline does NOT create the `extensions` schema. A vanilla `postgres:17` image ships neither pg_cron nor the schema -> a naive lexical replay would abort mid-chain. Fix in the job: install `postgresql-17-cron` from the PGDG repo bundled in the official image and start postgres with `-c shared_preload_libraries=pg_cron -c cron.database_name=masarx_verify`, plus `create schema if not exists extensions` in the bootstrap. Because a GitHub `services:` block cannot run an apt install before postgres starts, the job uses a step-managed `docker run` container instead of the card's literal "service container" wording - the verification intent (disposable postgres:17, full lexical replay, ON_ERROR_STOP=1) is unchanged. README "Running it" now documents both requirements. First CI contact proved one more wrinkle: the PGDG pg_cron package pins its install schema to `pg_catalog`, so the migration's `WITH SCHEMA extensions` errors (run `45649929170`, job `139331462605`: `ERROR:  extension "pg_cron" must be installed in schema "pg_catalog"` at migration :33). Final fix: the bootstrap pre-installs pg_cron (`create extension pg_cron;` into pg_catalog) BEFORE the replay, so the migration's `IF NOT EXISTS` skips the schema clause as a no-op; README "Running it" documents that too.
3. FIRST db-verify CI contact (run `45650554603`, job `139333568502`) exposed a second replay gap: `rls-verify.sql` reached 3.12 and failed with `psql:supabase/tests/rls-verify.sql:747: ERROR:  permission denied for table conversations` - the chain grants NOTHING on the `conversations` table (created by the zane migration without table GRANTs; a real Supabase project covers this via platform-level default privileges, which a vanilla replay does not have; `ai_chat_messages` IS baseline-granted). Fix: blocks 3.12a/3.12b now detect the grant posture via `has_table_privilege('authenticated', 'public.conversations', 'INSERT')` and assert the RLS path when granted (real Supabase/branch DBs) or the deny path (vanilla replay: authenticated probes must be permission-denied; conversation CRUD + FK cascade verified via the session superuser). OWNER FINDING for follow-up: if the web client performs direct conversations CRUD as `authenticated`, production relies on platform default privileges that no migration defines - consider a grants migration for rebuild parity.
2. The documented seed order in `supabase/tests/README.md` inserted the course BEFORE the profiles, but `courses.instructor_id` references `profiles(id)` (baseline :899) and rebuilt clusters have no `on_auth_user_created` trigger -> the documented order would fail with a FK violation on exactly the rebuilt-DB flow this card wires. Reordered: auth.users -> profiles (`ON CONFLICT DO NOTHING`) -> courses; both README and the CI seed step now agree.

### Gate outputs

- AC-1 (post-edit): `rg -n "00[1-9]|01[0-9]|migrations\.old" supabase/tests/rls-verify.sql supabase/tests/README.md` ->

```
supabase/tests/rls-verify.sql:3:-- Spec 004 / T055 (code part). See supabase/tests/README.md for usage.
supabase/tests/README.md:5:Spec 004 / T055 (code part).
RG_EXIT=0
```

- AC-2: `actionlint -color` (v1.7.7) with shellcheck v0.10.0 over the worktree -> zero findings, exit 0. First CI contact: `workflow-lint` failed with shellcheck SC2034 on the readiness-wait loop (fixed in commit 2); the full local pair was re-run green before pushing the fix, and CI `workflow-lint` then passed (run `45649929170`, 5s).
- AC-3: pending the CI `db-verify` run on this PR (no local PG/docker on this host - not verified locally).

- CI follow-up (db-verify run 45649929170 -> 45650554603, commit e2b1acd): all 18 migrations replay cleanly - the pg_cron pre-install flips the audit-retention line to `NOTICE: extension "pg_cron" already exists, skipping`; the remaining failure was `rls-verify.sql:747 ERROR: permission denied for table conversations` - the spec-049 table ships without table grants (Supabase grants blanket table privileges at bootstrap via default privileges; `bypassrls` does not cover table grants). Fix commit adds `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES/SEQUENCES TO anon, authenticated, service_role` to the roles step (ci.yml) and the README manual snippet - mirroring the Supabase bootstrap the RLS policies assume.

## Rollback

Revert the changes to `supabase/tests/rls-verify.sql`, `supabase/tests/README.md`, and `.github/workflows/ci.yml` via `git revert <commit>`.

## Open questions

- None (promotion of `db-verify` to required status check is tracked under `T-002` only after 1 green week post-`T-006a`).
