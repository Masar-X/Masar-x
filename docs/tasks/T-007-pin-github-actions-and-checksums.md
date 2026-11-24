---
id: T-007
title: "Pin GitHub Actions by SHA and verify CI binary checksums"
priority: P0
status: todo
depends_on:
  - T-006
touches:
  - ".github/workflows/ci.yml"
  - ".github/workflows/fallow.yml"
  - ".github/workflows/lighthouse.yml"
  - ".github/workflows/release.yml"
owner_action: false
area: ci
estimate: 0.5d
---

## Context

- [VERIFIED] Across all 4 workflows in `.github/workflows/` (`ci.yml`, `fallow.yml`, `lighthouse.yml`, `release.yml`), there are **43** `uses:` steps total: **2** are already SHA-pinned (`fallow-rs/fallow@b6a3e048dc882bdf11c8269c73167223b9e32774` at `.github/workflows/fallow.yml:55` and `treosh/lighthouse-ci-action@3e7e23fb74242897f95c0ba9cabad3d0227b9b18` at `.github/workflows/lighthouse.yml:120`), and **41** use mutable major tags:
  - `actions/checkout@v7` ×16 (`ci.yml:29,91,119,181,219,310,333,349,407,448,522,559,587`, `fallow.yml:48`, `lighthouse.yml:71`, `release.yml:92`)
  - `actions/setup-node@v7` ×11 (`ci.yml:34,96,124,224,313,354,412,453,592`, `lighthouse.yml:76`, `release.yml:97`)
  - `pnpm/action-setup@v6` ×10 (`ci.yml:32,94,122,222,352,410,451,590`, `lighthouse.yml:74`, `release.yml:95`)
  - `actions/upload-artifact@v7` ×3 (`ci.yml:283,372,499`)
  - `denoland/setup-deno@v2` ×1 (`ci.yml:525`)
- [VERIFIED] Across `.github/workflows/*.yml`, there are 5 `curl` commands: 2 localhost readiness probes (`.github/workflows/ci.yml:483`, `.github/workflows/lighthouse.yml:106`) and **3** unverified remote binary downloads:
  - `ripgrep 14.1.1` at `.github/workflows/ci.yml:190`
  - `gitleaks 8.18.4` at `.github/workflows/ci.yml:250`
  - `actionlint v1.7.7` at `.github/workflows/ci.yml:564`
- [VERIFIED] `depends_on: [T-006]` serializes this card after `T-006` edits `.github/workflows/ci.yml` so any new actions added by `T-006` are also SHA-pinned without merge conflicts.

## Goal

Eliminate mutable GitHub Action tag and unverified binary supply-chain surfaces across all `.github/workflows/*.yml` files by pinning every `uses:` step to an exact commit SHA (preserving `# vX` comments) and verifying SHA-256 checksums for every `curl` binary download.

## Non-goals

- Enabling `.github/dependabot.yml` auto-PRs for Actions beyond pinning existing workflow versions (unless separately scoped).
- Changing CI job behavior, Node/pnpm/Deno versions, or release artifact targets.

## Steps

1. Resolve the exact 40-character commit SHA for each of the 5 distinct action tags (`actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`, `actions/upload-artifact@v7`, `denoland/setup-deno@v2`, plus any action added by `T-006`) via `gh api` / `git ls-remote`, and replace all 41+ mutable `uses:` references across `.github/workflows/ci.yml`, `fallow.yml`, `lighthouse.yml`, and `release.yml` with `<owner>/<repo>@<40-char-sha> # <tag>`.
2. Compute/verify the upstream SHA-256 checksums for `ripgrep 14.1.1` (`.github/workflows/ci.yml:190`), `gitleaks 8.18.4` (`.github/workflows/ci.yml:250`), and `actionlint v1.7.7` (`.github/workflows/ci.yml:564`), download the tarball to a temp file, and verify with `echo "<sha256>  <file>" | sha256sum -c -` before extracting.
3. Run `actionlint -color` across `.github/workflows/` and confirm every CI workflow job passes on the PR.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] Every `uses:` line across `.github/workflows/*.yml` matches `@[0-9a-f]{40}` with a trailing `# v...` version comment (0 mutable tag pins).
- [ ] All 3 binary downloads in `.github/workflows/ci.yml` (`ripgrep`, `gitleaks`, `actionlint`) verify `sha256sum -c -` before extraction.
- [ ] `actionlint -color` exits 0 and all CI jobs pass on the PR.

## Evidence

## Rollback

Revert the workflow commit via `git revert <commit>`.

## Open questions

- None.
