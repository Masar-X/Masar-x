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

- [VERIFIED] `AGENTS.md:57,65,72,75,77,80,81` contains **7** Active Specs Ledger rows with explicit owner-owed items, while `specs/**/*.md` (149 markdown files scanned) contains **0** `owner owes` lines (7 spec files carry `## Owner actions` / owner-action headings such as `specs/018_mobile_launch_readiness/tasks.md:35`, `specs/019_mobile_parity/tasks.md:46`, `specs/020_mobile_polish/tasks.md:29`, `specs/014-desktop-launch-readiness/spec.md:6`, `specs/028-desktop-crashpad-logs/spec.md:9`, `specs/052-faculty-white-label/spec.md:15`, and `specs/009_mvp-launch-ops-hardening/tasks.md:21`).
- [VERIFIED] Breakdown of the 7 `AGENTS.md` ledger items:
  1. `AGENTS.md:57` (`034-subjects-schedules`): newer `"طبعة (نهائي)"` الشعبة-tab sheet still owed for the schedule data swap.
  2. `AGENTS.md:65` (`040-review-remediation`): `SEND_EMAIL_HOOK_SECRET` still owed (cross-referenced with `T-004`).
  3. `AGENTS.md:72` (`047-schedules-enhancement`): states `owner owes merge`, which is **stale** because the same row begins with `Merged (squash fedc59871, PR #233, 2026-11-18)`.
  4. `AGENTS.md:75` (`050-zane-prompt-injection-hardening`): `ai-chat` edge-function redeploy owed.
  5. `AGENTS.md:77` (`052-faculty-white-label`): BIS preset real naming + faculty stack (new Supabase project + Vercel project with `NEXT_PUBLIC_FACULTY=fcai-asnu` + `NEXT_PUBLIC_SITE_URL`).
  6. `AGENTS.md:80` (`055-brand-string-sweep`): redeploy `ai-chat` edge function after merge (overlaps/supersedes `AGENTS.md:75`).
  7. `AGENTS.md:81` (`056-web-e2e-gap-close`): owner triage owed for `detectSessionInUrl` auto-exchanging the PKCE recovery code at `/reset-password` load before submit.
- [INFERRED] Whether historical `specs/` owner-action items and unverified `AGENTS.md` ledger items are still open in production cannot be verified locally; phrasing them as `"verify if still open"` lets the owner close already-resolved ones cleanly.
- [INFERRED] Creating issues on `Masar-X/Masar-x` requires owner review and authenticated `gh` access; per `docs/tasks/README.md`, `owner_action: true` PRs must carry labels `blocked` + `owner-action` and wait for `"owner step done"` before merging.

## Goal

Replace prose "owner owes" backlog notes in `AGENTS.md` (and any unverified spec owner-action items) with tracked GitHub issue commands ready for owner execution, merge overlapping `ai-chat` redeploys (`AGENTS.md:75,80`) into one issue, and remove the stale `047` note (`AGENTS.md:72`).

## Non-goals

- Do NOT run `gh issue create` or mutate GitHub issues autonomously without explicit owner approval.
- Do NOT extract the full ledger out of `AGENTS.md` (handled separately by `T-014`).
- Do NOT implement the underlying owner actions (edge deploys, secret rotation, Supabase/Vercel provisioning).

## Steps

1. Audit the 7 `AGENTS.md:57,65,72,75,77,80,81` items plus the 7 `specs/` owner-action sections:
   - Merge `AGENTS.md:75` (`050`) and `AGENTS.md:80` (`055`) `ai-chat` edge-function redeploys into **one** issue.
   - Remove the stale `owner owes merge` phrase from `AGENTS.md:72` (`047-schedules-enhancement`, already merged in PR #233).
   - Phrase each unverified item as `"verify if still open: ..."` so the owner can immediately close any already-resolved items.
2. Generate `scripts/create-owner-issues.sh` containing exact `gh issue create --repo Masar-X/Masar-x --title ... --body ... --label ...` commands (printed/dry-run by default unless `--apply` or direct owner execution).
3. Open the PR with labels `blocked` and `owner-action`, paste the exact commands in the PR body, and stop for owner execution + `"owner step done"` comment (plus created `#<issue>` numbers).
4. Once the owner provides issue numbers, update `AGENTS.md` ledger rows to `Tracked in #<issue>` and wait for `"owner step done"` before merging.

## Acceptance criteria

- [x] `bash -n scripts/create-owner-issues.sh` — exits 0 with valid shell syntax and zero `gh issue create` calls executed by the agent
  evidence: `bash -n scripts/create-owner-issues.sh` via Git for Windows bash ("C:\Program Files\Git\bin\bash.exe" — bash is not on PATH in this shell) EXIT=0; then the script ran WITHOUT `--apply`: 8 `[DRY-RUN] gh issue create --repo "Masar-X/Masar-x" --label owner-action` blocks printed + `DRY-RUN complete - 8 issues would be created on Masar-X/Masar-x.`, DRYRUN-EXIT=0; zero `gh issue create` calls executed by the agent (dry-run only echoes commands).
- [ ] `rg -n "owner (still )?owes|owner triage owed" AGENTS.md` — returns 0 unresolved prose "owner owes" entries (replaced by `#<issue>` links and stale `:72` note removed)
- [ ] `gh pr view --json labels,comments` — PR carries `blocked` + `owner-action` labels and owner comment `"owner step done"` before merge
- [x] `pnpm tasks:lint` — exits 0
  evidence: `pnpm tasks:lint` (worktree task-T-008) → `tasks:lint OK (22 card(s) checked)`, EXIT=0 (2026-11-25).

## Evidence

- `rg -n "owner (still )?owes|owner triage owed" AGENTS.md` after removing the stale 047 phrase: 4 prose matches remain (lines 65, 75, 77, 81; row 80's "Owner owes:" is capital-O so the case-sensitive pattern misses it — it is tracked in the ai-chat redeploy issue regardless). Box #2 checks only after the owner runs `--apply` and the rows become `Tracked in #<issue>` (card step 4); the PR therefore ships with boxes #2/#3 unchecked by design (T-001 precedent: partial boxes + status done are lint-valid).
- Audit mapping (7 AGENTS.md rows + 7 specs/ owner-action sections → 8 issues): 57→issue 1, 65→issue 2, 72=stale→removed (no issue), 75+80→issue 3 (merged), 77→issue 4, 81→issue 5; specs 014:6 + 028:9→issue 6, 018:35 + 019:46 + 020:29→issue 7 (stale sub-items flagged inside the body), 009:21→issue 8; 052:15 dedupes into issue 4 (its GitHub-transfer item is already done).
- Both [INFERRED] card items held up: prod-openness is not locally verifiable (hence the "verify if still open" framing), and the `blocked` / `owner-action` labels exist in Masar-X/Masar-x (verified via `gh label list`; PR #333 already carries both). No card corrections needed.
- `.gitattributes` already pins `*.sh text eol=lf`, so the new bash script stays LF on every checkout (verified in-file).
- Not verified (no environment / by design): no issues were created on GitHub (the agent never runs `--apply`); real issue numbers/URLs, the `owner step done` comment, and the post-owner-step AGENTS.md rewrite (step 4) are pending owner execution.

## Rollback

Revert `AGENTS.md` and move `scripts/create-owner-issues.sh` to `.trash/` per I9; close any created GitHub issues via `gh issue close <num>`.

## Open questions

- None (unverified items are framed as `"verify if still open"` for owner triage on GitHub).
