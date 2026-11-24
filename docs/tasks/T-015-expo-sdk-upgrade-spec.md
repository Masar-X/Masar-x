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
- [VERIFIED] `apps/mobile/package.json:43` already has `"@types/react": "^19.2.14"` in `devDependencies` (type/runtime skew against `react: 18.2.0`), and `.github/workflows/ci.yml:136-153` checks `react`/`react-dom` parity per manifest but not cross-app React major skew.
- [VERIFIED] `AGENTS.md:67` (`042-deps-and-wire-or-delete`) and `.github/workflows/ci.yml:577-579` note that 3 deferred `high` production advisories (`image-size` x2, `zod` compiler-plugin, `node-forge`) wait on the Expo SDK upgrade before `deps-audit` can raise `--audit-level=high`.
- [INFERRED] Selecting the target Expo SDK requires checking the current Expo SDK changelog/release matrix to verify which SDK ships a React Native version supporting React 19 (matching `apps/web/package.json:49` `19.2.4`) and what breaking native plugin changes apply.

## Goal

Produce an approved SpecKit specification (spec-only, zero code/dependency edits) that selects the target Expo SDK from current Expo changelog evidence, requires React Native + React 19 parity with web, maps breaking native plugin / `pnpm.overrides` changes, and defines both local device and owner-run EAS preview verification gates.

## Non-goals

- Do NOT modify `apps/mobile/package.json`, `pnpm-lock.yaml`, or any mobile `.ts`/`.tsx` source file in this card.
- Do NOT trigger EAS builds or upgrade Expo SDK during this card.

## Steps

1. Derive the next available spec number from `specs/` on disk (currently highest is `058-updates-check-wiring`) per `docs/agents/references/10-spec-first.md`.
2. Inspect the current Expo SDK changelog/release notes (with citations/URLs in the spec — no guesswork) to select the exact target Expo SDK whose React Native version supports React 19 matching `apps/web/package.json:49` (`19.2.4`).
3. Audit every native Expo/RN dependency in `apps/mobile/package.json:19-40` (`expo-av`, `expo-constants`, `expo-dev-client`, `expo-localization`, `expo-secure-store`, `react-native-safe-area-context`, `react-native-screens`, `react-native-webview`, `@sentry/react-native`) and `package.json:31-55` overrides against that SDK's upgrade guide (`expo-av` migration if deprecated, New Architecture/Hermes requirements).
4. Write `specs/<NNN>-expo-sdk-upgrade/spec.md` with phased migration tasks, CI `deps-audit --audit-level=high` unlock criteria, verification plan (local device run + owner-triggered EAS preview build), and rollback plan.
5. Submit PR for owner spec approval (I11) before creating implementation card(s).

## Acceptance criteria

- [ ] `ls specs/*-expo-sdk-upgrade/spec.md` — spec file exists with next sequential number, cited Expo changelog evidence for React 19 support, and local device + EAS preview verification plan
- [ ] `git diff --name-only origin/main -- apps/ package.json pnpm-lock.yaml` — returns empty
- [ ] `pnpm tasks:lint` — exits 0

## Evidence

## Rollback

Move `specs/<NNN>-expo-sdk-upgrade/` to `.trash/` per I9.

## Open questions

- None (target SDK and React 19 compatibility must be resolved from current Expo changelog evidence inside the spec itself).
