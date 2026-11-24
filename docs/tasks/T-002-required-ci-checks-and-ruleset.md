---
id: T-002
title: "Require all CI checks and strict ruleset policy"
priority: P0
status: todo
depends_on:
  - T-001
touches:
  - ".github/RULESET.md"
owner_action: true
area: ci
estimate: 0.25d
---

## Context

- [VERIFIED] `.github/RULESET.md:20-28` and the live ruleset (`gh api repos/Masar-X/Masar-x/rulesets/20299668`) currently enforce 7 status checks: `Vercel`, `ESLint`, `next build`, `ai-endpoint-grep`, `gitleaks-artifacts`, `e2e`, and `workflow-lint`.
- [VERIFIED] `.github/workflows/ci.yml` defines 13 jobs total; the 5 target jobs to promote use exact `name:` values `workspaces` (`.github/workflows/ci.yml:115`), `test` (`.github/workflows/ci.yml:345`), `mobile` (`.github/workflows/ci.yml:400`), `deno-check` (`.github/workflows/ci.yml:517`), and `deps-audit (critical gate)` (`.github/workflows/ci.yml:582` — note job ID `deps-audit` at `:581` emits check context `deps-audit (critical gate)`). Additionally, `docs-lint` (`ci.yml:306`) passed 10/10 on the last 10 `main` CI runs (plus PR #310 `45448751059/job/138639682818`), making it eligible; `translations` (`ci.yml:329`) is also present; and any `db-verify` job added by `T-006a` should wait 1 green week before promotion.
- [VERIFIED] `.github/workflows/ci.yml:3-7` triggers on `pull_request` and `push` to `main` with NO workflow-level `paths:` or `paths-ignore:` filters, and NONE of the 13 jobs (`ci.yml:24,66,114,176,214,305,328,344,399,437,516,554,581`) has a job-level `if:` condition (the only `if:` expressions are step-level at `ci.yml:282,371,442,498`), so no candidate required job can be skipped at the job level and hang PRs pending.
- [VERIFIED] Across the last 10 `main` CI runs (`gh run list --workflow=ci.yml --branch main --limit 10`), `e2e` passed 8/10 (`45086856930`, `45086452278`, `45077445370`, `45073059936`, `45060892539`, `45055631032`, `45048656678`, `45043921655`) and failed 2/10 (`45078374902`, `45057522480`, both due to `news-faq` `page.waitForRequest` 45s timeout), and `e2e` passed on PR #310 (`45448751059/job/138639682120`). Recommendation: keep `e2e` required (already enforced in ruleset `20299668` and is the only Playwright end-to-end gate) while tracking the intermittent `news-faq` timeout separately.
- [VERIFIED] `.github/RULESET.md:39` and the live ruleset set `strict_required_status_checks_policy: false`, allowing PRs to merge with stale bases relative to `main`.
- [VERIFIED] `.github/RULESET.md:32-34` documents that agent/non-admin tokens receive 404 when attempting `PATCH`/`PUT` on `repos/Masar-X/Masar-x/rulesets/20299668`, so the live ruleset update requires owner admin credentials.
- [INFERRED] Querying `gh api repos/Masar-X/Masar-x/rulesets/20299668` with a non-admin token returned `bypass_actors: []` while `.github/RULESET.md:66-70` documents 3 bypass actors (`RepositoryRole 5`, `Integration 8329`, `Integration 347564`); the owner must preserve the live `bypass_actors` array when updating via `PUT`.

## Goal

Update GitHub branch protection ruleset `20299668` so `test`, `workspaces`, `mobile`, `deno-check`, and `deps-audit (critical gate)` (plus `docs-lint`, verified 10/10 green) are required checks on `main` alongside the existing 7 required checks (keeping `e2e` required), set `strict_required_status_checks_policy: true`, and sync `.github/RULESET.md`.

## Non-goals

- Modifying CI job definitions in `.github/workflows/ci.yml` (covered by `T-006a` and `T-007`).
- Promoting `db-verify` before 1 green week post-`T-006a`, or requiring report-only workflows (`fallow-audit (report-only)` in `.github/workflows/fallow.yml:41`, `lighthouse` in `.github/workflows/lighthouse.yml:43`).

## Steps

1. Update `.github/RULESET.md:20-43` to document the required checks using exact `name:` values from `.github/workflows/ci.yml` (existing 7 including `e2e`, plus `test`, `workspaces`, `mobile`, `deno-check`, `deps-audit (critical gate)`, and `docs-lint`), note `db-verify` eligibility after 1 green week post-`T-006a`, and record `strict_required_status_checks_policy: true`.
2. Prepare exact owner-run `gh api` commands in the PR body / comment: fetch the live ruleset as admin (`gh api repos/Masar-X/Masar-x/rulesets/20299668 > ruleset.json`) to preserve `bypass_actors`, add the required status check contexts (GitHub Actions `integration_id: 15368`), set `strict_required_status_checks_policy: true`, and run `gh api --method PUT repos/Masar-X/Masar-x/rulesets/20299668 --input ruleset.json`.
3. Label the PR `blocked` and `owner-action`; do NOT merge until the owner executes the `gh api` update, comments `"owner step done"` on the PR, and `gh api repos/Masar-X/Masar-x/rulesets/20299668` confirms the new settings.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `.github/RULESET.md` lists exact check names matching `.github/workflows/ci.yml` (`test`, `workspaces`, `mobile`, `deno-check`, `deps-audit (critical gate)`, `docs-lint`, and existing `e2e`) and `strict_required_status_checks_policy: true`.
- [ ] PR is labeled `blocked` and `owner-action` and has an owner `"owner step done"` comment before merge.
- [ ] `gh api repos/Masar-X/Masar-x/rulesets/20299668 --jq '.rules[] | select(.type=="required_status_checks") | .parameters'` confirms `strict_required_status_checks_policy: true` and all required contexts after owner execution.
- [ ] `bash .github/scripts/check-doc-links.sh` exits 0 and CI `workflow-lint` passes.

## Evidence

## Rollback

Restore the prior ruleset JSON via `gh api --method PUT repos/Masar-X/Masar-x/rulesets/20299668 --input ruleset-backup.json` and revert `.github/RULESET.md`.

## Open questions

- Confirm whether `translations` (`.github/workflows/ci.yml:329`) should also be promoted alongside `docs-lint` in the same `PUT` call.
