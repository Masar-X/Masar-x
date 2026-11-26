# Inventory — checklists in `docs/`

Read-only analysis (card T-017b) of every unchecked `- [ ]` item under `docs/`, excluding the acceptance criteria of `docs/tasks/T-*.md`. Base: `main` at `9d3f635`.

Scan command and result:

```
rg -n "^\s*- \[ \]" docs --glob '!docs/tasks/T-*.md'
```

167 items across 8 files. Every item is classified below by status (`already-done` / `stale` / `duplicate-of-card` / `unverified` / `real`) and type (`work-item` / `procedure`).

Scope: markdown `- [ ]` items only. Bracketed `[ ]` text without the leading dash (for example `docs/FEATURES.md:203` and `docs/LAUNCH_SIGNOFF.md:25`) is outside this scan.

Status semantics:

- `already-done` — verified against the current tree, evidence cited.
- `stale` — no longer applicable in the current tree (superseded, source removed, or deprecated), evidence cited.
- `duplicate-of-card` — covered by an existing `T-001`..`T-019` card. None found under `docs/`.
- `unverified` — current truth not established in this pass (manual QA runs, per-deployment/per-incident steps, unverified premises).
- `real` — still outstanding, verified against the current tree.

Items matching `"owner owes..."` are routed to `T-008` and not duplicated here.

## Count Summary

| Type | already-done | stale | duplicate-of-card | unverified | real | Total |
|---|---|---|---|---|---|---|
| work-item | 25 | 13 | 0 | 30 | 3 | 71 |
| procedure | 2 | 34 | 0 | 60 | 0 | 96 |
| **Total** | **27** | **47** | **0** | **90** | **3** | **167** |

Routed to `T-008`: **0**. No checklist item under `docs/` contains an `"owner owes..."` entry (`rg -n "owner owes" docs` matches only task-card prose). The owner-step items live on the `T-008` card (`docs/tasks/T-008-owner-owes-issues.md`) and stay there. Note: the card context cites `AGENTS.md:47-82` as tracking 7 "owner owes" items; on `9d3f635` that section is the Active specs ledger and `rg -i "owes" AGENTS.md` finds no match — the owner steps are tracked on the `T-008` card itself.

## Per-file counts

| File | Items | Type |
|---|---|---|
| `docs/design/UIUX_IMPROVEMENT_PLAN.md` | 41 | work-item |
| `docs/SETUP.md` | 39 | procedure |
| `docs/releases/CUT-CHECKLIST.md` | 33 | procedure (all `stale` — deprecated 2026-09-20, `:2,7`) |
| `docs/legacy/REORGANIZATION_PLAN.md` | 25 | work-item |
| `docs/security/secret-leak-runbook.md` | 10 | procedure |
| `docs/SMOKE_TEST_REPORT.md` | 10 | 5 procedure + 5 work-item |
| `docs/agents/references/08-precommit.md` | 8 | procedure |
| `docs/tasks/_TEMPLATE.md` | 1 | procedure (template placeholder) |

## work-item

Unfinished work; candidates for future cards. The owner decides which entries become cards — no cards were created in this inventory.

### `docs/design/UIUX_IMPROVEMENT_PLAN.md` (41 items)

Planned AI-chat UI/UX work. Most implementation items landed; the manual QA sweep (Phase 5) has no record of having been run.

| Source file:line | Summary | Status | Evidence / Card link |
|---|---|---|---|
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:315` | QA: user writes Arabic message | unverified | manual QA scenario; no record of the sweep |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:316` | QA: user writes English message | unverified | manual QA scenario |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:317` | QA: mixed-script message | unverified | manual QA scenario |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:318` | QA: code snippets with Arabic comments | unverified | manual QA scenario |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:319` | QA: switch interface language mid-typing | unverified | manual QA scenario |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:320` | QA: test on desktop and mobile | unverified | manual QA scenario |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:323` | QA: Chrome (latest) | unverified | browser matrix |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:324` | QA: Firefox (latest) | unverified | browser matrix |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:325` | QA: Safari (latest) | unverified | browser matrix |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:326` | QA: Mobile Safari (iOS) | unverified | browser matrix |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:327` | QA: Chrome Mobile (Android) | unverified | browser matrix |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:330` | QA: keyboard navigation works | unverified | accessibility checks |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:331` | QA: screen reader announces messages | unverified | accessibility checks |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:332` | QA: color contrast meets WCAG AA | unverified | accessibility checks |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:333` | QA: focus states visible | unverified | accessibility checks |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:336` | QA: no layout thrashing from RTL detection | unverified | performance check |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:337` | QA: smooth scrolling in chat container | unverified | performance check |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:338` | QA: message rendering efficient | unverified | performance check |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:345` | Remove duplicate "ZANE AI" header text span | stale | header reworked (spec-048/051): `ZaneStatusAvatar` renders via `apps/web/src/components/ai/ChatContainer.tsx`; old span not in the current header |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:346` | Update status badge text | stale | status badge replaced by status-driven avatar (spec-048) |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:347` | Test header layout on mobile | unverified | manual QA item |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:348` | Verify dark mode contrast | unverified | token layer later wired by spec-046/057; contrast check itself not recorded |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:351` | Add `getTextDirection()` utility | already-done | `apps/web/src/utils/textDirection.ts` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:352` | Add `dir="auto"` to message bubbles | already-done | `apps/web/src/components/ai/ChatMessageItem.tsx:384,425,433` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:353` | Increase message padding (`p-4 sm:p-5`) | already-done | match in `apps/web/src/components/ai/ChatMessageItem.tsx` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:354` | Add `leading-relaxed` line-height | already-done | matches in `apps/web/src/components/ai/ChatMessageItem.tsx`, `ChatInput.tsx` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:355` | Add code highlighting styling | already-done | rehype-highlight active — `apps/web/src/components/ai/ChatMessageItem.tsx:465-466` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:356` | Add padding-bottom to message container | unverified | exact classes not found; chat container markup reworked since the plan was written |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:359` | Add `dir="auto"` to textarea | already-done | `apps/web/src/components/ai/ChatInput.tsx:271,525` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:360` | Create `getPlaceholderForLanguage()` | already-done | `apps/web/src/utils/textDirection.ts`, used by `ChatInput.tsx` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:361` | Add AR translations for placeholders | already-done | AR placeholder path in use via `getPlaceholderForLanguage` (`ChatInput.tsx`) |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:362` | Improve send button styling | unverified | styling judgment; not verifiable from code alone |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:363` | Update margin classes (`ps`/`pe`/`ms`/`me`) | already-done | matches in `ChatInput.tsx` and `ChatMessageItem.tsx` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:366` | Add `pb-6 sm:pb-8` to message container | unverified | classes not found; container markup reworked |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:367` | Style scrollbar CSS | already-done | `.chat-scrollbar-hidden` `apps/web/src/index.css:447`; `apps/web/src/components/ai/ChatScrollbar.tsx`; spec-046 `.scrollbar-none` |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:368` | Test responsive layout | unverified | manual QA item |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:369` | Mobile optimization | unverified | manual QA item |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:372` | Test all RTL/LTR scenarios | unverified | manual QA item; unit coverage exists (`apps/web/src/utils/__tests__/textDirection.test.ts`) |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:373` | Browser compatibility testing | unverified | manual QA item |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:374` | Accessibility audit | unverified | manual QA item |
| `docs/design/UIUX_IMPROVEMENT_PLAN.md:375` | Performance profiling | unverified | manual QA item; later perf work (specs 032/033-wave1a) did not record this audit |

### `docs/legacy/REORGANIZATION_PLAN.md` (25 items)

Repository reorganization plan. The bulk of the file moves landed; the steps whose source files no longer exist are stale.

| Source file:line | Summary | Status | Evidence / Card link |
|---|---|---|---|
| `docs/legacy/REORGANIZATION_PLAN.md:93` | Create `.cursorignore` | already-done | `.cursorignore` at repo root |
| `docs/legacy/REORGANIZATION_PLAN.md:98` | Create `.windsurfignore` | already-done | `.windsurfignore` at repo root |
| `docs/legacy/REORGANIZATION_PLAN.md:103` | Replace `*.sql` rule in `.gitignore` | already-done | `.gitignore:101` `*.sql` + `:102-103` `!supabase/migrations/**/*.sql`, `!supabase/tests/**/*.sql` |
| `docs/legacy/REORGANIZATION_PLAN.md:112` | Append section-8 additions to `.gitignore` | already-done | `.gitignore:181` `# === Added by Reorganization Plan ===` |
| `docs/legacy/REORGANIZATION_PLAN.md:117` | Delete zero-byte `analyze_branches.ps1` | already-done | not in tree |
| `docs/legacy/REORGANIZATION_PLAN.md:118` | Delete zero-byte `arena.txt` | already-done | not in tree |
| `docs/legacy/REORGANIZATION_PLAN.md:123` | Delete empty `models/` directory | already-done | not in tree |
| `docs/legacy/REORGANIZATION_PLAN.md:128` | Create `docs/design/` | already-done | `docs/design/` exists |
| `docs/legacy/REORGANIZATION_PLAN.md:129` | Move `DESIGN.md` → `docs/design/` | already-done | `docs/design/DESIGN.md` |
| `docs/legacy/REORGANIZATION_PLAN.md:130` | Move `DESIGN.json` → `docs/design/` | already-done | `docs/design/DESIGN.json` |
| `docs/legacy/REORGANIZATION_PLAN.md:131` | Create `docs/audits/` | already-done | `docs/audits/` exists (`bug-audit-2026-10-24.md` et al.) |
| `docs/legacy/REORGANIZATION_PLAN.md:132` | Move `MASAR_X_AUDIT_REPORT.md` → `docs/audits/` | stale | file no longer exists anywhere (`rg --files`); `docs/audits/` holds newer audits |
| `docs/legacy/REORGANIZATION_PLAN.md:133` | Move `BRANCH_ANALYSIS.md` → `docs/audits/` | stale | file no longer exists anywhere |
| `docs/legacy/REORGANIZATION_PLAN.md:134` | Move `audit_log.md` → `docs/audits/` | stale | file no longer exists anywhere |
| `docs/legacy/REORGANIZATION_PLAN.md:135` | Create `docs/diagrams/` | already-done | `docs/diagrams/` exists |
| `docs/legacy/REORGANIZATION_PLAN.md:136` | Move `vizvibe.mmd` → `docs/diagrams/` | stale | `vizvibe.mmd` not in tree |
| `docs/legacy/REORGANIZATION_PLAN.md:137` | Create `docs/scratch/` | stale | transient scratch not needed; source files gone |
| `docs/legacy/REORGANIZATION_PLAN.md:138` | Move `temp-prompt.txt` → `docs/scratch/` | stale | file not in tree |
| `docs/legacy/REORGANIZATION_PLAN.md:139` | Move `structure.txt` → `docs/scratch/` | stale | file not in tree |
| `docs/legacy/REORGANIZATION_PLAN.md:140` | Move `files.txt` → `docs/scratch/` | stale | file not in tree |
| `docs/legacy/REORGANIZATION_PLAN.md:141` | Move `compare.md` → `docs/scratch/` | stale | file not in tree |
| `docs/legacy/REORGANIZATION_PLAN.md:147` | Move `proxy.ts` → `scripts/proxy.ts` | stale | the root `proxy.ts` is gone; it lives on at `apps/web/src/proxy.ts` and `apps/web/src/lib/supabase/proxy.ts` |
| `docs/legacy/REORGANIZATION_PLAN.md:152` | Compress `logo_EN.png` to WebP < 100 KB | already-done | `apps/web/public/logo_EN.webp` (72.7 KB) |
| `docs/legacy/REORGANIZATION_PLAN.md:153` | Strip raster from `favicon.svg`, < 10 KB | already-done | `apps/web/public/favicon.svg` 9.8 KB; no `data:image`/`<image>` matches |
| `docs/legacy/REORGANIZATION_PLAN.md:158` | Clean `.windsurf/plans/` | already-done | `.windsurf/` contains only `workflows/review.md`; no `plans/` |

### `docs/SMOKE_TEST_REPORT.md` — "Known follow-ups" (5 items)

Follow-ups recorded on the historical smoke-test report for `refactor/supabase-migration-and-fixes`.

| Source file:line | Summary | Status | Evidence / Card link |
|---|---|---|---|
| `docs/SMOKE_TEST_REPORT.md:228` | Remove `image/svg+xml` exclusion; add server-side sanitizer | unverified | no svg exclusion found in the current tree (only `supabase/functions/_shared/tests/upload-file-pure.test.ts:57`); premise needs re-check before acting |
| `docs/SMOKE_TEST_REPORT.md:229` | Consolidate 6 `as never` casts into `fromTyped<T>()` | real | 5 production `as never` casts exist: `apps/web/src/actions/auth.ts:68,85`, `apps/web/src/actions/profile.ts:38`, `apps/web/src/actions/content.ts:119,172`; the loose-typing decision is documented at `apps/web/src/lib/supabase/admin.ts:13-18` |
| `docs/SMOKE_TEST_REPORT.md:231` | Drop `serverExternalPackages: ["pg"]` | real | `apps/web/next.config.mjs:57`; no `drizzle-orm/node-postgres` or direct `pg` import found in `apps/web/src` |
| `docs/SMOKE_TEST_REPORT.md:233` | Delete `src/lib/admin-db/`; remove `drizzle-orm` | real | `apps/web/src/lib/admin-db/schema.ts` exists; `drizzle-orm` at `apps/web/package.json:40`; `ProfileRow` imported by `apps/web/src/contexts/AuthContext.tsx:14`, `apps/web/src/components/AppProviders.tsx:13` |
| `docs/SMOKE_TEST_REPORT.md:235` | Rewrite `scripts/db-diagnose.cjs` to Supabase JS | stale | script no longer exists (`scripts/` has no `db-diagnose.cjs`) |

## procedure

Reusable checklists. Do not convert to cards; propose consolidation under `docs/checklists/<name>.md` (sources cited by `file:line`). Moving files is a follow-up decision — nothing was moved in this inventory.

### `docs/SETUP.md` (39 items)

Two reusable walkthroughs: the manual testing checklist (`:582-603`) and the production deployment checklist (`:605-637`).

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `docs/SETUP.md:585` | Manual test: registration and authentication | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:586` | Manual test: summary submission and moderation | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:587` | Manual test: enrollment and payment verification | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:588` | Manual test: quiz taking and scoring | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:589` | Manual test: AI assistant chat | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:590` | Manual test: file uploads (PDFs, images, videos) | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:591` | Manual test: real-time notifications | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:592` | Manual test: admin dashboard | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:595` | Manual test: student permissions and access | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:596` | Manual test: instructor course management | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:597` | Manual test: admin platform oversight | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:600` | Manual test: various screen sizes | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:601` | Manual test: RTL layout verification | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:602` | Manual test: touch interactions | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:603` | Manual test: PWA functionality | unverified | `docs/checklists/setup-manual-testing.md` |
| `docs/SETUP.md:608` | Deploy: set up production Supabase project | already-done | `docs/checklists/production-deployment.md` — production project live; AGENTS.md specs ledger (rows 040/049) cites prod-applied migrations 2026-11-09 and 2026-11-18 |
| `docs/SETUP.md:609` | Deploy: configure all environment variables | unverified | `docs/checklists/production-deployment.md` — env values owner-held |
| `docs/SETUP.md:610` | Deploy: run database migrations | already-done | `docs/checklists/production-deployment.md` — same ledger evidence as `:608` |
| `docs/SETUP.md:611` | Deploy: create production admin users | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:612` | Deploy: test all features in staging | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:613` | Deploy: error monitoring (Vercel Analytics, Sentry) | unverified | `docs/checklists/production-deployment.md` — no sentry/analytics package found in `apps/web/package.json`; likely outstanding, owner-held |
| `docs/SETUP.md:614` | Deploy: configure custom domain | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:615` | Deploy: set up SSL certificates | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:618` | Security: review RLS policies for production | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:619` | Security: verify API key security | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:620` | Security: test authentication flows | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:621` | Security: check file upload restrictions | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:622` | Security: audit admin access controls | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:623` | Security: set up backup procedures | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:626` | Perf: enable Vercel optimizations | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:627` | Perf: configure CDN settings | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:628` | Perf: test loading speeds | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:629` | Perf: verify SEO implementation | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:630` | Perf: check accessibility compliance | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:633` | Monitor: set up analytics tracking | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:634` | Monitor: configure error logging | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:635` | Monitor: set up automated testing | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:636` | Monitor: plan regular maintenance schedule | unverified | `docs/checklists/production-deployment.md` |
| `docs/SETUP.md:637` | Monitor: document admin procedures | unverified | `docs/checklists/production-deployment.md` |

### `docs/releases/CUT-CHECKLIST.md` (33 items) — DEPRECATED

Deprecated 2026-09-20 (`:2,7`): drives the retired two-repo public-runner pipeline; the commands no longer work. Superseded by `docs/agents/references/02-release-pipeline.md`. Proposed target: **none** — keep as historical record, unmodified. All items `stale` for the same reason; per-item evidence is the deprecation banner plus the referenced current pipeline doc.

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `docs/releases/CUT-CHECKLIST.md:19` | Pre-flight: version-bump PR merged on `main` | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:20` | Pre-flight: local tree on `main`, clean | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:23` | Pre-flight: desktop `package.json` version matches | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:25` | Pre-flight: capture `main` HEAD of the bump PR | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:27` | Pre-flight: no uncommitted auth.ts / auth sync changes | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:29` | Pre-flight: local build sanity check | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:32` | Pre-flight: `gh auth status` good | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:33` | Pre-flight: admin bypass on old repo branch protection | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:44` | Trigger: workflow dispatch accepted | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:45` | Trigger: capture the run ID | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:61` | Watch: step 3 checkout private source | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:62` | Watch: step 8 build web standalone | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:63` | Watch: step 9 mirror release tag | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:64` | Watch: step 10 build & publish desktop | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:74` | Verify: release exists, not draft/pre-release | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:79` | Verify: all 3 assets present | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:84` | Verify: static naming convention intact | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:86` | Verify: `latest.yml` version + sha512 | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:92` | Verify: `versions/v0.5.9.txt` marker on old repo | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:108` | Smoke: install binary on clean Windows | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:109` | Smoke: sign in with test account | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:110` | Smoke: trigger 500 on `/api/auth/sync` | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:111` | Smoke: capture the response | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:112` | Smoke: verify structured error shape | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:123` | Smoke: verify leak closed | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:127` | Smoke: repeat in dev mode | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:137` | Finalize: open v0.5.8 release page | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:139` | Finalize: verify link target reachable | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:142` | Finalize: fix forward-reference if 404 | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:159` | Finalize: verify `latest.yml` unchanged on v0.5.8 | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:170` | Rollback: partial release after build failure | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:179` | Rollback: smoke regression (do not delete outright) | stale | none (deprecated) |
| `docs/releases/CUT-CHECKLIST.md:187` | Rollback: leak still present — verify PR #22 ancestry | stale | none (deprecated) |

### `docs/security/secret-leak-runbook.md` (10 items)

Section 7 "Disclosure checklist" (`:89-100`) — post-incident steps checked during an actual incident, so `unverified` between incidents by nature.

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `docs/security/secret-leak-runbook.md:91` | All leaked keys rotated; canary 401/403 | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:92` | Runtime envs updated; redeploys live | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:93` | gitleaks re-scans green; findings logged | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:94` | History-purge decision recorded | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:95` | Exposure-window review; rate limits tightened | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:96` | User-data impact documented; users notified | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:97` | Private GHSA opened; disclosure timed with fix | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:98` | Release notes updated per `docs/releases/TEMPLATE.md` | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:99` | Post-incident review: leak path + closing guard | unverified | `docs/checklists/secret-leak-disclosure.md` |
| `docs/security/secret-leak-runbook.md:100` | Runbook updated with incident lessons | unverified | `docs/checklists/secret-leak-disclosure.md` |

### `docs/SMOKE_TEST_REPORT.md` — "Pre-requisites" (5 items)

Prerequisites for running the documented smoke test (`:14-26`).

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `docs/SMOKE_TEST_REPORT.md:18` | Supabase dev/staging project reachable | unverified | `docs/checklists/smoke-test.md` |
| `docs/SMOKE_TEST_REPORT.md:19` | `.env.local` contains required values | unverified | `docs/checklists/smoke-test.md` |
| `docs/SMOKE_TEST_REPORT.md:24` | `pnpm dev` starts without error | unverified | `docs/checklists/smoke-test.md` |
| `docs/SMOKE_TEST_REPORT.md:25` | Test user account exists | unverified | `docs/checklists/smoke-test.md` |
| `docs/SMOKE_TEST_REPORT.md:26` | Admin user account exists (tests 6-7) | unverified | `docs/checklists/smoke-test.md` |

### `docs/agents/references/08-precommit.md` (8 items)

Pre-commit / pre-merge checks (`:3-12`), run per change.

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `docs/agents/references/08-precommit.md:5` | `pnpm typecheck` passes | unverified | `docs/checklists/precommit.md` |
| `docs/agents/references/08-precommit.md:6` | `pnpm lint` passes (security-guard rules) | unverified | `docs/checklists/precommit.md` |
| `docs/agents/references/08-precommit.md:7` | `pnpm test` passes | unverified | `docs/checklists/precommit.md` |
| `docs/agents/references/08-precommit.md:8` | No hardcoded Arabic strings added | unverified | `docs/checklists/precommit.md` |
| `docs/agents/references/08-precommit.md:9` | No new deps without `pnpm-lock.yaml` update | unverified | `docs/checklists/precommit.md` |
| `docs/agents/references/08-precommit.md:10` | §10 trigger → spec exists and approved first | unverified | `docs/checklists/precommit.md` |
| `docs/agents/references/08-precommit.md:11` | New migration timestamped in `supabase/migrations/` | unverified | `docs/checklists/precommit.md` |
| `docs/agents/references/08-precommit.md:12` | `ThemeScript.tsx` touched → re-read 01-gotchas §19 | unverified | `docs/checklists/precommit.md` |

### `docs/tasks/_TEMPLATE.md` (1 item)

Placeholder example inside the card template (`:36`) — not real work.

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `docs/tasks/_TEMPLATE.md:36` | Template example: `<command>` — expected output | stale | none (template placeholder, kept as-is) |

## Follow-up notes (no action taken here)

- `docs/checklists/` does not exist yet; the proposed consolidations above would create it. Owner decision.
- The three `real` work items all come from the `SMOKE_TEST_REPORT.md` follow-up block (`:229`, `:231`, `:233`) and could become one small card (drop unused `serverExternalPackages: ["pg"]`; remove `admin-db/` + `drizzle-orm` including the two `ProfileRow` type imports).
- The `UIUX_IMPROVEMENT_PLAN.md` Phase-5 QA block (29 `unverified` items) is a single manual QA sweep; if the owner still wants it, it fits one card rather than 29.
