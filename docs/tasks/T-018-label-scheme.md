---
id: T-018
title: "Label scheme and owner-step protocol"
priority: P1
status: done
depends_on: []
touches:
  - "scripts/tasks.mjs"
  - "scripts/tasks.test.mjs"
  - "docs/tasks/README.md"
  - "docs/tasks/PROJECT.md"
  - ".github/PULL_REQUEST_TEMPLATE.md"
  - "docs/tasks/T-018-label-scheme.md"
  - "docs/tasks/T-019-neutral-repo.md"
owner_action: false
area: ci
estimate: 0.5d
---

## Context

- [VERIFIED] `docs/tasks/README.md` at `2949f2c`: a PR for an `owner_action: true` card is labeled `blocked` and `owner-action` and waits for an `"owner step done"` comment before merging. `scripts/tasks.mjs` `deriveCardStatus` reads those two labels from open PRs only.
- [VERIFIED] `gh label list` on 2026-11-25: `blocked`, `owner-action`, `P0`, `P1`, `P2`, and seven bare area names. PRs #333, #336 and #338 were green and frozen by the rule above.
- [VERIFIED] A merge runs no Edge Function deploy (`rg "functions deploy" .github/` returns nothing) and cannot change GitHub settings (ruleset writes need admin credentials). None of the three PRs touches the web app that Vercel deploys from `main`, so freezing them protected nothing.

## Goal

Labels that say what they mean: `needs: owner` on issues, `priority: P0|P1|P2`, `area: <name>`. An owner step never freezes a finished PR: the step lives in the linked Issue as a checkbox runbook.

## Non-goals

- Rewriting the three cards already in flight (T-002, T-004, T-008). Each PR updates its own card.
- Wording beyond labels and the owner rule (T-019).

## Steps

1. Rename the live labels with `gh label edit` (attachments follow the rename), move the owner label from PRs #333/#336/#338 to issues #312/#314/#319, publish a runbook on each, delete the retired `blocked` label.
2. `scripts/tasks.mjs`: `blocked` means a branch or PR exists and the card's Issue carries `needs: owner` (a former label still on an open PR counts too); `sync-issues` uses and creates the new label names. Tests updated.
3. `docs/tasks/README.md`, `docs/tasks/PROJECT.md`, PR template: the new rule.
4. Merge when green, fast-forward the primary checkout.
5. Follow-up: drop the retired names from `scripts/tasks.mjs` once nothing carries them.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + output>` (enforced by `pnpm tasks:lint`). -->

- [x] `gh issue list --label "needs: owner"` lists #312, #314 and #319
  evidence: `gh issue list --repo Masar-X/Masar-x --label "needs: owner"` -> `319 OPEN T-008 Convert owner-owed items into GitHub issues  needs: owner, priority: P1, area: docs`, `314 OPEN T-004 Enforce fail-closed auth-hook-email JWT verification  needs: owner, priority: P0, area: supabase`, `312 OPEN T-002 Require all CI checks and strict ruleset policy  needs: owner, priority: P0, area: ci` (three rows, nothing else)
- [x] `pnpm tasks:status` is unchanged for T-002, T-004 and T-008 (`blocked`, same PRs)
  evidence: `node scripts/tasks.mjs status` in the worktree -> `T-002 P0 blocked T-001 true ci #336 https://github.com/Masar-X/Masar-x/pull/336`, `T-004 P0 blocked - true supabase #333 https://github.com/Masar-X/Masar-x/pull/333`, `T-008 P1 blocked - true docs #338 https://github.com/Masar-X/Masar-x/pull/338`, `WIP (doing + review): 0/3`; the same three rows read `blocked` on `main` before this change
- [x] `pnpm tasks:test` and `pnpm tasks:lint` pass
  evidence: `pnpm tasks:test` -> `tests 27 / pass 27 / fail 0`; `pnpm tasks:lint` -> `tasks:lint OK (24 card(s) checked)`

## Evidence

- Branch `chore/label-scheme` instead of `task/T-018`: the card did not exist on `main`, so `tasks:next` had nothing to claim. The card and its implementation land in this one PR.
- Live label migration (2026-11-25): `gh label edit owner-action --name "needs: owner" --color FBCA04`; `gh pr edit 333|336|338 --remove-label "needs: owner"`; `gh label delete blocked`; `gh label edit P0|P1|P2 --name "priority: P<n>"` (colors unchanged); `gh label edit <area> --name "area: <area>" --color 6E7781` for the seven areas.
- Runbooks: #314 (hook secret, deploy, real signup and recovery), #312 (fresh-GET ruleset update, diff reviewed, owner `PUT`), #319 (dry run, then `create-owner-issues.sh --apply`).
- `docs/tasks/README.md` is 40 lines and `docs/tasks/PROJECT.md` 28 lines (budgets 60 and 30).

## Rollback

`gh label edit` each label back to its former name (attachments follow the rename), put `blocked` back on the three PRs, revert the PR.

## Open questions

- None.
