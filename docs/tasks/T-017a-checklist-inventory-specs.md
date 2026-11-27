---
id: T-017a
title: "Inventory and classify specs/ checklists into INVENTORY-specs.md"
priority: P1
status: done
depends_on: []
touches:
  - "docs/tasks/INVENTORY-specs.md"
owner_action: false
area: docs
estimate: 0.5d
---

## Context

- [VERIFIED] Scanning `specs/` (`61` spec directories, `149` markdown files) finds **403** unchecked `- [ ]` markdown items across `specs/**/*.md`.
- [VERIFIED] Additional non-checkbox owner/task items exist across `specs/` and `AGENTS.md` ledger (`AGENTS.md:47-82`); all `"owner owes..."` items are routed to `T-008`.
- [INFERRED] Splitting the 628-item repo checklist inventory into `T-017a` (`specs/` 403 items), `T-017b` (`docs/` 167 items), and `T-017c` (`.specify/` + `.github/` 58 items) keeps each card within ~0.5d and eliminates merge conflicts.

## Goal

Scan all checklists inside `specs/` and produce `docs/tasks/INVENTORY-specs.md` (read-only analysis) classifying every item by status (`already-done`, `stale`, `duplicate-of-card`, `unverified`, `real`) and type (`work-item` vs `procedure`), with a top-level Count Summary and one table per type.

## Non-goals

- Do NOT create new `T-XXX` task cards during this inventory (owner decides which `work-item` entries become cards).
- Do NOT edit files inside `specs/`, `docs/tasks/INVENTORY-docs.md` (`T-017b`), or `docs/tasks/INVENTORY-meta.md` (`T-017c`).
- Do NOT duplicate `"owner owes..."` items — route them to `T-008`.

## Steps

1. Scan `specs/**/*.md` (`rg -n "^\s*- \[ \]" specs` plus `specs/*/tasks.md` and `specs/*/checklists/*.md`) to collect every unchecked item with exact `file:line`.
2. Classify every item by **STATUS**:
   - `already-done` (cite exact commit, file, or code evidence)
   - `stale` (superseded, deprecated, or referring to archived/deleted artifacts)
   - `duplicate-of-card` (covered by an existing `T-001`..`T-016` card; route `"owner owes..."` items to `T-008`)
   - `unverified` (cannot confirm live/prod/runtime state locally; flag for owner verification)
   - `real` (verified still open and valid)
3. Classify every item by **TYPE**:
   - `work-item`: unfinished work; candidate for a future card (owner decides; do NOT create cards yourself).
   - `procedure`: reusable checklist (release, deploy, PR, onboarding); do NOT convert to a card; propose moving/consolidating to `docs/checklists/<name>.md` citing source `file:line`.
4. Write `docs/tasks/INVENTORY-specs.md` with:
   - A top-level **Count Summary** table (totals by Type × Status, plus routed-to-`T-008` count).
   - **One dedicated table for `work-item`** entries (`Source file:line`, `Summary`, `Status`, `Evidence / Card link`).
   - **One dedicated table for `procedure`** entries (`Source file:line`, `Summary`, `Status`, `Proposed docs/checklists/<name>.md target`).
5. Verify no other files were modified and `pnpm tasks:lint` exits 0.

## Acceptance criteria

- [x] `test -f docs/tasks/INVENTORY-specs.md && rg -n "Count Summary|work-item|procedure|unverified|T-008" docs/tasks/INVENTORY-specs.md` — file exists with separate `work-item` and `procedure` tables, `unverified` status support, count summary, and `T-008` routing
evidence: `test -f` passed; `rg -n "Count Summary|work-item|procedure|unverified|T-008" docs/tasks/INVENTORY-specs.md` → 73 matching lines; first hits: `11:## Count Summary`, `13:| Status | work-item | procedure | total |`, `18:| unverified | 27 | 37 | 64 |`, `22:Routed to T-008 (owner owes... items): 0.`
, `24:## work-item items (304)`, and `## procedure items (99)`
- [x] `git diff --name-only origin/main -- ':!docs/tasks/INVENTORY-specs.md'` — contains no unintended edits
evidence: output is exactly `docs/tasks/T-017a-checklist-inventory-specs.md` (this card's own file; no other path touched)
- [x] `pnpm tasks:lint` — exits 0
evidence: `node scripts/tasks.mjs lint` → `tasks:lint OK (24 card(s) checked)`, exit code 0

## Evidence

- Enumeration (worktree on `task/T-017a` at main `9d3f635`, 2026-11-27):
  - `rg -n "^\s*- \[ \]" specs` → **403** items in **37** files
  - `Get-ChildItem specs -Directory` → **61** spec directories; `Get-ChildItem specs -Recurse -Filter *.md` → **149** markdown files
  - `rg -i "owner owes"` over the 403 enumerated items → **0** matches, so nothing routes to `T-008` from this inventory
- Resulting classification (`docs/tasks/INVENTORY-specs.md` Count Summary): already-done 246, stale 50, duplicate-of-card 2, unverified 64, real 41 — work-item 304, procedure 99.
- `bash .github/scripts/check-doc-links.sh` → `All internal Markdown links resolve.` (exit 0)

## Rollback

Move `docs/tasks/INVENTORY-specs.md` to `.trash/` per I9.

## Open questions

- None
