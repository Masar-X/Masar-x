---
id: T-017
title: "Inventory and classify all markdown checklists into docs/tasks/INVENTORY.md"
priority: P1
status: todo
depends_on: []
touches:
  - "docs/tasks/INVENTORY.md"
owner_action: false
area: docs
estimate: 0.5d
---

## Context

- [VERIFIED] Scanning the repository for unchecked markdown items (`^\s*- \[ \]`) finds **628** unchecked boxes across `.md` files: `specs/` (403), `docs/` (167), `.specify/` (40), and `.github/` (18).
- [VERIFIED] Notable checklist files in `docs/` and `.github/` include: `docs/design/UIUX_IMPROVEMENT_PLAN.md` (41 unchecked), `docs/SETUP.md` (39), `docs/releases/CUT-CHECKLIST.md` (33, marked `DEPRECATED 2026-09-20` at `:2,7`), `docs/legacy/REORGANIZATION_PLAN.md` (25), `docs/security/secret-leak-runbook.md` (10), `docs/SMOKE_TEST_REPORT.md` (10), `docs/agents/references/08-precommit.md` (8), `.github/PULL_REQUEST_TEMPLATE.md` (13), `.github/ISSUE_TEMPLATE/feature_request.md` (5), plus `.specify/templates/{checklist,tasks}-template.md` (6 + 34).
- [VERIFIED] Additional checklist/action items without `- [ ]` syntax exist in `AGENTS.md` Active Specs Ledger (`AGENTS.md:47-82`, including 7 "owner owes" items routed to `T-008`) and `specs/*/tasks.md` / `specs/*/checklists/*.md`.

## Goal

Produce a complete, verified checklist inventory in `docs/tasks/INVENTORY.md` (read-only analysis deliverable) classifying every checklist item by status and type so unfinished work is separated from reusable operational procedures and owner-owed actions.

## Non-goals

- Do NOT create new `T-XXX` task cards during this inventory (owner decides which `work-item` entries become cards).
- Do NOT edit source docs, specs, or `AGENTS.md` while building `docs/tasks/INVENTORY.md`.
- Do NOT duplicate "owner owes..." items into new cards — route them to `T-008`.

## Steps

1. Scan the entire repository (`rg -n "^\s*- \[ \]" --glob "*.md"` plus `docs/`, `specs/`, and `AGENTS.md` ledger checklists) to collect every checklist file and item with exact `file:line`.
2. Classify every item by **STATUS**:
   - `already-done` (cite exact commit, file, or code evidence)
   - `stale` (superseded, deprecated, or referring to deleted/archived artifacts)
   - `duplicate-of-card` (covered by an existing `T-001`..`T-016` card; route all "owner owes..." items to `T-008`)
   - `real` (still open and valid)
3. Classify every item by **TYPE**:
   - `work-item`: unfinished work; candidate for a future card (owner decides; do NOT create cards yourself).
   - `procedure`: reusable checklist (release, deploy, PR, onboarding, pre-commit); do NOT convert to a card; propose moving/consolidating to `docs/checklists/<name>.md` citing source `file:line`.
4. Write `docs/tasks/INVENTORY.md` containing:
   - A top-level **Count Summary** table (totals by Type × Status, plus routed-to-`T-008` count).
   - **One dedicated table for `work-item`** entries (`Source file:line`, `Summary`, `Status`, `Evidence / Card link`).
   - **One dedicated table for `procedure`** entries (`Source file:line`, `Summary`, `Status`, `Proposed docs/checklists/<name>.md target`).
5. Validate that no other files were modified and `pnpm tasks:lint` passes.

## Acceptance criteria

- [ ] `test -f docs/tasks/INVENTORY.md && rg -n "Count Summary|work-item|procedure|T-008" docs/tasks/INVENTORY.md` — file exists with separate `work-item` and `procedure` tables, count summary, and `T-008` routing
- [ ] `git diff --name-only origin/main -- ':!docs/tasks/INVENTORY.md'` — contains no unintended edits outside `docs/tasks/INVENTORY.md`
- [ ] `pnpm tasks:lint` — exits 0

## Evidence

## Rollback

Move `docs/tasks/INVENTORY.md` to `.trash/` per I9.

## Open questions

- Should `.specify/templates/*.md` placeholder `- [ ]` items be excluded from the `work-item` count as scaffolding templates, or listed under `procedure`?
