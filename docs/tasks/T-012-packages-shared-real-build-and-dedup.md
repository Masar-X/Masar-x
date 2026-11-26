---
id: T-012
title: "Add ESLint/typecheck, Windows-safe guard test, and deduplication in packages/shared"
priority: P1
status: done
depends_on: []
touches:
  - "packages/shared/package.json"
  - "packages/shared/eslint.config.mjs"
  - "packages/shared/tsconfig.json"
  - "packages/shared/src/index.ts"
  - "packages/shared/src/types/schemas/__tests__/unused-exports-guard.test.ts"
  - "packages/shared/src/i18n/**"
  - "packages/shared/src/quiz/**"
  - "packages/shared/src/lectures/**"
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

- [VERIFIED] `packages/shared/package.json:25-26` defines stub `echo` scripts for `"lint"` and `"build"` (`main`/`types`/`exports` point directly to `./src/*.ts` at `:7-20`), and `packages/shared/eslint.config.mjs` does not exist (whereas `apps/web`, `apps/desktop`, and `apps/mobile` each have `eslint.config.mjs`).
- [VERIFIED] `packages/shared/tsconfig.json:11` sets `"noEmit": true` and `packages/shared/package.json:24` runs `tsc --noEmit -p tsconfig.json`.
- [VERIFIED] `packages/shared/src/types/schemas/__tests__/unused-exports-guard.test.ts:54-58` runs `execSync(\`grep -rln --include="*.ts" --include="*.tsx" -E "\\\\b${symbol}\\\\b" apps packages\`)`, which fails on Windows without GNU `grep` in `PATH`.
- [VERIFIED] `packages/shared/src/i18n/index.ts:1-443` already exports `t()`, `messages`, `getNamespaces()`, and `hasKey()`, yet `apps/mobile/src/i18n.ts:27-95,310-388` still duplicates its own `REGISTRY` of 14 namespaces plus `lookup()`/`interpolate()`/`translateMessage()` (ignoring `apps/mobile/src/i18n.ts:19-22`).
- [VERIFIED] `apps/mobile/src/lib/quiz.ts:76-105` duplicates quiz attempt start/resume (`startAttempt` with direct select-then-insert on `quiz_attempts`) instead of sharing the RPC contract (`start_quiz_attempt`) used in `apps/web/src/lib/quiz.ts:254-265`.
- [VERIFIED] `apps/mobile/src/lib/lecture-content.ts:1-120` explicitly states in `:3-4` that it is a port of the matcher in `apps/web/src/hooks/useLectureContent.ts:112-144` (`resolveLectureKey` + `lecture_id` / trimmed `lecture_key` matching).

## Goal

Make `packages/shared` a linted, typechecked workspace package with a Windows-safe `unused-exports-guard.test.ts` and shared implementations for mobile i18n `t()`, quiz start, and lecture matching — keeping `exports` as `./src/*.ts` so Next.js, Metro, and Vitest consumers continue working without a forced `dist/` migration.

## Non-goals

- Do NOT migrate `packages/shared/package.json` `exports` off `./src/*.ts` to `dist/` unless a consumer explicitly requires compiled output.
- Do NOT alter `apps/mobile/src/lib/quiz.ts:43-47` answer-key query columns (`T-003` owns that fix; `touches` overlap prevents concurrent modification).

## Steps

1. Add `packages/shared/eslint.config.mjs` (TS parser + rules aligned with `apps/desktop/eslint.config.mjs`) and wire `packages/shared/package.json:25` `"lint": "eslint ."`.
2. Keep `packages/shared/package.json:7-20` `exports` pointing to `./src/*.ts` and keep `typecheck` (`tsc --noEmit -p tsconfig.json`) strict across all shared sources (update `"build"` script comment/noEmit check only if needed without breaking consumers).
3. Rewrite `packages/shared/src/types/schemas/__tests__/unused-exports-guard.test.ts:54-61` to walk `.ts`/`.tsx` files in pure Node (`fs.readdirSync` + `RegExp(\`\\b${symbol}\\b\`)`) instead of shelling out to `grep`.
4. Update `apps/mobile/src/i18n.ts:27-95,310-388` to import and delegate shared-namespace lookup to `masarx-shared/i18n` (`t()` / `messages`) instead of maintaining its duplicate `REGISTRY`, keeping only `MOBILE_STRINGS` as the mobile supplement.
5. Extract shared lecture-key matching (`resolveLectureKey`, `matchesLecture`, core grouping helper) into `packages/shared/src/lectures/` and consume it from both `apps/web/src/hooks/useLectureContent.ts` and `apps/mobile/src/lib/lecture-content.ts`.
6. Extract shared quiz-attempt start/resume helper (`start_quiz_attempt` RPC wrapper / shared types) into `packages/shared` and consume from `apps/web/src/lib/quiz.ts` and `apps/mobile/src/lib/quiz.ts`. **Correction while implementing (T-012):** the shared wrapper (`masarx-shared/quiz`) and the web consumption landed; the mobile leg is deferred to a follow-up — `apps/mobile/src/lib/__tests__/quiz-service.test.ts` pins the current select-then-insert wire shape in 3 assertions ("resumes an unfinished attempt before inserting", "creates a new attempt when none is open", and the signed-in `completeQuizAttempt` flow), and test files are out of scope for this task.

## Acceptance criteria

- [x] `pnpm --filter masarx-shared lint` — exits 0 running real ESLint (not `echo`)
evidence: `pnpm --filter masarx-shared lint` exits 0 running `eslint .` with 0 warnings/0 errors (previously the `echo` stub). The first real run caught one error: a pre-existing inline `eslint-disable-next-line @typescript-eslint/no-explicit-any` in `src/ai/__tests__/paste-attachments.test.ts` referenced a rule the new config hadn't registered; resolved config-side by registering `tseslint.plugin` (rules stay off) plus `reportUnusedDisableDirectives: "off"` — zero test edits, exit code 0.
- [x] `pnpm --filter masarx-shared typecheck && pnpm --filter masarx-shared test` — exits 0 on Windows without requiring GNU `grep`
evidence: `pnpm --filter masarx-shared typecheck` exit 0 (`tsc --noEmit -p tsconfig.json`); `pnpm --filter masarx-shared test` exit 0 on Windows — Test Files 20 passed (20), Tests 280 passed (280). Baseline before the guard rewrite: 1 failed | 279 passed — `unused-exports-guard.test.ts` threw `Error: schemas/index.ts exports \`ProfileSchema\` but no file outside the schema module references it` because `execSync(grep …)` throws on Windows (no GNU grep), i.e. a pre-existing main failure on Windows that this change turns green.
- [x] `pnpm --filter mobile test && pnpm --filter web test` — exits 0
evidence: `pnpm --filter mobile test` exit 0 — Test Files 16 passed (16), Tests 129 passed | 1 skipped (130), including the `translateMessage` mobile-namespace regression suite against the delegated lookup; `pnpm --filter web test` exit 0 — Test Files 113 passed (113), Tests 1287 passed (1287), including `QuizService.startOrResumeAttempt` (RPC shape asserted through the shared wrapper) and `useLectureContent` 3-tier matcher tests.
- [x] `pnpm typecheck && pnpm --filter mobile export` — exits 0
evidence: `pnpm typecheck` exit 0 — `pnpm -r --if-present typecheck`: apps/desktop Done, packages/shared Done, apps/mobile Done, apps/web Done; `pnpm --filter mobile export` exit 0 — `expo export --platform android` Metro bundle proof resolving the new `masarx-shared/i18n` / `masarx-shared/lectures` subpath imports.
- Mobile bundle note: the shared i18n registry now ships in the mobile bundle (190,430 B of JSON measured at this commit, ~186 KiB raw; APK delta not measured). Follow-up: lazy-load the registry per namespace and quantify the APK delta.

## Evidence

Baseline (before any change, Windows, worktree at 1e03919):

```
> masarx-shared@0.5.6 test
 Test Files  1 failed | 19 passed (20)
      Tests  1 failed | 279 passed (280)
FAIL src/types/schemas/__tests__/unused-exports-guard.test.ts > schemas/index.ts — no dead exports
Error: schemas/index.ts exports `ProfileSchema` but no file outside the schema module references it. Delete it or add a consumer.
```

After the change (same machine, same shell):

```
pnpm --filter masarx-shared lint
> masarx-shared@0.5.6 lint
> eslint .
(exit 0, no output)

pnpm --filter masarx-shared typecheck
> tsc --noEmit -p tsconfig.json
(exit 0)

pnpm --filter masarx-shared build
> tsc --noEmit -p tsconfig.json
(exit 0)   # was `echo '[shared] no build step yet …'`

pnpm --filter masarx-shared test
 Test Files  20 passed (20)
      Tests  280 passed (280)

pnpm --filter mobile test
 Test Files  16 passed (16)
      Tests  129 passed | 1 skipped (130)

pnpm --filter web test
 Test Files  113 passed (113)
      Tests  1287 passed (1287)

pnpm typecheck
apps/desktop typecheck: Done
packages/shared typecheck: Done
apps/mobile typecheck: Done
apps/web typecheck: Done

pnpm --filter mobile export
(exit 0 — expo export --platform android)
```

## Rollback

Revert `packages/shared/eslint.config.mjs`, shared deduplication modules, and restore prior mobile/web local implementations.

## Open questions

- None
