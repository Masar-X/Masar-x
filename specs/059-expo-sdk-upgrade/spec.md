# Spec 059: Expo SDK 58 upgrade path — mobile React 18.2 → 19.3, React Native 0.74.5 → 0.88.1

> Status: Draft — awaiting owner approval (spec-first, I11; this PR is the approval request). Implementation cards are created only after approval.
> Numbering: derived from disk — `specs/` ends at `058-updates-check-wiring`; next free number = 059.
> Evidence base: all external sources below were fetched on 2026-11-27; all repository facts were read from `main` at `063d654`. No version numbers are quoted from memory.

## 1. Context & problem statement

The mobile app is four Expo SDK generations behind the current release and still on React 18, while the rest of the monorepo runs React 19:

- `apps/mobile/package.json:27,35-36` pins `expo ~51.0.28`, `react 18.2.0`, `react-native 0.74.5`; `apps/web/package.json:46,49-50` pins `next 16.4.6`, `react 19.2.4`, `react-dom 19.2.4`. The cross-app React major skew is the root cause of the workspace's sharpest recurring hazard: the workspace root hoists web's React 19 while mobile pins React 18, and a second React copy in the mobile bundle nulled the hooks dispatcher and killed the release APK on first render (`apps/mobile/metro.config.js` §4 docblock, device crash 2026-09-25, Honor X6c / Android 15). `metro.config.js` currently enforces a single mobile React copy via `extraNodeModules` + a `resolveRequest` override.
- `apps/mobile/package.json:43` declares `@types/react ^19.2.14` against a `react 18.2.0` runtime — the type surface already describes React 19 that the app does not run.
- `expo-av` (`apps/mobile/package.json:28`) is deprecated and has been removed from current Expo SDK distributions (§2, sources [7]/[8]); its only usage in the app is `apps/mobile/src/components/ZaneAvatarRN.tsx:13` (`Video`, `ResizeMode`).
- `.github/workflows/ci.yml:600-607` documents 3 deferred `high` production advisories (`image-size` ×2 build-time, `zod` compiler-plugin, `node-forge` unpatched) and states the intent to raise `deps-audit` from its critical-only gate (`.github/workflows/ci.yml:629`) to `--audit-level=high` "when the deferred set clears (Expo SDK 53 upgrade)". `docs/spec-ledger.md:41` records the same deferral: spec 042's overrides "are interim until the Expo SDK 53 upgrade". Both notes predate this spec and name SDK 53 only as the anticipated upgrade; this spec supersedes them with an evidence-selected target (§2).
- Old SDKs are a shrinking-support surface: the official upgrade walkthrough states Expo Go supports only the latest SDK, and expo services have begun rejecting older SDK versions outright (eas-cli#3669, "sdkVersion 54.0.0 is not supported", April 2026).

**Goal:** an approved, evidence-grounded upgrade path that (a) selects the target Expo SDK from current changelog/registry evidence, (b) lands mobile on the React 19 line matching web's React 19 major, (c) maps every breaking native-plugin and `pnpm.overrides` change, and (d) defines local-device and owner-run EAS preview verification gates plus a `deps-audit` unlock criterion. This card is spec-only: no `apps/mobile/package.json`, lockfile, or source changes happen here.

## 2. Evidence & target selection (fetched 2026-11-27)

| # | Source | Key fact |
|---|---|---|
| [1] | <https://expo.dev/changelog/sdk-58> | "Today we're announcing the release of Expo SDK 58. SDK 58 is built for iOS 27 and includes React Native 0.88." (October 15, 2026) |
| [2] | <https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/> | Latest-SDK install is `expo@^58.0.0`; "We recommend upgrading SDK versions incrementally, one at a time."; Expo Go supports only the latest SDK; CNG projects delete generated `android/`/`ios/` dirs on upgrade |
| [3] | <https://raw.githubusercontent.com/expo/expo/sdk-58/packages/expo/bundledNativeModules.json> | SDK 58 canonical versions: `react 19.3.0`, `react-dom 19.3.0`, `react-native 0.88.1`; full per-package matrix in §3.1; **`expo-av` is absent**; `expo-video ~58.0.14`; `@sentry/react-native ~8.28.1`; `react-native-webview 14.0.1` |
| [4] | <https://raw.githubusercontent.com/expo/expo/sdk-58/packages/expo/package.json> | `expo` sdk-58 manifest: `engines.node ^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0`; devDependencies pin `react 19.3.0`, `react-native 0.88.1`, `@types/react ~19.3.0` |
| [5] | <https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/bundledNativeModules.json> | SDK 57 bundles `react 19.2.3` / `react-native 0.86.2` — i.e. **no current SDK bundles react 19.2.4** |
| [6] | <https://expo.dev/changelog/sdk-55> | "SDK 55 includes React Native 0.83 and React 19.2."; "SDK 54 is the final release to include Legacy Architecture support" — Legacy Architecture is unusable in SDK 55+ and `newArchEnabled` is removed from `app.json`; as of SDK 55 all Expo packages version-align with the SDK major |
| [7] | <https://swmansion.com/blog/the-future-of-video-in-react-native-moving-from-expo-av-to-expo-video-6f4f78e51196> | "Following its previous deprecation, expo-av has now been fully removed" (February 26, 2026) |
| [8] | <https://github.com/expo/expo/issues/37259> | SDK 54-era docs: "The Video and Audio APIs from expo-av have now been deprecated and replaced by improved versions in expo-video and expo-audio" |
| [9] | <https://registry.npmjs.org/-/package/%40react-navigation/native/dist-tags> | `latest` = `7.5.2` (React Navigation v7 is the current major; repo pins v6) |
| [10] | <https://github.com/expo/eas-cli/issues/3669> | "sdkVersion 54.0.0 is not supported" while sending an EAS Update (April 2026) — old SDKs get dropped by Expo services |

**Selection: Expo SDK 58.** It is the latest stable release (announcement [1], install range `^58.0.0` per [2]) and bundles React Native 0.88.1 with React 19.3.0 ([3]), putting mobile on the same React 19 major line as web.

**Documented deviation from the card's literal wording:** the card asks for the SDK "whose React Native version supports React 19 matching apps/web/package.json:49 (19.2.4)". No current SDK bundles react 19.2.4 exactly — SDK 57 bundles 19.2.3 ([5]), SDK 58 bundles 19.3.0 ([3]) — and React Native pins one exact React version per SDK release, so exact-minor cross-app parity is not an achievable requirement. The spec therefore targets **React 19 major parity** (web 19.2.4 ↔ mobile 19.3.0) at the newest stable SDK, and the workspace dual-copy hazard is contained by the metro pin (§3.3), which is the mechanism that actually made cross-app React coexistence safe. Targeting SDK 57 instead would trade a one-minor-closer React pin for a full SDK generation of support runway; not worth it.

## 3. Architecture & design

### 3.1 Target dependency matrix (SDK 58, from [3])

| Package | Current (`apps/mobile/package.json`) | SDK 58 target | Note |
|---|---|---|---|
| `expo` | `~51.0.28` | `^58.0.0` ([2]) | install range per the walkthrough |
| `react` | `18.2.0` | `19.3.0` | RN 0.88's pin; single-copy pin re-pointed (§3.3) |
| `react-native` | `0.74.5` | `0.88.1` | New Architecture only from SDK 55 ([6]) |
| `expo-av` | `~14.0.7` | **removed** → `expo-video ~58.0.14` | absent from [3]; migration in §3.2 |
| `expo-constants` | `~16.0.2` | `~58.0.16` | reads `expoConfig.extra` (app.config.js contract) |
| `expo-dev-client` | `~4.0.29` | `~58.0.22` | dev-build workflow unchanged |
| `expo-localization` | `~15.0.3` | `~58.0.5` | |
| `expo-secure-store` | `~13.0.2` | `~58.0.3` | config plugin stays in `app.json` |
| `expo-status-bar` | `~1.12.1` | `~58.0.5` | |
| `@expo/vector-icons` | `^14.0.0` | `^15.0.2` | |
| `@react-native-async-storage/async-storage` | `1.24.0` | `2.2.0` | major bump |
| `@react-native-community/netinfo` | `11.3.1` | `12.0.1` | |
| `react-native-safe-area-context` | `~4.14.1` | `~5.11.1` | major bump |
| `react-native-screens` | `~3.37.0` | `~4.30.1` | major bump |
| `react-native-webview` | `13.8.6` | `14.0.1` | major bump |
| `@sentry/react-native` | `^6` | `~8.28.1` | two majors; §3.5 |
| `@react-navigation/{native,bottom-tabs,native-stack}` | `^6.x` | v7 (`latest 7.5.2` per [9]) | migrate with the screens ~4.30 pairing; API diff checked against the v7 migration guide at implementation |
| `@types/react` (dev) | `^19.2.14` | `~19.3.0` ([4]) | align with the SDK's React pin |

Node engines: SDK 58 requires `node ^22.13.0 || ^24.3.0 || ^26 || >=27` ([4]); CI runs `node-version: 24` (`.github/workflows/ci.yml:145`), which satisfies it as long as setup-node resolves ≥ 24.3.0 — the implementing card records `node -v` at the prep phase.

### 3.2 expo-av → expo-video (`apps/mobile/src/components/ZaneAvatarRN.tsx`)

The only `expo-av` usage in the repo is the Zane status avatar video ([3] confirms `expo-video ~58.0.14` is the SDK 58 replacement; [7]/[8] confirm removal/deprecation of `expo-av`). The migration replaces `Video`/`ResizeMode` from `expo-av` with the `expo-video` player/`VideoView` API, preserving current playback behavior (source, loop, resize mode, muting) — the component's exact prop set is mapped 1:1 at implementation and verified by the device smoke list (§7). The `expo-av` dependency entry is dropped from `apps/mobile/package.json` in the same commit that lands `expo-video`.

### 3.3 Metro single-React-copy pin (`apps/mobile/metro.config.js`)

The §4 docblock and the `resolveRequest` override exist because the workspace root hoists web's React while mobile must bundle exactly one React copy. After the upgrade the shape is unchanged, the versions move: the pin re-points to mobile's `react 19.3.0` while the root continues to hoist web's `react 19.2.4`. This is the invariant that prevents a repeat of the 2026-09-25 release-APK crash; any refactor that touches `metro.config.js` must keep the `resolveRequest` enforcement and its docblock updated (the docblock's version numbers are updated in the same commit as the upgrade).

### 3.4 Config, plugins, native generation

- `apps/mobile/app.json` declares no `newArchEnabled` today (verified) — nothing to remove when SDK 55 drops the option ([6]); New Architecture becomes mandatory with the SDK 55 hop and must be the default posture for all later hops.
- `apps/mobile/` has no committed `android/` or `ios/` directories (verified) — the app rides Continuous Native Generation, so per [2] each hop regenerates native projects on build; no native-diff hand-merging is in scope.
- `apps/mobile/app.config.js` injects `EXPO_PUBLIC_*` values into `extra` read by `expo-constants`; the contract is preserved by the `expo-constants ~58.0.16` bump and asserted by typecheck + the boot smoke (§7).
- `eas.json` profiles (`development` dev-client, `preview` internal APK, `production` AAB) are untouched by the upgrade; the SDK 58 iOS 27 / UIKit scene-lifecycle changes ([1]) land through prebuild, and this app customizes no `AppDelegate.swift`.
- `@sentry/react-native/expo` stays in the `app.json` plugins; the Sentry Metro wrapper (`withSentryConfig`, `metro.config.js` §5) stays last in the wrapper chain.

### 3.5 `pnpm.overrides` audit & deps-audit unlock (root `package.json:38-61`)

- After the final hop, each override is re-checked with `pnpm why` and dropped only if nothing in the resolved production graph still needs it (spec 042's overrides are interim by design, `docs/spec-ledger.md:41`).
- **`deps-audit` unlock criterion:** the gate at `.github/workflows/ci.yml:629` is raised to `pnpm audit --prod --audit-level=high` in the same PR as the final hop **only if** `pnpm audit --prod --audit-level=high` exits 0 on the upgraded lockfile. If any of the three deferred highs (`image-size` ×2, `zod` compiler-plugin, `node-forge`) still reports, the critical-only gate stays and the implementing PR lists the remaining advisories as follow-ups — the mobile upgrade is a precondition for the raise, not a guarantee that every advisory clears (the CI comment's own wording ties the raise to "when the deferred set clears").

### 3.6 CI

No workflow edits are required for the upgrade itself: the react/react-dom parity guard (`.github/workflows/ci.yml:155-172`) checks within-manifest parity and mobile declares `react` only; the `mobile` job (lint + `expo export --platform android`, `.github/workflows/ci.yml:424-450`) and `mobile test:coverage` (`.github/workflows/ci.yml:392`) run unchanged and are the primary per-hop CI gates.

## 4. Behavior preservation & regression strategy

- **One React copy in the mobile bundle** (§3.3) — the highest-risk regression class, with a recorded production crash. Verified per hop by a clean boot on the regression device plus a bundle check that no second `react` copy resolves from the workspace root.
- **Zane avatar playback** (§3.2) — same source/loop/resize/mute behavior after the `expo-video` migration.
- **Secure storage** — `expo-secure-store` plugin config and key set unchanged; login/persistence smoke per hop.
- **RTL layout** — `supportsRTL: true` (`app.json`) with `react-native-screens` ~4.30.1 and `react-native-safe-area-context` ~5.11.1; layout smoke in both directions.
- **Sentry** — crash reporting still boots without a DSN (`src/lib/sentry.ts` no-op path) and with it on the EAS preview build (Debug ID upload still keyed via `@sentry/react-native/expo` + sentry.gradle).
- **Baseline-first:** every phase starts from a green tree (typecheck, lint, unit, `expo export`).

## 5. Test specification

Existing surface stays green per hop (mirrors CI): `pnpm -r --if-present typecheck`, `pnpm --filter mobile lint`, `pnpm --filter mobile test`, `pnpm --filter mobile export` (`.github/workflows/ci.yml:446-450`), plus `npx expo-doctor` clean after each `npx expo install --fix`.

New verification to be added by the implementing cards (not by this spec): a cheap ratchet that fails if `expo-av` reappears as a direct dependency or import (grep-level, following the repo's existing grep-guard patterns), so the §3.2 migration cannot silently regress.

## 6. Atomic execution plan

Per the official guidance ("one at a time", [2]), each hop is its own commit with CI green before the next; the implementation may be split into several cards along these phases.

| Phase | Scope | Gates (each phase) |
|---|---|---|
| P0 | Baseline: record versions (`node -v`, `pnpm -v`), green typecheck/lint/test/export, baseline device boot on the SDK 51 build | all existing suites green |
| P1 | SDK 51 → 52 (`expo@^52.0.0` + `npx expo install --fix`) | expo-doctor, suites, device boot |
| P2 | SDK 52 → 53 (New Architecture default posture begins; `expo-av` deprecation warnings appear) | as P1 + verify release notes' extra steps |
| P3 | SDK 53 → 54 (`expo-av` still resolvable; plan the `expo-video` migration) | as P1 |
| P4 | SDK 54 → 55 (`expo-av` gone from bundled set → land §3.2 + drop the dep; Legacy Architecture removed; `newArchEnabled` gone) | as P1 + avatar video smoke |
| P5 | SDK 55 → 56 → 57 (two small hops) | as P1 per hop |
| P6 | SDK 57 → 58: final matrix §3.1, `react 19.3.0` + metro pin re-point (§3.3), React Navigation v7, `@sentry/react-native` ~8.28.1, `@types/react ~19.3.0` | as P1 + full §7 verification |
| P7 | Overrides audit + `deps-audit` decision (§3.5), CHANGELOG, docs touch-ups | `pnpm audit --prod --audit-level=high` evidence in the PR |

The exact per-hop React/React Native pins for P1–P5 are read from each release's notes and `bundledNativeModules.json` at execution time (this spec pins only the start state and the SDK 58 end state, both verified above).

## 7. Verification plan (done when)

1. **CI per hop:** typecheck/lint/unit/export green; parity guard and spec-prefix guard green.
2. **Local device run (per implementation card, final state at minimum):** Android physical device (the metro.config.js §4 regression device class, Android 15), dev-client build from `pnpm --filter mobile android` or an EAS development build; smoke: boot without crash, login, subject list renders, Zane avatar video plays, secure-store state survives restart, RTL renders, Sentry event arrives.
3. **Owner-run EAS preview build:** `eas build --profile preview --platform android` (per `apps/mobile/eas.json` — internal-distribution APK, `preview` environment), installed on the same device, same smoke list, Sentry Debug ID verified on the uploaded artifact. EAS builds are owner-triggered; agent cards stop at the CI gates.
4. **deps-audit decision recorded** (§3.5) with the actual `pnpm audit --prod` output in the final implementation PR.

## 8. Non-goals

- No EAS builds triggered by any agent card (owner-only, per repo hard limits).
- No changes to web/desktop dependencies; no `apps/web` React version movement (web stays `19.2.4` exact).
- No Expo Router adoption, no Hermes v1 opt-in, no Expo Go support work (the app uses dev builds; Expo Go's latest-only policy does not gate this upgrade).
- No new mobile features; this path only preserves current behavior on the upgraded stack.

## 9. Rollback

Per-phase: `git revert` of the phase commit restores the previous lockfile and manifests (CNG means no committed native dirs to unwind). The approved spec lives in git history; if the path is abandoned before approval, `specs/059-expo-sdk-upgrade/` moves to `.trash/` per I9. After the final hop, rollback = revert of the P6/P7 commits and re-run of the §7 gates on the restored tree.
