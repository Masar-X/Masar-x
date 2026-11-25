---
id: T-006b
title: "Replace static 19-table RLS list with generic all-tables check"
priority: P0
status: done
depends_on:
  - T-006a
touches:
  - "supabase/tests/rls-verify.sql"
  - "supabase/tests/README.md"
owner_action: false
area: supabase
estimate: 0.25d
---

## Context

- `supabase/migrations/20261031000000_baseline.sql` creates **57** tables (`^CREATE TABLE` count = 57), plus later migrations add tables such as `conversations` (`supabase/migrations/20261114132141_zane_conversations.sql`).
- `supabase/tests/rls-verify.sql:92-105` (Section 1a) hardcoded only **19** table names from the retired `002..007` chain, leaving 38+ baseline and post-baseline tables outside the static inventory, while Section 1b (`supabase/tests/rls-verify.sql:149-175`) performed an unlabeled sweep over `pg_class` without asserting the verified table count.
- `depends_on: [T-006a]` is a true logical dependency: `T-006a` cleans up the archived migration references in `supabase/tests/rls-verify.sql` and wires `db-verify` in CI so this assertion runs automatically on every PR.
- Card correction made during implementation: `supabase/tests/README.md` documents the section layout (its table rows 1a/1b and the sample `NOTICE` output), so it is added to `touches` and updated in the same change.

## Goal

Replace the hand-maintained 19-of-57 table array in `supabase/tests/rls-verify.sql` with a generic, schema-wide SQL assertion verifying that every base/partitioned table in `public` has RLS enabled (`relrowsecurity = true`), that the table count is non-zero, and that the sweep actually catches a missing-RLS table (negative self-test).

## Non-goals

- Adding per-table behavioral CRUD blocks to Section 3 for every new table beyond existing blocks.
- Modifying `.github/workflows/ci.yml` (already wired by `T-006a`).

## Steps

1. [done] Sections 1a/1b replaced by one generic `pg_catalog.pg_class` check over ALL `public` ordinary and partitioned tables (`relkind IN ('r', 'p')`, `relisshared = false`) asserting non-zero table count and `relrowsecurity = true` on every table, naming every offender in `RAISE EXCEPTION`.
2. [done] Negative self-test: a deliberately un-RLS'd `public` table is created inside a `BEGIN ... ROLLBACK` block; the run fails loudly if the sweep does not flag it.
3. [done] `supabase/tests/README.md` section table and sample output updated to the new sections.
4. [done] Run via the CI `db-verify` job (no local Postgres on this machine: no docker, no psql); run 45697741737 (job 139499462153) supplies the verified table count.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] `supabase/tests/rls-verify.sql` no longer relies on the hardcoded 19-table `expected` list and dynamically asserts `relrowsecurity = true` across every table in `public`.
  evidence: `grep -n "rls_static\|rls_sweep\|SECTION 1a\|SECTION 1b" supabase/tests/rls-verify.sql` -> no matches; the replacement block `DO $rls_all_tables$` counts all `public` tables (`relkind IN ('r', 'p')`, `relisshared = false`), raises on a zero count, and raises naming offenders when any table has `relrowsecurity = false`.
- [x] `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-verify.sql` (and CI `db-verify`) passes and prints the full verified `public` table count.
  evidence: CI run 45697741737, job `db-verify` (head 0320bc8) -> `NOTICE:  SECTION 1 PASS: all 50 public tables verified with RLS enabled`; the pre-CI estimate of >= 58 in this card over-counted (the sweep asserts a non-zero count and RLS on every table, so the exact number is informational), 50 is the observed count.
- [x] Negative self-test inside a rolled-back transaction confirms an un-RLS'd `public` table triggers the failure path.
  evidence: same run -> `NOTICE:  SECTION 1-negative PASS: the sweep flags a public table without RLS as expected`
- [x] `pnpm tasks:lint` passes.
  evidence: `node scripts/tasks.mjs lint` -> `tasks:lint OK (24 card(s) checked)`, exit 0 (run in the task worktree after the changes).

## Evidence

- Sections 1a/1b (the 19-entry array and the unlabeled sweep) replaced by the generic sweep (zero-count guard + offender naming) and the negative self-test; Section 1c untouched.
- `supabase/tests/README.md`: section rows 1a/1b -> `1` + `1-negative`; sample `NOTICE` output updated with the CI-observed count (50).
- No local Postgres on this machine (no docker, no psql); the harness evidence is the CI `db-verify` job: run 45697741737 (job 139499462153) on 0320bc8 and run 45707961813 (job 139534682084) on 41f97ae - identical lines: `PREFLIGHT PASS`, `SECTION 1 PASS: all 50 public tables verified with RLS enabled`, `SECTION 1-negative PASS`.

## Rollback

Revert `supabase/tests/rls-verify.sql` via `git revert <commit>`.

## Open questions

- None.
