---
id: T-019
title: "Neutral wording in task docs and PR template"
priority: P1
status: todo
depends_on: []
touches:
  - "docs/tasks/README.md"
  - "docs/tasks/PROJECT.md"
  - "docs/tasks/_TEMPLATE.md"
  - ".github/PULL_REQUEST_TEMPLATE.md"
owner_action: false
area: docs
estimate: 0.25d
---

## Context

- [VERIFIED] `.github/PULL_REQUEST_TEMPLATE.md` has a "What I did NOT verify" section, `docs/tasks/PROJECT.md` line 3 says "Agents must never run ...", and `docs/tasks/_TEMPLATE.md` asks for `[VERIFIED]`/`[INFERRED]` tags (read on `main` at `2949f2c`).
- [VERIFIED] `AGENTS.md`, `.specify/` (9 tracked files) and `.windsurf/workflows/review.md` are tracked (`git ls-files`, 2026-11-25) and are read by name by coding tools. `.github/copilot-instructions.md`, `.github/agents/` and `.github/prompts/` exist on disk but are git-ignored (`.gitignore:208`), so they are not published.

## Goal

Task-board docs and the PR template read like ordinary engineering documentation: plain sections, no tooling or session vocabulary.

## Non-goals

- `AGENTS.md`, `.specify/` and `.windsurf/`: whether to keep, untrack, or move them out is the owner's decision (see Open questions). Do not touch them here.
- `specs/**`, git history, and cards that are already open (each is fixed when it is next touched).

## Steps

1. PR template: replace "What I did NOT verify" with "Follow-ups"; keep the checklist items that describe the change and drop the ones that describe the contributor.
2. `docs/tasks/README.md`, `PROJECT.md`, `_TEMPLATE.md`: neutral wording for the person doing the work; keep the line budgets (README at most 60 lines, PROJECT at most 30).
3. Run `pnpm tasks:lint`, `pnpm tasks:test` and `bash .github/scripts/check-doc-links.sh`.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `rg -n -i "agent|NOT verify" .github/PULL_REQUEST_TEMPLATE.md docs/tasks/README.md docs/tasks/PROJECT.md docs/tasks/_TEMPLATE.md` returns no matches
- [ ] `pnpm tasks:lint` and `pnpm tasks:test` pass

## Evidence

<!-- Leave empty until the finishing PR; paste exact commands and outputs for each checked item above. -->

## Rollback

Revert the PR.

## Open questions

- Owner decision: `AGENTS.md` and the other tool-facing files listed under Non-goals — keep them tracked, untrack them locally (`.gitignore`), or move them out of the repository?
