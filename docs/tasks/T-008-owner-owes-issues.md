---
id: T-008
title: "Convert owner-owed items into GitHub issues"
priority: P1
status: done
depends_on: []
touches:
  - "AGENTS.md"
  - "scripts/create-owner-issues.sh"
owner_action: true
area: docs
estimate: 0.5d
---

## Context

- [VERIFIED] `AGENTS.md` carried 7 ledger rows with owner-owed items (lines 57, 65, 72, 75, 77, 80, 81 at `4c664fd`), and `specs/**/*.md` carries owner-action sections (018:35, 019:46, 020:29, 014:6, 028:9, 052:15, 009:22-23).
- [VERIFIED] Several of those items already have tickets on `Masar-X/Masar-x`: #283 (timetable data swap), #289 (the owner register: hook secret, Authenticode signing, Crashpad submission, BIS naming), #308 (the `detectSessionInUrl` fix, merged 2026-11-23 as `0e76c4d`), #314 (the hook-secret runbook).
- [VERIFIED] Mobile on `main` is 0.7.0 (`apps/mobile/package.json`); spec 050's `plan.md` (T4) owes both `ai-chat` and `summarize-chat` edge redeploys; spec 009's runbook checks sit at `tasks.md:22-23`.

## Goal

Every owner-owed item is either tracked by an existing issue or filed by `scripts/create-owner-issues.sh` (dry run by default, `--apply` for the repository owner), and the ledger rows point at that tracking instead of prose.

## Non-goals

- Running `--apply` (owner-only; the runbook is on #319).
- Implementing the underlying actions (deploys, secrets, store accounts).

## Steps

1. Audit the ledger rows and spec owner-action sections against existing issues; point rows 034, 040-review-remediation, 052 and 056 at #283 / #314 / #289 / #308.
2. Rewrite `scripts/create-owner-issues.sh`: the five items that have no ticket yet, labeled `needs: owner`, with an exact-title duplicate check (the dry run reports skips; `--apply` refuses to run without the list), and plain titles and bodies.
3. Update ledger rows 050 and 055 (the edge-function redeploys) to point at the script.
4. Keep the owner runbook on #319.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + output>` (enforced by `pnpm tasks:lint`). -->

- [x] `bash -n scripts/create-owner-issues.sh` exits 0 and the dry run creates nothing
  evidence: `bash -n` -> exit 0; dry run -> five `[DRY-RUN] gh issue create ... --label "needs: owner"` blocks ending in `DRY-RUN complete - 5 issue(s) would be created, 0 skipped (already tracked) on Masar-X/Masar-x.`; the dry run only lists existing issues and writes nothing
- [x] `rg -n -i "owes|owed" AGENTS.md` returns no unresolved owner-owed prose
  evidence: `rg -n -i "owes|owed" AGENTS.md` -> no matches; rows 034, 040-review-remediation, 050, 052, 055 and 056 point at #283 / #314 / #289 / #308 / the script
- [x] `--apply` refuses to run when the duplicate check cannot run
  evidence: with `gh` removed from PATH the script prints `gh: command not found` then `error: could not list existing issues; refusing to --apply without the duplicate check` and exits 1 before creating anything
- [x] the remaining manual steps are published on issue #319 with label `needs: owner`
  evidence: https://github.com/Masar-X/Masar-x/issues/319#issuecomment-7169175692
- [x] `pnpm tasks:lint` exits 0
  evidence: `tasks:lint OK (24 card(s) checked)`

## Evidence

- Branch `task/T-008` with `main` (`f60f054`) merged in; worktree `../masarx-wt/task-T-008`.
- Tracking map: #283 schedules sheet; #289 register (hook secret, Authenticode, Crashpad, BIS naming); #314 hook-secret runbook; #308 `detectSessionInUrl` fix; the script files the five untracked items (edge redeploys including `summarize-chat`, faculty stack provisioning, reset-password verification after #308, mobile store launch ops, spec 009 runbook checks).
- `.gitattributes` pins `*.sh text eol=lf`, so the script stays LF on every checkout.

## Rollback

Revert the PR. The script creates nothing until the owner runs `--apply`; any issues it created are closed by hand.

## Open questions

- None.
