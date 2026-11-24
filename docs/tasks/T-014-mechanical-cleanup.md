---
id: T-014
title: "Mechanical repo, docs, dependency, and config cleanup"
priority: P2
status: todo
depends_on:
  - T-008
touches:
  - "AGENTS.md"
  - "docs/spec-ledger.md"
  - "docs/agents/references/03-invariants.md"
  - "docs/agents/references/11-git-standards.md"
  - "docs/SETUP.md"
  - ".github/ISSUE_TEMPLATE/config.yml"
  - "STRUCTURE.md"
  - ".gitignore"
  - "package.json"
  - "apps/web/package.json"
  - "apps/web/tsconfig.node.json"
  - "apps/web/src/vite-env.d.ts"
  - "apps/web/src/lib/admin-db/schema.ts"
  - "apps/web/src/contexts/AuthContext.tsx"
  - "apps/web/src/components/AppProviders.tsx"
  - "apps/web/vercel.json"
  - "pnpm-lock.yaml"
owner_action: false
area: docs
estimate: 1d
---

## Context

- [VERIFIED] `AGENTS.md` is **84 lines** (already `< 150` lines), **29,562 bytes**; lines `43-84` (Active Specs Ledger) account for **23,887 bytes (81% of file bytes)**, while `AGENTS.md:18` is a single 2KB line duplicating rules **I5, I14, I15, I16** from `docs/agents/references/03-invariants.md:9,18-20` and `docs/agents/references/11-git-standards.md:33-140`.
- [VERIFIED] Rule **I5** (`AGENTS.md:18`, `docs/agents/references/03-invariants.md:9`) describes `pnpm.neverBuiltDependencies` in root `package.json`, whereas root `package.json:31-55` only has `"pnpm": { "overrides": ... }` and `pnpm-workspace.yaml:35-40` uses `onlyBuiltDependencies` (whose comment at `pnpm-workspace.yaml:19` also cites stale `.agents/references/01-gotchas.md`).
- [VERIFIED] `docs/SETUP.md` is **702 lines** (note: `docs/agents/references/00-setup.md:13` claims `689 lines`), mixes stale March/Feb 2026 notes, recommends `npm install` at `:58` alongside `pnpm install`, references `apps/web/src/config/subjects.config.ts` at `:97`, and lists `NEXT_PUBLIC_EMAILJS_*` at `:82-84`.
- [VERIFIED] `.github/ISSUE_TEMPLATE/config.yml:4,7` still points to `https://github.com/fotedev/Masar-x-next/security/advisories/new` and `https://github.com/fotedev/masarx-releases/releases` instead of `Masar-X/Masar-x`.
- [VERIFIED] `STRUCTURE.md` **already exists** at the repo root (`STRUCTURE.md:1-175`, dated `2026-11-07`, still listing `specs/ (numbered dirs, 001–038)` at `:46,88` and `vercel.json` at root `:57,106` whereas `vercel.json` is under `apps/web/vercel.json`). `specs/` has **61** directories with **3 duplicate numbers**: `033` (`033-materials-port`, `033-wave1a-perf`), `034` (`034-subjects-schedules`, `034-wave1b-perf`), `040` (`040-automation-test-coverage`, `040-review-remediation`).
- [VERIFIED] `.gitignore:110` ignores `check-supabase-secrets.ps1` and `.gitignore:233` ignores `/docs/audits` (blocking tracking of audit deliverables).
- [VERIFIED] Dependency audit of `drizzle-orm`, `pg`, `vite`:
  - `drizzle-orm` (`apps/web/package.json:40`) + `drizzle-kit` (`:76`) are used ONLY for type inference `ProfileRow` in `apps/web/src/lib/admin-db/schema.ts:7` (imported by `AuthContext.tsx:14` and `AppProviders.tsx:13`) — zero runtime queries exist.
  - `pg` is NOT unused: root `package.json:29` (`pg: ^8.18.0`) is imported by `scripts/audit-rls.mjs:20`, and `apps/web/package.json:48` (`pg: ^8.23.1`, `@types/pg` at `:70`) is imported by `apps/web/scripts/db-diagnose.cjs:10`.
  - `vite` (`apps/web/package.json:88`) and `@vitejs/plugin-react` (`:73`) are used by Vitest; `vite-plugin-compression` (`:89`) and `vite-plugin-pwa` (`:90`) are unused outside `apps/web/tsconfig.node.json:26-27` and `apps/web/src/vite-env.d.ts:2` (see also `docs/perf/audit-2026-11-02/findings/01-bundle-dependencies.md:34`).
- [VERIFIED] `apps/web/vercel.json:3` runs retired `pnpm --filter web run lottie-patch` (`lottie-patch` script no longer exists in `apps/web/package.json`), and `:40` configures headers for deleted `/dotlottie-player.wasm`.
- [VERIFIED] Heavy ignored/untracked root folders in primary checkout (read-only measurement): `masarx-video-ad` (442.10 MB), `sandbox` (145.82 MB), `masarx-remotion-ad` (67.89 MB), `.opencode` (48.73 MB), `videos` (21.31 MB, not in `.gitignore`), `context_output` (2.91 MB), `.trash` (0.91 MB).

## Goal

Execute mechanical hygiene across docs, GitHub templates, `.gitignore`, stale Vercel config, and dead deps (`drizzle-orm`/`drizzle-kit`, `vite-plugin-*`), while preserving working script deps (`pg`, `vite`) and listing heavy root folders for owner relocation (never deleting per I9).

## Non-goals

- Do NOT delete any project or ignored heavy folder (per I9, list them for owner approval/relocation only).
- Do NOT remove `pg` from `scripts/audit-rls.mjs` / `apps/web/scripts/db-diagnose.cjs` or `vite` required by Vitest without migrating those tools first.
- Do NOT rename historical `specs/033-*`, `034-*`, `040-*` directories if external links/PRs rely on them without checking link breakage; document/alias or renumber per open question.

## Steps

1. **Split check**: If executing all 8 sub-items below exceeds ~1 day, split into `T-014a` (docs/ledger/SETUP/STRUCTURE/ISSUE_TEMPLATE) and `T-014b` (`.gitignore` + deps + `vercel.json` + heavy-folder inventory) before coding.
2. Extract lines `43-84` from `AGENTS.md` into `docs/spec-ledger.md`, keep a 1-line pointer in `AGENTS.md`, trim `AGENTS.md:18` so I5/I14-I16 link to `03-invariants.md` & `11-git-standards.md` without repeating full prose, and update I5 (`03-invariants.md:9`) to match `pnpm-workspace.yaml:35` `onlyBuiltDependencies`.
3. Rewrite `docs/SETUP.md` concisely for the current pnpm monorepo setup (removing stale `npm install`, `EmailJS`, and outdated line counts in `00-setup.md:13`).
4. Update `.github/ISSUE_TEMPLATE/config.yml:4,7` to `Masar-X/Masar-x` URLs.
5. Update `STRUCTURE.md` (`specs/` count 61, `apps/web/vercel.json` path) and resolve/document the 3 duplicate `specs/` prefixes (`033`, `034`, `040`) per owner decision.
6. Un-ignore `/docs/audits` (`.gitignore:233`) and `check-supabase-secrets.ps1` (`.gitignore:110`) after verifying no secrets exist in those files.
7. Replace `ProfileRow` in `AuthContext.tsx:14` and `AppProviders.tsx:13` with `Database["public"]["Tables"]["profiles"]["Row"]` from `masarx-shared/types`, move `apps/web/src/lib/admin-db/schema.ts` to `.trash/` (with owner approval per I9), and remove `drizzle-orm`, `drizzle-kit`, `vite-plugin-compression`, and `vite-plugin-pwa` (cleaning `tsconfig.node.json:26-27` and `vite-env.d.ts:2`) — keeping `pg` (used by `audit-rls.mjs` & `db-diagnose.cjs`) and `vite` (used by Vitest).
8. Fix `apps/web/vercel.json:3,40` (drop `lottie-patch` from `buildCommand` and `/dotlottie-player.wasm` header) and append an inventory of heavy root folders (`masarx-video-ad`, `sandbox`, `masarx-remotion-ad`, `videos`, `.opencode`, `context_output`) in the PR for owner cleanup.

## Acceptance criteria

- [ ] `pnpm install --lockfile-only && pnpm --filter web build && pnpm typecheck && pnpm lint && pnpm test` — exits 0 after removing `drizzle-orm`, `drizzle-kit`, `vite-plugin-compression`, and `vite-plugin-pwa`
- [ ] `bash .github/scripts/check-doc-links.sh` — exits 0 with all updated links in `AGENTS.md`, `docs/spec-ledger.md`, `docs/SETUP.md`, and `STRUCTURE.md`
- [ ] `wc -c AGENTS.md` — significantly reduced (< 8 KB, < 150 lines) with ledger moved to `docs/spec-ledger.md`

## Evidence

## Rollback

Restore modified config/doc files via `git checkout`; restore any `.trash/`-moved files and re-run `pnpm install` if `pnpm-lock.yaml` needs reverting.

## Open questions

- Should duplicate `specs/` numbers (`033`, `034`, `040`) be documented as historical freeze exceptions in `docs/spec-ledger.md` or renamed on disk (which breaks existing commit/PR links)?
- Should `pg` + `apps/web/scripts/db-diagnose.cjs` stay in `apps/web` or move to root `scripts/` so `apps/web/package.json` has zero `pg` runtime dependency?
