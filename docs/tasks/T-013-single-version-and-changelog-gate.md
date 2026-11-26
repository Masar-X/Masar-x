---
id: T-013
title: "Align all 5 packages to 0.7.0 and add CHANGELOG CI gate"
priority: P1
status: done
depends_on: []
touches:
  - "package.json"
  - "apps/web/package.json"
  - "apps/desktop/package.json"
  - "apps/mobile/package.json"
  - "packages/shared/package.json"
  - "apps/mobile/app.json"
  - "apps/web/src/lib/supabase.ts"
  - "apps/web/src/lib/supabase/client.ts"
  - "CHANGELOG.md"
  - ".github/workflows/ci.yml"
  - "scripts/check-versions.mjs"
owner_action: false
area: ci
estimate: 0.5d
---

## Context

- [VERIFIED] The 5 workspace manifests currently hold 4 different versions:
  - `package.json:4` (`masarx-monorepo`): `0.6.0`
  - `apps/web/package.json:4` (`web`): `0.5.6`
  - `apps/desktop/package.json:3` (`desktop`): `0.6.1`
  - `apps/mobile/package.json:3` (`mobile`): `0.7.0` (mirrored in `apps/mobile/app.json:5`: `"version": "0.7.0"`)
  - `packages/shared/package.json:3` (`masarx-shared`): `0.5.6`
- [VERIFIED] `apps/web/src/lib/supabase.ts:28` and `apps/web/src/lib/supabase/client.ts:19` hardcode `"0.5.6"` as the fallback for `NEXT_PUBLIC_APP_VERSION`.
- [VERIFIED] `CHANGELOG.md:9-32` has `## [Unreleased]` at line 9 followed by `## [0.6.0] - 2026-09-23` at line 32; `0.6.1` and `0.7.0` have no section headers.
- [VERIFIED] `.github/workflows/ci.yml:136-153` checks `react`/`react-dom` parity inside `workspaces`, but has no package version parity or `CHANGELOG.md` gate. `.github/workflows/release.yml:31` requires `apps/desktop/package.json` version to match the `v*` release tag.

## Goal

Align all 5 `package.json` manifests (plus `apps/mobile/app.json`) to canonical version `0.7.0` (never downgrading a published version), remove hardcoded `"0.5.6"` fallbacks in `apps/web/src/lib/supabase*.ts` by reading `package.json`, and add a CI gate requiring a `CHANGELOG.md` `[Unreleased]` entry for `feat:`/`fix:` PRs touching `apps/` or `packages/` (with a `skip-changelog` label escape hatch).

## Non-goals

- Do NOT cut a git tag or publish a GitHub Release.
- Do NOT pin CI actions by SHA here (`T-007` owns SHA pinning; `touches` serializes `.github/workflows/ci.yml`).

## Steps

1. Set `"version": "0.7.0"` in `package.json:4`, `apps/web/package.json:4`, `apps/desktop/package.json:3`, `apps/mobile/package.json:3`, `packages/shared/package.json:3`, and `apps/mobile/app.json:5`.
2. Replace hardcoded `"0.5.6"` fallbacks in `apps/web/src/lib/supabase.ts:28` and `apps/web/src/lib/supabase/client.ts:19` by reading `version` from `apps/web/package.json` (or build-time `NEXT_PUBLIC_APP_VERSION` derived from `package.json` in `next.config.mjs`).
3. Update `CHANGELOG.md` so `## [0.6.1]` / `## [0.7.0]` history and `## [Unreleased]` are accurate and valid per `docs-lint`.
4. Add `scripts/check-versions.mjs` verifying (a) all 5 `package.json` files + `apps/mobile/app.json` share the exact same `version`, and (b) on PRs whose title/commits indicate `feat:`/`fix:` and whose diff touches `apps/` or `packages/`, `CHANGELOG.md` includes an updated entry under `## [Unreleased]` unless the PR has label `skip-changelog`.
5. Wire `scripts/check-versions.mjs` into `.github/workflows/ci.yml` (`workspaces` or `docs-lint` job) and verify locally.

## Acceptance criteria

- [x] `node scripts/check-versions.mjs` — exits 0 confirming all 5 `package.json` manifests + `apps/mobile/app.json` are `0.7.0`
  evidence: exit 0 with `versions aligned: package.json=0.7.0, apps/web/package.json=0.7.0, apps/desktop/package.json=0.7.0, apps/mobile/package.json=0.7.0, packages/shared/package.json=0.7.0, apps/mobile/app.json=0.7.0`; negative probe with apps/desktop/package.json temporarily set to 0.6.9 exits 1 (`::error::version mismatch — package.json is 0.7.0, but: apps/desktop/package.json: 0.6.9`)
- [x] `rg -n '"0\.5\.6"' apps/web/src/lib/supabase.ts apps/web/src/lib/supabase/client.ts` — returns 0 matches
  evidence: rg prints no lines and exits 1 (no matches); both fallbacks now read `pkg.version` from `apps/web/package.json` (`apps/web/src/lib/supabase.ts:28`, `apps/web/src/lib/supabase/client.ts:19`)
- [x] `pnpm typecheck && pnpm lint && pnpm --filter web test` — exits 0
  evidence: TYPECHECK_EXIT=0, LINT_EXIT=0, TEST_EXIT=0 — vitest 113 files / 1287 tests passed in 39.15s

## Evidence

- `pnpm install` in the worktree after the version bumps: `Done in 29.2s`; `git status --short pnpm-lock.yaml` prints nothing (no lockfile delta — cross-package deps are `workspace:*`), so CI's `pnpm install --frozen-lockfile` stays consistent.
- Gate-logic self-test on `scripts/check-versions.mjs` (`prRequiresChangelog` / `changelogHasUnreleasedEntry`): 11/11 PASS — feat/fix triggers including scoped (`feat(web):`) and breaking (`feat!:`) forms, `skip-changelog` escape hatch, `apps/`/`packages/` scoping, commit-subject trigger when the title is neutral, and empty vs populated `## [Unreleased]` detection.
- `npx -y markdownlint-cli2 CHANGELOG.md` → `Summary: 0 issues in 0 files`.
- `bash .github/scripts/check-doc-links.sh` → `All internal Markdown links resolve.`
- `node --test scripts/tasks.test.mjs` → 27 pass / 0 fail.
- actionlint is not installed locally; the workflow YAML is validated by the CI `workflow-lint` job on this PR.
- No `uses:` lines were added or moved in `.github/workflows/ci.yml` — the T-007 SHA pins are untouched; the new step only adds `env:`/`run:`.

## Rollback

Revert `scripts/check-versions.mjs`, the CI step in `.github/workflows/ci.yml`, `supabase.ts`/`client.ts`, `CHANGELOG.md`, and restore prior per-package `version` fields.

## Open questions

- None
