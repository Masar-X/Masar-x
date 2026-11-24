---
id: T-017c
title: "Inventory and classify .specify/ and .github/ checklists into INVENTORY-meta.md"
priority: P1
status: todo
depends_on: []
touches:
  - "docs/tasks/INVENTORY-meta.md"
owner_action: false
area: docs
estimate: 0.5d
---

## Context

- [VERIFIED] Scanning `.specify/` and `.github/` finds **58** unchecked `- [ ]` markdown items across 4 files:
  - `.specify/templates/tasks-template.md`: **34** placeholder `- [ ]` lines
  - `.specify/templates/checklist-template.md`: **6** placeholder `- [ ]` lines
  - `.github/PULL_REQUEST_TEMPLATE.md`: **13** PR checklist `- [ ]` lines (at `:12-16`, `:30-33`, `:45-48`)
  - `.github/ISSUE_TEMPLATE/feature_request.md`: **5** issue template `- [ ]` lines
- [VERIFIED] `.specify/templates/*.md` checkboxes are SpecKit scaffolding boilerplate rather than unfinished work items.

## Goal

Scan `.specify/` and `.github/` checklists and produce `docs/tasks/INVENTORY-meta.md` (read-only analysis) classifying items by status (`already-done`, `stale`, `duplicate-of-card`, `unverified`, `real`) and type (`work-item` vs `procedure`), recording `.specify/templates/*.md` boilerplate as one consolidated `procedure/template` row instead of 40 fake work items.

## Non-goals

- Do NOT create new `T-XXX` task cards during this inventory (owner decides which `work-item` entries become cards).
- Do NOT edit files inside `.specify/`, `.github/`, `INVENTORY-specs.md` (`T-017a`), or `INVENTORY-docs.md` (`T-017b`).
- Do NOT duplicate `"owner owes..."` items — route them to `T-008`.

## Steps

1. Scan `.specify/**/*.md` and `.github/**/*.md` (`rg -n "^\s*- \[ \]" .specify .github`) to verify all 58 unchecked lines with exact `file:line`.
2. Exclude `.specify/templates/*.md` (40 boilerplate placeholder lines) from `work-item` counts and record them as **one consolidated `procedure/template` row** citing `.specify/templates/checklist-template.md` + `.specify/templates/tasks-template.md`.
3. Classify every remaining item in `.github/` (and any non-template `.specify/` checklists) by **STATUS** (`already-done` with evidence / `stale` / `duplicate-of-card` / `unverified` / `real`) and **TYPE** (`work-item` vs `procedure`, proposing `docs/checklists/<name>.md` where a reusable checklist belongs under `docs/checklists/`, while keeping GitHub PR/issue templates in `.github/`), routing any `"owner owes..."` items to `T-008`.
4. Write `docs/tasks/INVENTORY-meta.md` with:
   - A top-level **Count Summary** table (totals by Type × Status, explicit note on excluded `.specify/templates/*.md` boilerplate, plus routed-to-`T-008` count).
   - **One dedicated table for `work-item`** entries (`Source file:line`, `Summary`, `Status`, `Evidence / Card link`).
   - **One dedicated table for `procedure`** entries (`Source file:line`, `Summary`, `Status`, `Proposed docs/checklists/<name>.md target` or `.github/` template note).
5. Verify no other files were modified and `pnpm tasks:lint` exits 0.

## Acceptance criteria

- [ ] `test -f docs/tasks/INVENTORY-meta.md && rg -n "Count Summary|work-item|procedure|procedure/template|unverified|T-008" docs/tasks/INVENTORY-meta.md` — file exists with separate `work-item` and `procedure` tables, `.specify/templates/*.md` consolidated as one `procedure/template` row, `unverified` status support, count summary, and `T-008` routing
- [ ] `git diff --name-only origin/main -- ':!docs/tasks/INVENTORY-meta.md'` — contains no unintended edits
- [ ] `pnpm tasks:lint` — exits 0

## Evidence

## Rollback

Move `docs/tasks/INVENTORY-meta.md` to `.trash/` per I9.

## Open questions

- None
