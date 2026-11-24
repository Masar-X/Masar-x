---
id: T-006
title: "Update rls-verify.sql and wire Postgres CI verification"
priority: P0
status: todo
depends_on:
  - T-002
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
- [VERIFIED] Both `T-006` and `T-007` touch `.github/workflows/ci.yml`; `T-007` sets `depends_on: [T-006]` so they serialize cleanly.

## Goal

Update `supabase/tests/rls-verify.sql` and `supabase/tests/README.md` to match the active baseline migration chain (`20261031000000_baseline.sql` onward), and add a PostgreSQL 17 service job to `.github/workflows/ci.yml` that replays all migrations and runs both `rls-verify.sql` and `rpc-verify.sql`.

## Non-goals

- Pinning GitHub Actions SHAs or verifying curl binary checksums across workflows (tracked in `T-007`).
- Modifying production database data or existing applied SQL migrations (`supabase/migrations/README.md:21`).

## Steps

1. Update `supabase/tests/rls-verify.sql` (`lines 10-35, 87-105, 178, 365, 388, 422, 453, 470-491, 646-676`) and `supabase/tests/README.md` (`lines 15-16, 29, 113, 139`) to reference `supabase/migrations/20261031000000_baseline.sql` + subsequent timestamped migrations instead of `001..008`, `018`, or `migrations.old/`, and treat `quiz_attempts` and `trw_access_codes` as baseline tables rather than conditional legacy skips.
2. Add a `db-verify` (or `supabase-verify`) job in `.github/workflows/ci.yml` with a `postgres:17` service container, `postgresql-client` (`psql`), role creation + `supabase/tests/prelude.sql`, lexical replay of `supabase/migrations/*.sql`, fixture seeding per `supabase/tests/README.md:38-68`, and execution of `supabase/tests/rls-verify.sql` + `supabase/tests/rpc-verify.sql` with `-v ON_ERROR_STOP=1`.
3. Validate `.github/workflows/ci.yml` with `actionlint` and verify the SQL replay sequence passes against a fresh PostgreSQL 17 instance (locally via Docker/portable PG if available, and in CI).

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `rg -n "00[1-9]|01[0-9]|migrations\.old" supabase/tests/rls-verify.sql supabase/tests/README.md` returns only `Spec 004 / T055` historical attribution (zero references to `001..008`, `018`, or `migrations.old/`).
- [ ] `actionlint -color` exits 0 on `.github/workflows/ci.yml`.
- [ ] The new CI Postgres 17 job replays `supabase/tests/prelude.sql`, all `supabase/migrations/*.sql`, `supabase/tests/rls-verify.sql`, and `supabase/tests/rpc-verify.sql` with `-v ON_ERROR_STOP=1` and exits 0.

## Evidence

## Rollback

Revert the changes to `supabase/tests/rls-verify.sql`, `supabase/tests/README.md`, and `.github/workflows/ci.yml` via `git revert <commit>`.

## Open questions

- Confirm whether `db-verify` should also be promoted to a required ruleset check in `.github/RULESET.md` once green.
