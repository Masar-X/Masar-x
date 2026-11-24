---
id: T-008
title: "Convert owner-owed items into GitHub issues"
priority: P1
status: todo
depends_on: []
touches:
  - "AGENTS.md"
  - "scripts/create-owner-issues.sh"
owner_action: true
area: docs
estimate: 0.5d
---

## Context

- [VERIFIED] `AGENTS.md:57,65,72,75,77,80,81` contains **7** Active Specs Ledger rows with explicit owner-owed items, while `specs/**/*.md` (149 markdown files scanned) contains **0** `owner owes` lines (though 7 spec files carry `## Owner actions` / owner-action headings such as `specs/018_mobile_launch_readiness/tasks.md:35`, `specs/019_mobile_parity/tasks.md:46`, `specs/020_mobile_polish/tasks.md:29`, `specs/014-desktop-launch-readiness/spec.md:6`, `specs/028-desktop-crashpad-logs/spec.md:9`, `specs/052-faculty-white-label/spec.md:15`, and `specs/009_mvp-launch-ops-hardening/tasks.md:21`).
- [VERIFIED] Breakdown of the 7 `AGENTS.md` ledger items:
  1. `AGENTS.md:57` (`034-subjects-schedules`): newer `"طبعة (نهائي)"` الشعبة-tab sheet still owed for the schedule data swap.
  2. `AGENTS.md:65` (`040-review-remediation`): `SEND_EMAIL_HOOK_SECRET` still owed (cross-referenced with `T-004`).
  3. `AGENTS.md:72` (`047-schedules-enhancement`): states `owner owes merge`, which is **stale** because the same row begins with `Merged (squash fedc59871, PR #233, 2026-11-18)`.
  4. `AGENTS.md:75` (`050-zane-prompt-injection-hardening`): `ai-chat` edge-function redeploy owed.
  5. `AGENTS.md:77` (`052-faculty-white-label`): BIS preset real naming + faculty stack (new Supabase project + Vercel project with `NEXT_PUBLIC_FACULTY=fcai-asnu` + `NEXT_PUBLIC_SITE_URL`).
  6. `AGENTS.md:80` (`055-brand-string-sweep`): redeploy `ai-chat` edge function after merge (overlaps/supersedes `AGENTS.md:75`).
  7. `AGENTS.md:81` (`056-web-e2e-gap-close`): owner triage owed for `detectSessionInUrl` auto-exchanging the PKCE recovery code at `/reset-password` load before submit.
- [INFERRED] Creating issues on `Masar-X/Masar-x` requires owner review and authenticated `gh` access; an agent must prepare the commands/script without executing `gh issue create`.

## Goal

Replace prose "owner owes" backlog notes in `AGENTS.md` (and any still-open spec owner-action items) with tracked GitHub issue commands ready for one-shot owner execution, then link the created issue numbers back into the ledger and clean up stale entries (like `AGENTS.md:72`).

## Non-goals

- Do NOT run `gh issue create` or mutate GitHub issues autonomously without explicit owner approval.
- Do NOT extract the full ledger out of `AGENTS.md` (handled separately by `T-014` after `T-008`).
- Do NOT implement the underlying owner actions (edge deploys, secret rotation, Supabase/Vercel provisioning).

## Steps

1. Audit the 7 `AGENTS.md:57,65,72,75,77,80,81` items plus the 7 `specs/` owner-action sections to deduplicate overlaps (`AGENTS.md:75` + `80` `ai-chat` redeploy; `AGENTS.md:65` vs `T-004`) and drop stale items (`AGENTS.md:72`).
2. Generate `scripts/create-owner-issues.sh` (non-executing unless run by owner, or dry-run by default) containing exact `gh issue create --repo Masar-X/Masar-x --title ... --body ... --label ...` commands for each real remaining item, and paste the commands in the PR description with label `owner-action`.
3. Wait for owner to run the commands and provide created `#<issue>` numbers (or run on owner confirmation).
4. Replace "owner owes ..." text in `AGENTS.md` ledger rows with `Tracked in #<issue>` links and remove the stale `owner owes merge` note at `AGENTS.md:72`.

## Acceptance criteria

- [ ] `bash -n scripts/create-owner-issues.sh` — exits 0 with valid shell syntax and zero `gh issue create` calls executed during PR creation
- [ ] `rg -n "owner (still )?owes|owner triage owed" AGENTS.md` — returns 0 unresolved prose "owner owes" entries (replaced by `#<issue>` links or stale entry removed)
- [ ] `pnpm tasks:lint` — exits 0

## Evidence

## Rollback

Revert `AGENTS.md` and move `scripts/create-owner-issues.sh` to `.trash/` per I9; close any created GitHub issues via `gh issue close <num>`.

## Open questions

- Which of the historical `specs/009`, `014`, `018`, `019`, `020`, `028` owner-action items are already completed in production vs still open?
- Should `ai-chat` edge-function redeploys (`AGENTS.md:75` and `AGENTS.md:80`) be consolidated into a single GitHub issue?
