---
id: T-017b
title: "Inventory and classify docs/ checklists into INVENTORY-docs.md"
priority: P1
status: done
depends_on: []
touches:
  - "docs/tasks/INVENTORY-docs.md"
owner_action: false
area: docs
estimate: 0.5d
---

## Context

- [VERIFIED] Scanning `docs/` finds **167** unchecked `- [ ]` markdown items across 8 files: `docs/design/UIUX_IMPROVEMENT_PLAN.md` (41), `docs/SETUP.md` (39), `docs/releases/CUT-CHECKLIST.md` (33, marked `DEPRECATED 2026-09-20` at `:2,7`), `docs/legacy/REORGANIZATION_PLAN.md` (25), `docs/security/secret-leak-runbook.md` (10), `docs/SMOKE_TEST_REPORT.md` (10), `docs/agents/references/08-precommit.md` (8), and `docs/tasks/_TEMPLATE.md` (1 placeholder example).
- [VERIFIED] `AGENTS.md:47-82` Active Specs Ledger also tracks 7 "owner owes" items routed to `T-008`.
- [INFERRED] `docs/` mixes reusable operational runbooks (`08-precommit.md`, `secret-leak-runbook.md`, deprecated `CUT-CHECKLIST.md`) with legacy/planned work (`UIUX_IMPROVEMENT_PLAN.md`, `REORGANIZATION_PLAN.md`), requiring separate `work-item` vs `procedure` tables.

## Goal

Scan all checklists inside `docs/` and produce `docs/tasks/INVENTORY-docs.md` (read-only analysis) classifying every item by status (`already-done`, `stale`, `duplicate-of-card`, `unverified`, `real`) and type (`work-item` vs `procedure`), with a top-level Count Summary and one table per type.

## Non-goals

- Do NOT create new `T-XXX` task cards during this inventory (owner decides which `work-item` entries become cards).
- Do NOT edit files inside `docs/` (other than `docs/tasks/INVENTORY-docs.md`), `INVENTORY-specs.md` (`T-017a`), or `INVENTORY-meta.md` (`T-017c`).
- Do NOT duplicate `"owner owes..."` items — route them to `T-008`.

## Steps

1. Scan `docs/**/*.md` (`rg -n "^\s*- \[ \]" docs` excluding `docs/tasks/T-*.md` acceptance criteria) to collect every checklist item with exact `file:line`.
2. Classify every item by **STATUS** (`already-done` with evidence / `stale` / `duplicate-of-card` / `unverified` / `real`), routing any `"owner owes..."` items to `T-008` and noting deprecated/template items (`CUT-CHECKLIST.md`, `_TEMPLATE.md`).
3. Classify every item by **TYPE**:
   - `work-item`: unfinished work; candidate for a future card (owner decides; do NOT create cards yourself).
   - `procedure`: reusable checklist (release, deploy, pre-commit, secret-leak runbook, smoke/setup walkthrough); do NOT convert to a card; propose moving/consolidating to `docs/checklists/<name>.md` citing source `file:line`.
4. Write `docs/tasks/INVENTORY-docs.md` with:
   - A top-level **Count Summary** table (totals by Type × Status, plus routed-to-`T-008` count).
   - **One dedicated table for `work-item`** entries (`Source file:line`, `Summary`, `Status`, `Evidence / Card link`).
   - **One dedicated table for `procedure`** entries (`Source file:line`, `Summary`, `Status`, `Proposed docs/checklists/<name>.md target`).
5. Verify no other files were modified and `pnpm tasks:lint` exits 0.

## Acceptance criteria

- [x] `test -f docs/tasks/INVENTORY-docs.md && rg -n "Count Summary|work-item|procedure|unverified|T-008" docs/tasks/INVENTORY-docs.md` — file exists with separate `work-item` and `procedure` tables, `unverified` status support, count summary, and `T-008` routing
evidence: bash: `test -f docs/tasks/INVENTORY-docs.md && rg -n "Count Summary|work-item|procedure|unverified|T-008" docs/tasks/INVENTORY-docs.md` → exit 0; matches include :11 (scan scope), :21/:31 (T-008 routing), :23 (`## Count Summary`), :46 (`## work-item`), :142 (`## procedure`); `unverified` rows throughout
- [x] `git diff --name-only origin/main -- ':!docs/tasks/INVENTORY-docs.md'` — contains no unintended edits
evidence: `git diff --name-only origin/main -- ':!docs/tasks/INVENTORY-docs.md'` → `docs/tasks/T-017b-checklist-inventory-docs.md` (this card's own status/evidence edit, per protocol); no other paths
- [x] `pnpm tasks:lint` — exits 0
evidence: `node scripts/tasks.mjs lint` → "tasks:lint OK (24 card(s) checked)", exit 0

## Evidence

- Scan: `rg -n "^\s*- \[ \]" docs --glob '!docs/tasks/T-*.md'` → 167 items across 8 files (per-file counts tabulated in `docs/tasks/INVENTORY-docs.md`).
- Row-count cross-check: 41 + 25 + 5 + 39 + 33 + 10 + 5 + 8 + 1 = 167 table rows in `docs/tasks/INVENTORY-docs.md`; status totals 27 already-done / 48 stale / 90 unverified / 2 real, matching the Count Summary.
- `bash .github/scripts/check-doc-links.sh` → `All internal Markdown links resolve.` (exit 0).

## Rollback

Move `docs/tasks/INVENTORY-docs.md` to `.trash/` per I9.

## Open questions

- None
