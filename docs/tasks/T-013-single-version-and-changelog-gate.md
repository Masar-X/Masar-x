---
id: T-013
title: "Enforce single version source across 5 packages and CHANGELOG CI gate"
priority: P1
status: todo
depends_on:
  - T-007
touches:
  - "package.json"
  - "apps/web/package.json"
  - "apps/desktop/package.json"
  - "apps/mobile/package.json"
  - "packages/shared/package.json"
  - "apps/mobile/app.json"
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
- [VERIFIED] `apps/web/src/lib/supabase.ts:28` and `apps/web/src/lib/supabase/client.ts:19` also hardcode `"0.5.6"` as the fallback for `NEXT_PUBLIC_APP_VERSION`.
- [VERIFIED] `CHANGELOG.md:9-32` has `## [Unreleased]` at line 9 followed by `## [0.6.0] - 2026-09-23` at line 32; `0.6.1` and `0.7.0` have no section headers in `CHANGELOG.md`.
- [VERIFIED] `.github/workflows/ci.yml` has a `react/react-dom` version parity check at lines `136-153` inside `workspaces`, but no check for package version alignment or `CHANGELOG.md` entries. `.github/workflows/release.yml:31` requires `apps/desktop/package.json` version to match the `v*` release tag.
- [INFERRED] Selecting the canonical unified version (`0.7.0` vs `0.6.1`) affects desktop auto-updater (`latest.yml`) and mobile store `expo.version`, so owner confirmation on the target version number is needed before bumping.

## Goal

Establish a single canonical version across all 5 `package.json` files (plus `apps/mobile/app.json`) and add a CI check in `.github/workflows/ci.yml` verifying version parity and that `CHANGELOG.md` stays updated on version bumps or non-trivial PRs.

## Non-goals

- Do NOT cut a git tag or publish a GitHub Release.
- Do NOT pin CI actions by SHA here (`T-007` owns workflow SHA pinning and runs first via `depends_on: [T-007]`).

## Steps

1. Confirm target unified version with the owner (e.g., `0.7.0` so no workspace version regresses, or `0.6.1` if mobile `0.7.0` was premature).
2. Align `version` in `package.json:4`, `apps/web/package.json:4`, `apps/desktop/package.json:3`, `apps/mobile/package.json:3`, `packages/shared/package.json:3`, and `apps/mobile/app.json:5` (and update fallback strings in `apps/web/src/lib/supabase.ts:28` & `client.ts:19` or read from `package.json`/env).
3. Update `CHANGELOG.md` so the current released/unreleased headings reflect the unified version history cleanly (adding `0.6.1` / aligned version notes).
4. Add `scripts/check-versions.mjs` (verifies all 5 `package.json` files + `apps/mobile/app.json` share the exact same `version`, and verifies `CHANGELOG.md` contains a heading for that version or `## [Unreleased]` with entries) and wire it into `.github/workflows/ci.yml` (`workspaces` or `docs-lint` job).
5. Run `node scripts/check-versions.mjs` and `actionlint` (if available) / `pnpm typecheck`.

## Acceptance criteria

- [ ] `node scripts/check-versions.mjs` — exits 0 confirming all 5 `package.json` manifests and `apps/mobile/app.json` have identical `version` and `CHANGELOG.md` is valid
- [ ] `pnpm typecheck && pnpm lint` — exits 0

## Evidence

## Rollback

Revert `scripts/check-versions.mjs`, the CI step in `.github/workflows/ci.yml`, and restore prior per-package `version` fields.

## Open questions

- Which unified version should all 5 packages align to (`0.7.0` to avoid downgrading `apps/mobile`, or `0.6.1` to match the latest desktop installer)?
- Should the `CHANGELOG.md` CI gate require a `CHANGELOG.md` diff on `feat:`/`fix:` PRs, or only enforce that the current `package.json` version exists in `CHANGELOG.md` (or under `## [Unreleased]`)?
