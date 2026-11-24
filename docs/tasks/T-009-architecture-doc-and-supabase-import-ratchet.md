---
id: T-009
title: "Add docs/ARCHITECTURE.md and ESLint browser-Supabase import ratchet"
priority: P1
status: todo
depends_on: []
touches:
  - "docs/ARCHITECTURE.md"
  - "apps/web/eslint.config.mjs"
  - "apps/web/eslint-supabase-allowlist.mjs"
owner_action: false
area: web
estimate: 0.5d
---

## Context

- [VERIFIED] `docs/ARCHITECTURE.md` does not exist on disk; only the 27-line summary `docs/agents/references/04-architecture.md:1-27` exists.
- [VERIFIED] `apps/web/eslint.config.mjs:82-104` already defines `no-restricted-imports` at `"error"` severity for `openai` and `@anthropic-ai/sdk`, with no restriction on browser Supabase client imports.
- [VERIFIED] In `apps/web/src` (390 non-test `.ts`/`.tsx` files), **48** non-test files import a browser Supabase client (**41** import `@/lib/supabase` or relative `.../lib/supabase` and **7** import `@/lib/supabase/client`), not 38 as the prior audit stated.
- [VERIFIED] Across all **42** `apps/web/src/app/**/page.tsx` files, **28/42** are `"use client"` pages, **8** `page.tsx` files import a browser Supabase client (`courses/[courseId]/page.tsx:8`, `edit-summary/page.tsx:8`, `login/page.tsx:10`, `profile/page.tsx:25`, `reset-password/page.tsx:8`, `subjects/[subject]/page.tsx:7`, `summaries/[summaryId]/page.tsx:19`, `non-academic/[subject]/page.tsx:9`), and **2** import `@/lib/supabase/server` (`news/page.tsx:2`, `quiz-play/[quizId]/page.tsx:3`) — **10** pages total import `@/lib/supabase*` (prior audit claimed 15). **8** files under `apps/web/src/components/` also import `@/lib/supabase` (or relative `../lib/supabase`).
- [VERIFIED] `profile/page.tsx:25` (`T-011b`) and `courses/[courseId]/page.tsx:8` (`T-011c`) are behavior-preserving split cards and intentionally keep their browser Supabase imports until separate burn-down cards.

## Goal

Publish a concise 1-page `docs/ARCHITECTURE.md` defining Masar X's client/server boundaries, and enforce an ESLint `no-restricted-imports` ratchet backed by an explicit allowlist file (`apps/web/eslint-supabase-allowlist.mjs`) whose baseline is verified directly by ESLint (not `rg`).

## Non-goals

- Do NOT migrate the grandfathered pages, components, or hooks (`T-011b`, `T-011c`, etc.) off browser Supabase clients in this card.
- Do NOT alter the existing `openai` / `@anthropic-ai/sdk` rules in `apps/web/eslint.config.mjs:82-104`.

## Steps

1. Author `docs/ARCHITECTURE.md` (<= 1 page) covering workspace boundaries (`apps/{web,desktop,mobile}`, `packages/shared`, `supabase/`), Next.js server vs client data flow (`@/lib/supabase/server` / actions / API routes vs `@/lib/supabase` browser client), AI boundary (Puter.js + `ai-chat` Edge Function), and Cloudinary storage.
2. Create `apps/web/eslint-supabase-allowlist.mjs` exporting the explicit grandfathered baseline computed by running ESLint itself against the rule (verified 48-file browser-Supabase baseline across `apps/web/src`, with explicit note that `profile/page.tsx` / `T-011b` and `courses/[courseId]/page.tsx` / `T-011c` stay allowlisted until separate burn-down cards).
3. Add a scoped ESLint config block in `apps/web/eslint.config.mjs` targeting `src/**/*.{ts,tsx}` (or `src/app/**/page.{ts,tsx}` + `src/components/**/*.{ts,tsx}` + `src/hooks/**/*.{ts,tsx}`, excluding `src/lib/supabase/**` and `__tests__/**`) with `"no-restricted-imports": ["error", ...]` forbidding `@/lib/supabase`, `@/lib/supabase/client`, and relative `**/lib/supabase` / `**/lib/supabase/client`, ignoring only `apps/web/eslint-supabase-allowlist.mjs`.
4. Verify via ESLint directly (`pnpm --filter web lint` passes with allowlist, and fails if any entry is removed from the allowlist or a new un-allowlisted file imports `@/lib/supabase`) — never rely on `rg` to compute or check the baseline.

## Acceptance criteria

- [ ] `test -f docs/ARCHITECTURE.md && wc -l docs/ARCHITECTURE.md` — file exists and is <= 120 lines
- [ ] `pnpm --filter web lint` — exits 0 with zero errors using `apps/web/eslint-supabase-allowlist.mjs` (48-file ESLint-computed baseline)
- [ ] `pnpm --filter web typecheck` — exits 0

## Evidence

## Rollback

Remove the added ESLint block from `apps/web/eslint.config.mjs` and move `docs/ARCHITECTURE.md` + `apps/web/eslint-supabase-allowlist.mjs` to `.trash/` per I9.

## Open questions

- None
