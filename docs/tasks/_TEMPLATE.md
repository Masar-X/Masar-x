---
id: T-XXX
title: "Short imperative task title"
priority: P1 # P0 | P1 | P2
status: todo # todo | done only (never hand-edit to doing)
depends_on: []
touches:
  - "path/to/file-or-glob" # non-empty list of files/globs this card modifies
owner_action: false # true if owner must run secrets/settings steps
area: web # web | desktop | mobile | shared | supabase | ci | docs
estimate: 0.5d # split cards bigger than ~1d
---

## Context

- [VERIFIED] Cite exact `file:line` observed in the worktree.
- [INFERRED] Note any unverified/runtime-only assumptions clearly.

## Goal

State the concrete outcome and why it matters.

## Non-goals

- Explicitly list what is out of scope for this card.

## Steps

1. Concrete implementation step.
2. Concrete verification step.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `<command>` — expected output or exit status

## Evidence

<!-- Leave empty until the finishing PR; paste exact commands and outputs for each checked item above. -->

## Rollback

How to revert safely if this change causes a regression.

## Open questions

- None (or list unresolved decisions before starting).
