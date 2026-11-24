---
id: T-012
title: "Make packages/shared real with build, ESLint, cross-platform guard, and deduplication"
priority: P1
status: todo
depends_on:
  - T-003
touches:
  - "packages/shared/**"
  - "apps/mobile/src/i18n.ts"
  - "apps/mobile/src/lib/quiz.ts"
  - "apps/mobile/src/lib/lecture-content.ts"
  - "apps/web/src/lib/quiz.ts"
  - "apps/web/src/hooks/useLectureContent.ts"
owner_action: false
area: shared
estimate: 1d
---

## Context

- [VERIFIED] `packages/shared/package.json:25-26` defines stub `echo` scripts for `"lint"` and `"build"` (`main`/`types`/`exports` point straight to `./src/*.ts` at `:7-20`), and `packages/shared/eslint.config.mjs` does not exist (whereas `apps/web`, `apps/desktop`, and `apps/mobile` each have `eslint.config.mjs`).
- [VERIFIED] `packages/shared/tsconfig.json:11` sets `"noEmit": true` and `packages/shared/package.json:24` runs `tsc --noEmit -p tsconfig.json`.
- [VERIFIED] `packages/shared/src/types/schemas/__tests__/unused-exports-guard.test.ts:54-58` runs `execSync(\`grep -rln --include="*.ts" --include="*.tsx" -E "\\\\b${symbol}\\\\b" apps packages\`)`, which fails on Windows without GNU `grep` in `PATH`.
- [VERIFIED] `packages/shared/src/i18n/index.ts:1-443` already exports `t()`, `messages`, `getNamespaces()`, and `hasKey()`, yet `apps/mobile/src/i18n.ts:27-95,310-388` still duplicates its own `REGISTRY` of 14 namespaces plus `lookup()`/`interpolate()`/`translateMessage()` (ignoring the comment at `apps/mobile/src/i18n.ts:19-22`).
- [VERIFIED] `apps/mobile/src/lib/quiz.ts:76-105` duplicates quiz attempt start/resume (`startAttempt` with direct select-then-insert on `quiz_attempts`) instead of sharing the RPC contract (`start_quiz_attempt`) used in `apps/web/src/lib/quiz.ts:254-265`.
- [VERIFIED] `apps/mobile/src/lib/lecture-content.ts:1-120` explicitly states in `:3-4` that it is a port of the matcher in `apps/web/src/hooks/useLectureContent.ts:112-144` (`resolveLectureKey` + `lecture_id` / trimmed `lecture_key` matching).
- [INFERRED] Consumers (`apps/web`, `apps/mobile`, `apps/desktop` vitest/next/metro) still resolve TypeScript source exports cleanly if `packages/shared` adds a `tsconfig.build.json` emit step (`dist/`) or keeps `exports` compatible with Metro/Next/Vitest — must be verified with `pnpm typecheck && pnpm --filter mobile export`.

## Goal

Turn `packages/shared` into a first-class workspace package with real ESLint config, TypeScript build output/check, a Windows-safe `unused-exports-guard.test.ts`, and shared implementations for mobile i18n `t()`, quiz start, and lecture matching.

## Non-goals

- Do NOT modify `apps/mobile/src/lib/quiz.ts:43-47` answer-key query columns (`T-003` owns that P0 fix and runs first).
- Do NOT break Next.js (`apps/web`) or Metro (`apps/mobile`) workspace resolution of `masarx-shared/*` subpaths.

## Steps

1. Add `packages/shared/eslint.config.mjs` (TS parser + rules consistent with `apps/desktop/eslint.config.mjs`) and wire `packages/shared/package.json` `"lint": "eslint ."`.
2. Add `packages/shared/tsconfig.build.json` (emitting `.js`/`.d.ts` into `dist/` with `noEmit: false`) and wire `"build": "tsc -p tsconfig.build.json"`, verifying `apps/web`, `apps/mobile`, and `packages/shared` vitest/next/metro imports still resolve cleanly.
3. Rewrite `packages/shared/src/types/schemas/__tests__/unused-exports-guard.test.ts:54-61` to walk `.ts`/`.tsx` files in pure Node (`fs.readdirSync` + `RegExp(\`\\b${symbol}\\b\`)`) instead of shelling out to `grep`.
4. Update `apps/mobile/src/i18n.ts:27-95,310-388` to delegate shared-namespace lookup to `masarx-shared/i18n` (`t()` / `messages`) while keeping only `MOBILE_STRINGS` as the mobile supplement.
5. Extract shared lecture-key matching (`resolveLectureKey`, `matchesLecture`, core grouping helper) into `packages/shared` (e.g. `packages/shared/src/lectures/`) and consume it from both `apps/web/src/hooks/useLectureContent.ts` and `apps/mobile/src/lib/lecture-content.ts`.
6. Extract shared quiz-attempt start/resume helper (`start_quiz_attempt` RPC wrapper / shared types) into `packages/shared` and consume from `apps/web/src/lib/quiz.ts` and `apps/mobile/src/lib/quiz.ts`.

## Acceptance criteria

- [ ] `pnpm --filter masarx-shared lint` — exits 0 running real ESLint (not `echo`)
- [ ] `pnpm --filter masarx-shared build` — exits 0 compiling `dist/` without errors
- [ ] `pnpm --filter masarx-shared test` — exits 0 on Windows without requiring GNU `grep`
- [ ] `pnpm --filter mobile test && pnpm --filter web test` — exits 0
- [ ] `pnpm typecheck && pnpm --filter mobile export` — exits 0

## Evidence

## Rollback

Revert `packages/shared` build/lint/shared-module additions and restore prior mobile/web local implementations.

## Open questions

- Should `packages/shared/package.json` `exports` point to `./dist/*.js` (requiring `build` before consumer typecheck/build in CI) or keep `./src/*.ts` exports while validating `dist/` build in CI?
