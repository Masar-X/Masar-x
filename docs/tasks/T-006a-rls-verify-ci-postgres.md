---
id: T-006a
title: "Update rls-verify.sql and wire Postgres CI verification"
priority: P0
status: todo
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

- [ ] `rg -n "00[1-9]|01[0-9]|migrations\.old" supabase/tests/rls-verify.sql supabase/tests/README.md` returns only `Spec 004 / T055` historical attribution (zero references to `001..008`, `018`, or `migrations.old/`).
- [ ] `actionlint -color` exits 0 on `.github/workflows/ci.yml`.
- [ ] The new CI `db-verify` Postgres 17 job replays `supabase/tests/prelude.sql`, all `supabase/migrations/*.sql`, `supabase/tests/rls-verify.sql`, and `supabase/tests/rpc-verify.sql` with `-v ON_ERROR_STOP=1` and exits 0.

## Evidence

## Rollback

Revert the changes to `supabase/tests/rls-verify.sql`, `supabase/tests/README.md`, and `.github/workflows/ci.yml` via `git revert <commit>`.

## Open questions

- None (promotion of `db-verify` to required status check is tracked under `T-002` only after 1 green week post-`T-006a`).
