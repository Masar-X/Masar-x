<!--
  Masar X — Automation testing standard (created 2026-11-22)
  Tiered test policy, per-PR gate, writing conventions, coverage matrix and
  the gap-closure roadmap for the whole monorepo (web / desktop / mobile /
  shared / edge / SQL), plus the browser-use vs computer-use tool verdict.
  12-e2e-testing.md remains the Playwright run contract.
-->

# Automation testing (standard + checklist)

> **When to read this file:** any task that plans, adds, or audits automated
> tests anywhere in the monorepo; any "tests for everything" campaign; any
> decision about which GUI-automation tool to use for a verification task.
> The Playwright run contract itself (commands, env vars, seeded-cookie auth)
> lives in [12-e2e-testing.md](./12-e2e-testing.md); the pre-merge checklist
> lives in [08-precommit.md](./08-precommit.md).

Counts and the matrix below are the **2026-11-22 snapshot of `main`
(`5f33dad`)** — refresh on merge campaigns ([§6](#6-maintenance)).

## 1. Test tiers and the tool verdict

| Tier | Tool | Runs in CI | Use it for |
| --- | --- | --- | --- |
| T1 unit/integration | Vitest 5.1.0 ×4 workspaces (`node` + `jsdom` projects in web) | yes — `ci.yml` `test` job | hooks, lib, server utils, pure logic. The default for any logic change. |
| T1 e2e | Playwright chromium, `apps/web/e2e/` | yes — `ci.yml` `e2e` job | user-visible flows, incl. desktop-shell simulation via the `window.masarxDesktop` stub (spec 045). |
| T1 edge | Deno test, `supabase/functions/_shared/tests/` | yes — `deno-check` job | handler + helper logic, offline via the import-map stubs. |
| T1 SQL | `supabase/tests/rpc-verify.sql` (53 assertions) + `rls-verify.sql` | **not yet** (roadmap P2) | migrations, RPC/trigger/RLS changes — run against disposable portable PG 17 per `supabase/tests/README.md`. |
| T2 agent GUI verification | **browser-use** (`control-browser` driver + `web-gui-tester` methodology) | never | pre-PR visual/interaction verification, exploratory testing, bug reproduction, RTL + dark/light matrix checks. **The chosen tool for anything inside a web page.** |
| T3 OS-level only | **computer-use** | never | NSIS installer wizard (spec 053 precedent), icon cache / file-association / uninstall checks — only where CDP/Playwright cannot reach. |

**The verdict.** browser-use is the primary GUI-automation tool; computer-use
is reserved for the OS layer. Grounding:

- browser-use's own contract states: *prefer it over Computer Use for
  anything that stays inside a web page.* It drives a real browser with
  accessibility-tree snapshots, Playwright locators, and screenshots —
  deterministic, re-observable, and safe on background tabs.
  `web-gui-tester` layers the black-box methodology on top: P0–P3 test plan,
  action → observation loop, DOM + screenshot cross-validation, evidence
  screenshots per test point, structured final report.
- computer-use operates native apps and the OS. It must not drive web pages
  (its own contract), must never run in CI, and is main-agent only. On this
  project's stack it is the *only* path for the NSIS installer wizard —
  Playwright cannot drive the desktop gate and the shell must be CUA-driven
  (spec 053 trap: assisted NSIS ignores `/S`). Electron renderer content is
  a11y-blind to it (specs 045/053 traps) — for the desktop **renderer** use
  CDP (`sandbox/masarx-verify-desktop.cjs` pattern with
  `--remote-debugging-port`) or Playwright, never computer-use coordinates.
- **Neither tier replaces T1.** Agent-driven GUI checks are owner-facing
  evidence, not CI gates: screenshot evidence goes into the PR description,
  and a green agent session never substitutes for a green suite.

## 2. Per-PR gate (what must pass before merge)

| The PR touches | Must pass |
| --- | --- |
| web hooks / lib / server utils | targeted vitest + tsc + lint; full web vitest when shared code moved |
| web UI (components / pages) | web vitest (`jsdom` project) + e2e for touched flows + both locales (ar/en) |
| `apps/web/e2e/**` (helpers, config) | full e2e suite locally |
| `packages/shared/**` | shared vitest + web vitest + mobile vitest (aliased consumers) |
| `supabase/functions/**` | `deno check` + `deno test` locally (exact deno 2.9.7) + a handler test for any new/changed handler |
| `supabase/migrations/**` | portable-PG run of `rpc-verify.sql` + `rls-verify.sql` (steps in `supabase/tests/README.md`) |
| `apps/desktop/**` | desktop vitest; `MASARX_RUN_SMOKE=1` smoke for main/preload/server changes |
| docs / `AGENTS.md` | markdownlint + internal links resolve |

CI enforces the cross-cutting layer on every PR regardless: `test`
(all workspace vitest suites with coverage), `e2e`, `deno-check`, `ESLint`,
`next-build`, `workspaces` (typecheck + version parity), `docs-lint`,
`translations`, `gitleaks-artifacts`, `deps-audit (critical gate)` —
see `.github/workflows/ci.yml`.

## 3. Writing conventions

### All suites

- **File placement:** Vitest tests live in `<module>/__tests__/*.test.ts(x)`
  — the glob is enforced by every workspace config; never `*_test.ts`
  (that is the Deno/edge naming). Colocate with the module under test.
- **Selectors:** `getByRole` / `getByText` first (accessible names are the
  contract); `data-testid` only on e2e-critical surfaces (spec 040 W9) —
  59 sites as of the snapshot. Buttons must name their real destination.
- **i18n:** assert via keys/values from `MESSAGE_NAMESPACES`, never hardcoded
  literals (I3; drift-guarded by the shared namespaces-parity test). Cover
  **both ar/en** where rendering differs. RTL trap: Intl ar-compact renders
  Latin digits (`1.2 ألف`) — never assert Arabic-Indic numerals.
- **Auth in e2e:** seeded-cookie helper only
  ([`apps/web/e2e/helpers/auth.ts`](../../../apps/web/e2e/helpers/auth.ts));
  no credentials ever enter the repo; anonymous specs mock
  `/auth/v1/user → {id:null}` + `/auth/v1/token* → {error:"no_session"}`.
- **Determinism:** all data is inline `page.route()` JSON with the catch-all
  `**/rest/v1/**` registered FIRST (LIFO — specific handlers win); no
  `waitForTimeout` sleeps; never minimize the test browser (rAF stops,
  layout collapses).
- **Scope discipline:** run the suite — do not drive the live app. The only
  production surface is the opt-in `prod-smoke.spec.ts`. A fresh worktree
  copies `apps/web/.env.local` in before any e2e run (gotcha §22).
- **Flake policy:** rerun once; a second failure is a bug — fix it or
  quarantine it with an issue link. Known traps are catalogued in
  [12-e2e-testing.md](./12-e2e-testing.md) and
  [01-gotchas.md](./01-gotchas.md) §22–24.

### Surface-specific

- **Desktop units:** Electron main/preload/server logic tested with mocked
  modules (stubs must include `crashReporter` + `electron-log` — spec 028
  lesson). The smoke suite is env-gated: `MASARX_RUN_SMOKE=1` locally, it
  auto-skips under `CI=true`.
- **Edge tests:** offline-only via `_shared/tests/import-map.json` stubs;
  esm.sh URLs pinned exact (mirrored in `deno.jsonc` + `deno.lock`); handler
  files named `handler-<fn>.test.ts` in `_shared/tests/`.
- **SQL:** every mutating scenario wrapped in `BEGIN…ROLLBACK`; violations
  raise and abort under `-v ON_ERROR_STOP=1`; run on a disposable portable
  PostgreSQL 17 — never against prod.
- **Coverage:** reporters pinned to `text` + `json-summary` for the CI
  artifact; report-only, **no thresholds** (owner decision deferred from
  spec 040).
- **Mobile:** vitest covers app logic (`src/lib/**`); RN screens/hooks are a
  documented non-goal (`apps/mobile/vitest.config.ts`); device verification
  is the per-release EAS build + manual QA checklist.

## 4. Coverage matrix (2026-11-22, `main` `5f33dad`)

| Surface | Automated state | Gap | Phase |
| --- | --- | --- | --- |
| web vitest | 102 test files (node + jsdom projects) | none material | — |
| web e2e | 17 specs / 35 tests: home, subjects catalog/levels/detail shell, schedules (ar+en), quiz-play guest + authed finish, materials, ai-assistant send + history, auth failure banners, TRW redeem + non-academic gate, admin anon gate, sidenav (incl. desktop stub), titlebar token, footer, opt-in prod smoke | lecture detail; quizzes list; quiz-attempts; add-file / add-video uploads; summaries detail + edit; courses list/detail; TRW catalog/category/course/my-access; downloads; news; faq; profile (settings, logout, semester switch); onboarding/academic; successful login/signup/reset + logout; admin authed render; unauthorized/privacy pages | P1 |
| desktop units | 7 files / 77 tests (main, preload, server, deepLink, logging, updater) | no e2e harness; smoke is CI-skipped by design; packaged-install verification is manual | P3 |
| mobile | 16 lib test files; RN screens/hooks documented non-goal; no device e2e | device QA is manual per EAS release (accepted — revisit only if the owner lifts the non-goal) | — |
| shared | 20 files; every runtime module covered; residue is type-only/generated | none | — |
| edge functions | 13 files / 129 Deno cases | untested handlers: `reset-password`, `upload-avatar`, `delete-file`; partial: `auth-hook-email` (helper only, no handler suite) | P2 |
| SQL/RLS | `rpc-verify.sql` (53 assertions) + `rls-verify.sql` + `prelude.sql` exist; portable-PG verified | **not wired into CI** (spec 040 W7 explicit leftover) | P2 |
| coverage tooling | v8 reporters pinned; `coverage-summaries` CI artifact; report-only | desktop had **no `test:coverage` script**, so CI silently skipped it ("None of the selected packages has a test:coverage script", exit 0) — **fixed in this PR** | — |
| visual regression | none (manual) | no screenshot baselines for light/dark × ar/en | P4 |
| a11y | Lighthouse accessibility score, record-only (baselines unset) | no axe-core pass; Lighthouse baselines not activated | P4 |
| perf | Lighthouse weekly cron; LCP work per specs 032–036 | baselines assertion dormant until repo vars set | P4 |

## 5. Gap-closure roadmap

Each phase ships as its own approved spec (I11); the next spec number is
always derived from `specs/` on disk.

| Phase | Scope |
| --- | --- |
| P1 — web e2e gap-close | profile + logout, quizzes list + attempts, lecture detail, successful auth flows (login/signup/reset), admin authed render, TRW catalog + my-access, news/faq/downloads, onboarding. Reuse `helpers/auth.ts` + LIFO route mocks; no new tooling. |
| P2 — backend wiring | SQL harness → CI (disposable PG 17 in Actions, replacing the documented-but-manual run); Deno handler tests for `reset-password`, `upload-avatar`, `delete-file`, `auth-hook-email`. |
| P3 — desktop | packaged-install verification as a computer-use scripted checklist (wizard steps + icon/file-assoc evidence screenshots, spec 053 pattern); decide a CI-runnable smoke variant; expand desktop-shell e2e via the `DESKTOP_BRIDGE_STUB`. |
| P4 — visual + a11y regression | Playwright screenshot baselines (light/dark × ar/en), axe-core pass on key pages, activate the Lighthouse baselines via repo variables. |
| Mobile | stays at lib tests + device QA checklist per release (RN screens/hooks non-goal stands). |

## 6. Maintenance

- The [§4 matrix](#4-coverage-matrix-2026-11-22-main-5f33dad) is refreshed at
  merge campaigns: update counts, strike resolved gaps, add new routes — same
  discipline as the spec-ledger rows in `AGENTS.md`.
- [12-e2e-testing.md](./12-e2e-testing.md) stays the Playwright run contract;
  this file is the policy + audit layer on top.
- Tool boundaries are frozen: browser-use inside pages, computer-use at the
  OS layer, T1 suites in CI. Changing any of those is an owner decision.

**Back to:** [AGENTS.md](../../../AGENTS.md)
