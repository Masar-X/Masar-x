---
id: T-009
title: "Add docs/ARCHITECTURE.md and ESLint browser-Supabase import ratchet"
priority: P1
status: todo
depends_on: []
touches:
  - "docs/ARCHITECTURE.md"
  - "apps/web/eslint.config.mjs"
owner_action: false
area: web
estimate: 0.5d
---

## Context

- [VERIFIED] `docs/ARCHITECTURE.md` does not exist on disk; only the 27-line summary `docs/agents/references/04-architecture.md:1-27` exists.
- [VERIFIED] `apps/web/eslint.config.mjs:82-104` already defines `no-restricted-imports` at `"error"` severity for `openai` and `@anthropic-ai/sdk`, with no restriction on browser Supabase client imports.
- [VERIFIED] In `apps/web/src` (390 non-test `.ts`/`.tsx` files), **48** non-test files import a browser Supabase client (**41** import `@/lib/supabase` or relative `.../lib/supabase` and **7** import `@/lib/supabase/client`), not 38 as the prior audit stated.
- [VERIFIED] Across all **42** `apps/web/src/app/**/page.tsx` files, **28/42** are `"use client"` pages, **8** `page.tsx` files import a browser Supabase client (7 `@/lib/supabase` at `courses/[courseId]/page.tsx:8`, `edit-summary/page.tsx:8`, `login/page.tsx:10`, `profile/page.tsx:25`, `reset-password/page.tsx:8`, `subjects/[subject]/page.tsx:7`, `summaries/[summaryId]/page.tsx:19`, plus 1 `@/lib/supabase/client` at `non-academic/[subject]/page.tsx:9`), and **2** import `@/lib/supabase/server` (`news/page.tsx:2`, `quiz-play/[quizId]/page.tsx:3`) — **10** pages total import `@/lib/supabase*` (prior audit claimed 15 pages).
- [VERIFIED] **8** files under `apps/web/src/components/` also import `@/lib/supabase` (via `@/lib/supabase` or relative `../lib/supabase`: `EnrollmentsTab.tsx:3`, `HomeClient.tsx:20`, `lectures/LectureSelect.tsx:4`, `SemesterAdminControl.tsx:7`, `sidenav/AppNav.tsx:6`, `subject/LectureContentModal.tsx:19`, `SubjectsTab.tsx:4`, `waitlist/WaitlistSignup.tsx:11`).

## Goal

Publish a concise 1-page `docs/ARCHITECTURE.md` defining Masar X's client/server boundaries, and lock down `apps/web/eslint.config.mjs` with a `no-restricted-imports` ratchet so no new page or component can import the browser Supabase client directly.

## Non-goals

- Do NOT migrate the 8 grandfathered pages or 8 grandfathered components to server components/hooks in this card.
- Do NOT alter the existing `openai` / `@anthropic-ai/sdk` rules in `apps/web/eslint.config.mjs:82-104`.

## Steps

1. Author `docs/ARCHITECTURE.md` (<= 1 page) covering workspace boundaries (`apps/{web,desktop,mobile}`, `packages/shared`, `supabase/`), Next.js server vs client data flow (`@/lib/supabase/server` / actions / API routes vs `@/lib/supabase` browser client), AI boundary (Puter.js + `ai-chat` Edge Function), and Cloudinary storage.
2. Add a scoped ESLint config block in `apps/web/eslint.config.mjs` targeting `src/app/**/page.{ts,tsx}` and `src/components/**/*.{ts,tsx}` with `"no-restricted-imports": ["error", ...]` forbidding `@/lib/supabase`, `@/lib/supabase/client`, and relative `**/lib/supabase` / `**/lib/supabase/client`.
3. Add an `ignores` allowlist inside that scoped block containing ONLY the 16 currently offending files (8 pages + 8 components verified above) with a comment explaining how to shrink the ratchet as files are refactored.
4. Verify `pnpm --filter web lint` passes on the current tree and fails if a temporary test import of `@/lib/supabase` is added to an un-exempted component/page (then revert the temporary test).

## Acceptance criteria

- [ ] `test -f docs/ARCHITECTURE.md && wc -l docs/ARCHITECTURE.md` — file exists and is concise (<= 120 lines)
- [ ] `pnpm --filter web lint` — exits 0 with zero new errors
- [ ] `pnpm --filter web typecheck` — exits 0

## Evidence

## Rollback

Remove the added ESLint block in `apps/web/eslint.config.mjs` and move `docs/ARCHITECTURE.md` to `.trash/` per I9.

## Open questions

- None
