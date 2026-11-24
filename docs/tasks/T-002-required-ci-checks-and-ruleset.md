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

- [VERIFIED] `.github/RULESET.md:20-28` and the live ruleset (`gh api repos/Masar-X/Masar-x/rulesets/20299668`) currently enforce only 7 status checks: `Vercel`, `ESLint`, `next build`, `ai-endpoint-grep`, `gitleaks-artifacts`, `e2e`, and `workflow-lint`.
- [VERIFIED] `.github/workflows/ci.yml` defines 13 jobs total; 7 jobs are NOT required in the ruleset: `workspaces` (`.github/workflows/ci.yml:115`), `docs-lint` (`.github/workflows/ci.yml:306`), `translations` (`.github/workflows/ci.yml:329`), `test` (`.github/workflows/ci.yml:345`), `mobile` (`.github/workflows/ci.yml:400`), `deno-check` (`.github/workflows/ci.yml:517`), and `deps-audit (critical gate)` (`.github/workflows/ci.yml:582`). Note that job ID `deps-audit` (`ci.yml:581`) emits check context `deps-audit (critical gate)`, not `deps-audit`.
- [VERIFIED] `.github/RULESET.md:39` and the live ruleset set `strict_required_status_checks_policy: false`, allowing PRs to merge with stale bases relative to `main`.
- [VERIFIED] `.github/RULESET.md:32-34` documents that agent/non-admin tokens receive 404 when attempting `PATCH`/`PUT` on `repos/Masar-X/Masar-x/rulesets/20299668`, so the live ruleset update requires owner admin credentials.
- [INFERRED] Querying `gh api repos/Masar-X/Masar-x/rulesets/20299668` with a non-admin token returned `bypass_actors: []` while `.github/RULESET.md:66-70` documents 3 bypass actors (`RepositoryRole 5`, `Integration 8329`, `Integration 347564`); the owner must preserve the live `bypass_actors` array when updating via `PUT`.

## Goal

Update GitHub branch protection ruleset `20299668` so `test`, `workspaces`, `deno-check`, `deps-audit (critical gate)`, `translations`, `mobile`, and `docs-lint` are required checks on `main` with `strict_required_status_checks_policy: true`, and sync `.github/RULESET.md`.

## Non-goals

- Modifying CI job definitions in `.github/workflows/ci.yml` (covered by `T-006` and `T-007`).
- Requiring report-only workflows (`fallow-audit (report-only)` in `.github/workflows/fallow.yml:41` or `lighthouse` in `.github/workflows/lighthouse.yml:43`).

## Steps

1. Update `.github/RULESET.md:20-43` to document all 14 required checks (the existing 7 plus `workspaces`, `test`, `deno-check`, `deps-audit (critical gate)`, `translations`, `mobile`, `docs-lint`, using exact `name:` values from `.github/workflows/ci.yml`) and `strict_required_status_checks_policy: true`.
2. Prepare exact owner-run `gh api` commands in the PR body / comment: fetch the live ruleset as admin (`gh api repos/Masar-X/Masar-x/rulesets/20299668 > ruleset.json`) to preserve `bypass_actors`, add the missing required status check contexts (GitHub Actions `integration_id: 15368`), set `strict_required_status_checks_policy: true`, and `gh api --method PUT repos/Masar-X/Masar-x/rulesets/20299668 --input ruleset.json`.
3. Label the PR `owner-action` and stop for owner execution of the `gh api` update, then verify via `gh api repos/Masar-X/Masar-x/rulesets/20299668`.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `.github/RULESET.md` lists exact check names matching `.github/workflows/ci.yml` (`workspaces`, `test`, `deno-check`, `deps-audit (critical gate)`, `translations`, `mobile`, `docs-lint`) and `strict_required_status_checks_policy: true`.
- [ ] `gh api repos/Masar-X/Masar-x/rulesets/20299668 --jq '.rules[] | select(.type=="required_status_checks") | .parameters'` returns `strict_required_status_checks_policy: true` and all required contexts (verified by owner after applying).
- [ ] `bash .github/scripts/check-doc-links.sh` exits 0 and CI `workflow-lint` passes.

## Evidence

## Rollback

Restore the prior ruleset JSON via `gh api --method PUT repos/Masar-X/Masar-x/rulesets/20299668 --input ruleset-backup.json` and revert `.github/RULESET.md`.

## Open questions

- Confirm with the owner whether `docs-lint` and `mobile` should be promoted alongside `workspaces`, `test`, `deno-check`, `deps-audit (critical gate)`, and `translations` (both are already green jobs in `.github/workflows/ci.yml:305-426`).
