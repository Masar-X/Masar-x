---
id: T-013
title: "Align all 5 packages to 0.7.0 and add CHANGELOG CI gate"
priority: P1
status: todo
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

- [ ] `node scripts/check-versions.mjs` — exits 0 confirming all 5 `package.json` manifests + `apps/mobile/app.json` are `0.7.0`
- [ ] `rg -n '"0\.5\.6"' apps/web/src/lib/supabase.ts apps/web/src/lib/supabase/client.ts` — returns 0 matches
- [ ] `pnpm typecheck && pnpm lint && pnpm --filter web test` — exits 0

## Evidence

## Rollback

Revert `scripts/check-versions.mjs`, the CI step in `.github/workflows/ci.yml`, `supabase.ts`/`client.ts`, `CHANGELOG.md`, and restore prior per-package `version` fields.

## Open questions

- None
