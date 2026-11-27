---
id: T-021
title: "Slim the RSC i18n payload: chrome-subset of namespaces to NextIntlClientProvider"
priority: P2
status: todo
depends_on: ["T-020"]
touches:
  - "apps/web/src/i18n/request.ts"
  - "apps/web/src/app/[locale]/layout.tsx"
  - "docs/tasks/T-021-i18n-namespace-subsets.md"
owner_action: false
area: web
estimate: 1d
---

## Context

- Observed: `i18n/request.ts:218-229` deliberately loads ALL namespaces ("LOAD ALL NAMESPACES … to prevent stale provider issues during SPA navigation") and the single `NextIntlClientProvider` (`[locale]/layout.tsx:122-126`) serializes the full message catalog (~50 files/locale, ~180 KB ar / 145 KB en raw per audit) into the RSC payload on every route — audit [04 SPLIT-5](../perf/audit-2026-11-02/findings/04-splitting-streaming.md).
- Umbrella: #288 (WS1 item 4, second half). Deferred from T-020 (spec 060 §2.5): no subset/pick prior art exists in the repo and the blast radius is every `useTranslations("ns")` reachable from client chrome — a missed namespace throws missing-message hydration errors on real routes, which needs its own dependency pass rather than riding along a 4-item wave.

## Goal

Serialize only the namespaces client components consume at/under the layout (nav chrome, header/sidenav, common, auth surfaces, …) into `NextIntlClientProvider`, while server components keep full-catalog `getTranslations` access; re-validate (or retire with evidence) the SPA-navigation stale-provider rationale that forced the load-all behavior.

## Non-goals

- Changing server-side i18n resolution (`getMessages` for server components stays full).
- Touching the `faculty` namespace contract (spec 052/055) beyond what the subset includes.
- Any WS2/WS5 items.

## Steps

1. Enumerate every `useTranslations("<ns>")` reachable from client components (grep + component tree from the layout down), including lazy/dynamic-mounted ones (T-020's dynamic admin tabs and MobileNav must resolve their namespaces after mount — pick the subset BEFORE code-split consumers load).
2. Design the subset source of truth (explicit allowlist vs derived), re-read the SPA-navigation rationale in `request.ts:218-229` and decide with evidence whether per-route subsets or a chrome-subset is safe under client-side navigation.
3. Implement, then verify against real routes: ar+en × the heaviest routes (home, /quizzes, /admin-dashboard, /ai-assistant) with hydration-error watch + e2e green.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `NextIntlClientProvider messages` serializes a verified chrome-subset; no missing-message errors on ar+en across the routed surface (e2e + manual hydration watch).
- [ ] RSC payload i18n share measured before/after (documented numbers, not estimates).
- [ ] Full gates green: web vitest, tsc, lint, tasks gates, CI e2e.

## Evidence

<!-- Leave empty until the finishing PR; paste exact commands and outputs for each checked item above. -->

## Rollback

Revert restores the load-all behavior in `request.ts` + full `messages` prop; no data involved.

## Open questions

- Is the `request.ts` load-all rationale (SPA-navigation stale-provider prevention) still binding, or can a per-route/chrome subset retire it with evidence? — decided during execution (step 2).
- Explicit namespace allowlist vs derived-from-dependency-graph subset — decided during execution (step 1).
