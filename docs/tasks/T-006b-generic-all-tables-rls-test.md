---
id: T-006b
title: "Replace static 19-table RLS list with generic all-tables check"
priority: P0
status: todo
depends_on:
  - T-006a
touches:
  - "supabase/tests/rls-verify.sql"
owner_action: false
area: supabase
estimate: 0.25d
---

## Context

- [VERIFIED] `supabase/migrations/20261031000000_baseline.sql` creates **57** tables (`^CREATE TABLE` count = 57), plus later migrations add tables such as `conversations` (`supabase/migrations/20261114132141_zane_conversations.sql`).
- [VERIFIED] `supabase/tests/rls-verify.sql:92-105` (Section 1a) hardcodes only **19** table names from the retired `002..007` chain, leaving 38+ baseline and post-baseline tables outside the static inventory, while Section 1b (`supabase/tests/rls-verify.sql:149-175`) performs an unlabeled sweep over `pg_class` without listing or asserting total verified table coverage cleanly.
- [VERIFIED] `depends_on: [T-006a]` is a true logical dependency: `T-006a` cleans up the archived migration references in `supabase/tests/rls-verify.sql` and wires `db-verify` in CI so this assertion runs automatically on every PR.

## Goal

Replace the stale hand-maintained 19-of-57 table array in `supabase/tests/rls-verify.sql:90-143` with a generic, schema-wide SQL assertion verifying that every base/partitioned table in `public` has RLS enabled (`relrowsecurity = true`) and at least one intentional policy or explicit deny-all rationale.

## Non-goals

- Adding per-table behavioral CRUD blocks to Section 3 for every new table beyond existing blocks.
- Modifying `.github/workflows/ci.yml` (already wired by `T-006a`).

## Steps

1. Update `supabase/tests/rls-verify.sql:86-175` (Sections 1a/1b) to replace the hardcoded 19-table `expected` array with a generic `pg_catalog.pg_class` check over ALL `public` ordinary and partitioned tables (`relkind IN ('r', 'p')`, `NOT relisshared`) asserting non-zero table count (> 0) and `relrowsecurity = true` on every single table, naming every offender in `RAISE EXCEPTION`.
2. Add a negative verification check (or temporary un-RLS'd test table inside a rolled-back `BEGIN ... ROLLBACK` block, or a self-test block) proving the generic assertion fails loudly when a `public` table lacks `ENABLE ROW LEVEL SECURITY`.
3. Run `supabase/tests/rls-verify.sql` via the CI `db-verify` job (or local Postgres 17) with `-v ON_ERROR_STOP=1` and confirm it reports the full `public` table count (>= 58 tables) and passes.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `supabase/tests/rls-verify.sql` no longer relies on the hardcoded 19-table `expected` list and dynamically asserts `relrowsecurity = true` across every table in `public`.
- [ ] `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-verify.sql` (and CI `db-verify`) passes and prints the full verified `public` table count (>= 58).
- [ ] Negative self-test inside a rolled-back transaction confirms an un-RLS'd `public` table triggers `RLS VERIFY FAILED`.

## Evidence

## Rollback

Revert `supabase/tests/rls-verify.sql` via `git revert <commit>`.

## Open questions

- None.
