---
id: T-007
title: "Pin GitHub Actions by SHA and verify CI binary checksums"
priority: P0
status: done
depends_on: []
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
- [VERIFIED] `depends_on: []` — `touches` serializes `.github/workflows/ci.yml` against `T-006a` (no artificial dependency needed; whichever runs second also pins/preserves `ci.yml` actions).
- [CORRECTED 2026-11-25] With T-006a merged, the real totals are 44 `uses:` / 42 mutable (the db-verify checkout at ci.yml:626 was the miss). fallow's existing pin is exactly tags/v3.43.2 (comment corrected to # v3.43.2, SHA kept, no upgrade); setup-deno@v2 resolves to the v2 branch (= v2.0.5); all three binaries have official checksum files.

## Goal

Eliminate mutable GitHub Action tag and unverified binary supply-chain surfaces across all `.github/workflows/*.yml` files by pinning every `uses:` step to an exact commit SHA (preserving `# vX` comments) and verifying SHA-256 checksums for every `curl` binary download.

## Non-goals

- Enabling `.github/dependabot.yml` auto-PRs for Actions beyond pinning existing workflow versions (unless separately scoped).
- Changing CI job behavior, Node/pnpm/Deno versions, or release artifact targets.

## Steps

1. Resolve the exact 40-character commit SHA for each of the 5 distinct action tags (`actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`, `actions/upload-artifact@v7`, `denoland/setup-deno@v2`, plus any action added by `T-006a`) via `gh api` / `git ls-remote`, and replace all 41+ mutable `uses:` references across `.github/workflows/ci.yml`, `fallow.yml`, `lighthouse.yml`, and `release.yml` with `<owner>/<repo>@<40-char-sha> # <tag>`.
2. Compute/verify the upstream SHA-256 checksums for `ripgrep 14.1.1` (`.github/workflows/ci.yml:190`), `gitleaks 8.18.4` (`.github/workflows/ci.yml:250`), and `actionlint v1.7.7` (`.github/workflows/ci.yml:564`), download the tarball to a temp file, and verify with `echo "<sha256>  <file>" | sha256sum -c -` before extracting.
3. Run `actionlint -color` across `.github/workflows/` and confirm every CI workflow job passes on the PR.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] Every `uses:` line across `.github/workflows/*.yml` matches `@[0-9a-f]{40}` with a trailing `# v...` version comment (0 mutable tag pins).
evidence: git grep -cE "uses:.*@[0-9a-f]{40}" -- .github/workflows/ -> ci.yml:35, fallow.yml:2, lighthouse.yml:4, release.yml:3 (44/44 lines SHA-pinned); git grep -nE "uses:.*@v[0-9]" -- .github/workflows/ -> no matches (exit 1)
- [x] All 3 binary downloads in `.github/workflows/ci.yml` (`ripgrep`, `gitleaks`, `actionlint`) verify `sha256sum -c -` before extraction.
evidence: git grep -n sha256sum -- .github/workflows/ci.yml -> 3 "sha256sum -c -" gates (ci.yml:193 ripgrep, ci.yml:256 gitleaks, ci.yml:573 actionlint), each before extraction; values taken from the official release checksum files and the artifacts re-hashed locally: 4/4 MATCH
- [x] `actionlint -color` exits 0 and all CI jobs pass on the PR.
  evidence: `actionlint -color` (1.7.7) in the worktree -> no findings, exit 0; PR #343 CI on head 9b868dd, run 45715121792 -> all 17 checks pass, including `workflow-lint` (actionlint + shellcheck)

## Evidence

Pins resolved 2026-11-25 via `gh api` in this session (never from memory):

- `actions/checkout@v7` -> `3d3c42e5aac5ba805825da76410c181273ba90b1` (lightweight tag)
- `actions/setup-node@v7` -> `949feb2413d6458794dcd2491c4babbbce0c15c1` (lightweight tag)
- `pnpm/action-setup@v6` -> `73e46992e05b19abd31f2f3c20e0e7370d762115` (annotated tag `f53f5227a9e83886ab598c617f3c170fab62f0d3` dereferenced via `git/tags`)
- `actions/upload-artifact@v7` -> `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (lightweight tag)
- `denoland/setup-deno@v2` -> `22d081ff2d3a40755e97629de92e3bcbfa7cf2ed` (no `v2` tag exists; `@v2` resolves to the `v2` branch, whose head equals `tags/v2.0.5`)
- `treosh/lighthouse-ci-action` tag `v12` -> `3e7e23fb74242897f95c0ba9cabad3d0227b9b18` (existing pin verified, trailing comment added)
- `fallow-rs/fallow` tag `v3` now points at `003cc8af2be876b8b8d48cfe2b6b44a36ec95402` (v3.48.0); the existing pin `b6a3e048dc882bdf11c8269c73167223b9e32774` is exactly `tags/v3.43.2` -> comment corrected to `# v3.43.2`, SHA unchanged (no upgrade)

Checksum provenance (each value from the official release file; artifact re-hashed this session, 4/4 MATCH):

- ripgrep 14.1.1 x86_64-unknown-linux-musl: `4cf9f2741e6c465ffdb7c26f38056a59e2a2544b51f7cc128ef28337eeae4d8e` <- release asset `ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz.sha256`
- gitleaks 8.18.4 linux x64: `ba6dbb656933921c775ee5a2d1c13a91046e7952e9d919f9bac4cec61d628e7d` <- release asset `gitleaks_8.18.4_checksums.txt`
- actionlint 1.7.7 linux amd64: `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757` <- release asset `actionlint_1.7.7_checksums.txt`

Local actionlint (not installed on this machine): downloaded the checksum-verified v1.7.7 windows_amd64 zip (`7f12f1801bca3d480d67aaf7774f4c2a6359a3ca8eebe382c95c10c9704aa731` per `actionlint_1.7.7_checksums.txt`) and ran `actionlint -color` in the worktree -> exit 0 both pre-change (baseline) and post-change.

CI acceptance item stays unchecked in the first commit; the real run id and result are recorded with a follow-up commit after the PR checks finish.

## Rollback

Revert the workflow commit via `git revert <commit>`.

## Open questions

- None.
