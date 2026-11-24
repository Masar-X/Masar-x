---
id: T-015
title: "Author spec for Expo SDK 51 / React 18 upgrade path (spec-only)"
priority: P2
status: todo
depends_on: []
touches:
  - "specs/*-expo-sdk-upgrade/spec.md"
owner_action: false
area: mobile
estimate: 0.5d
---

## Context

- [VERIFIED] `apps/mobile/package.json:27,35-36` pins `"expo": "~51.0.28"`, `"react": "18.2.0"`, and `"react-native": "0.74.5"`, whereas `apps/web/package.json:46,49-50` runs `"next": "16.4.6"`, `"react": "19.2.4"`, and `"react-dom": "19.2.4"`.
- [VERIFIED] `apps/mobile/package.json:43` already has `"@types/react": "^19.2.14"` in `devDependencies` (hoisted/shared mismatch with runtime `react: 18.2.0`), and `.github/workflows/ci.yml:136-153` checks `react`/`react-dom` parity per manifest but does not check cross-app React major skew.
- [VERIFIED] `AGENTS.md:67` (`042-deps-and-wire-or-delete`) and `.github/workflows/ci.yml:577-579` note that 3 deferred `high` production advisories (`image-size` x2, `zod` compiler-plugin, `node-forge`) wait on the Expo SDK upgrade before `deps-audit` can raise `--audit-level=high`.
- [INFERRED] Upgrading Expo SDK 51 → SDK 53+ (React 18 → React 19 / RN 0.79+) impacts `expo-av`, `expo-secure-store`, `expo-constants`, `@sentry/react-native`, `react-native-webview`, Metro config, and pnpm overrides (`package.json:31-55`), so I11 requires an approved spec before code changes.

## Goal

Produce an approved SpecKit specification (spec-only, zero code/dependency edits) mapping the target Expo SDK (53/54) + React 19 upgrade path, breaking native plugin changes, `pnpm.overrides` cleanup, and testing/EAS verification gates.

## Non-goals

- Do NOT modify `apps/mobile/package.json`, `pnpm-lock.yaml`, or any mobile `.ts`/`.tsx` source file in this card.
- Do NOT trigger EAS builds or upgrade Expo SDK during this card.

## Steps

1. Derive the next available spec number from `specs/` on disk (currently highest is `058-updates-check-wiring`, so next is `059` unless another spec lands first) per `docs/agents/references/10-spec-first.md`.
2. Audit every native Expo/RN dependency in `apps/mobile/package.json:19-40` (`expo-av`, `expo-constants`, `expo-dev-client`, `expo-localization`, `expo-secure-store`, `react-native-safe-area-context`, `react-native-screens`, `react-native-webview`, `@sentry/react-native`) against the target Expo SDK compatibility matrix and `package.json:31-55` overrides.
3. Write `specs/<NNN>-expo-sdk-upgrade/spec.md` with phased migration plan, `expo-av` → `expo-video`/`expo-audio` deprecation notes if targeting SDK 53/54, CI `deps-audit` `--audit-level=high` unlock criteria, and rollback strategy.
4. Submit PR for owner spec approval (I11) before creating implementation card(s).

## Acceptance criteria

- [ ] `ls specs/*-expo-sdk-upgrade/spec.md` — spec file exists with next sequential number and zero changes to `apps/mobile/` or `pnpm-lock.yaml`
- [ ] `git diff --name-only origin/main -- apps/ package.json pnpm-lock.yaml` — returns empty
- [ ] `pnpm tasks:lint` — exits 0

## Evidence

## Rollback

Move `specs/<NNN>-expo-sdk-upgrade/` to `.trash/` per I9.

## Open questions

- Target Expo SDK 53 (React 19.0 / RN 0.79) or Expo SDK 54+, and will physical Android/iOS device smoke testing be run locally or via EAS preview builds?
