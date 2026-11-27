---
id: T-014
title: "Mechanical repo, docs, dead-dep, and config cleanup"
priority: P2
status: done
depends_on: []
touches:
  - "AGENTS.md"
  - "docs/spec-ledger.md"
  - "docs/agents/references/03-invariants.md"
  - "docs/agents/references/11-git-standards.md"
  - "docs/SETUP.md"
  - ".github/ISSUE_TEMPLATE/config.yml"
  - "STRUCTURE.md"
  - ".gitignore"
  - "apps/web/package.json"
  - "apps/web/tsconfig.node.json"
  - "apps/web/src/vite-env.d.ts"
  - "apps/web/vercel.json"
  - "scripts/check-spec-prefixes.mjs"
  - ".github/workflows/ci.yml"
  - "pnpm-lock.yaml"
owner_action: false
area: docs
estimate: 1d
---

## Context

- [VERIFIED] `AGENTS.md` is **84 lines**, **29,562 bytes**; lines `43-84` (Active Specs Ledger) account for **23,887 bytes (81% of file bytes)**, while `AGENTS.md:18` is a single 2KB line duplicating rules **I5, I14, I15, I16** from `docs/agents/references/03-invariants.md:9,18-20` and `docs/agents/references/11-git-standards.md:33-140`.
- [VERIFIED] Rule **I5** (`AGENTS.md:18`, `docs/agents/references/03-invariants.md:9`) describes `pnpm.neverBuiltDependencies` in root `package.json`, whereas root `package.json:31-55` only has `"pnpm": { "overrides": ... }` and `pnpm-workspace.yaml:35-40` uses `onlyBuiltDependencies` (whose comment at `pnpm-workspace.yaml:19` also cites stale `.agents/references/01-gotchas.md`).
- [VERIFIED] `docs/SETUP.md` is **702 lines** (`docs/agents/references/00-setup.md:13` claims `689 lines`), mixes stale March/Feb 2026 notes, recommends `npm install` at `:58` alongside `pnpm install`, and lists `NEXT_PUBLIC_EMAILJS_*` at `:82-84`.
- [VERIFIED] `.github/ISSUE_TEMPLATE/config.yml:4,7` points to `https://github.com/fotedev/Masar-x-next/security/advisories/new` and `https://github.com/fotedev/masarx-releases/releases` instead of `Masar-X/Masar-x`.
- [VERIFIED] `STRUCTURE.md` already exists at repo root (`STRUCTURE.md:1-175`, dated `2026-11-07`, still listing `specs/ (numbered dirs, 001–038)` at `:46,88` and `vercel.json` at root `:57,106` instead of `apps/web/vercel.json`). `specs/` has **61** directories with **3 frozen historical duplicate numbers**: `033` (`033-materials-port`, `033-wave1a-perf`), `034` (`034-subjects-schedules`, `034-wave1b-perf`), `040` (`040-automation-test-coverage`, `040-review-remediation`).
- [VERIFIED] `.gitignore:110` ignores `check-supabase-secrets.ps1` and `.gitignore:233` ignores `/docs/audits`.
- [VERIFIED] Dependency verification:
  - **Real dead deps**: `vite-plugin-compression` (`apps/web/package.json:89`) and `vite-plugin-pwa` (`:90`) are unused outside `apps/web/tsconfig.node.json:26-27` and `apps/web/src/vite-env.d.ts:2` (per `docs/perf/audit-2026-11-02/findings/01-bundle-dependencies.md:34`).
  - **Type-only (not fully dead)**: `drizzle-orm` (`apps/web/package.json:40`) + `drizzle-kit` (`:76`) are used for `ProfileRow` type inference in `apps/web/src/lib/admin-db/schema.ts:7` (imported by `AuthContext.tsx:14` and `AppProviders.tsx:13`).
  - **Actively used (DO NOT remove/move)**: `pg` is imported by `scripts/audit-rls.mjs:20` (root) and `apps/web/scripts/db-diagnose.cjs:10` (`apps/web`); `vite` (`apps/web/package.json:88`) and `@vitejs/plugin-react` (`:73`) are used by Vitest.
- [VERIFIED] `apps/web/vercel.json:3` runs retired `pnpm --filter web run lottie-patch` (script deleted from `apps/web/package.json`), and `:40` configures headers for deleted `/dotlottie-player.wasm`.
- [VERIFIED] Heavy ignored/untracked root folders in primary checkout (read-only measurement): `masarx-video-ad` (442.10 MB), `sandbox` (145.82 MB), `masarx-remotion-ad` (67.89 MB), `.opencode` (48.73 MB), `videos` (21.31 MB, not in `.gitignore`), `context_output` (2.91 MB), `.trash` (0.91 MB).

## Goal

Execute mechanical hygiene across docs (`AGENTS.md < 8 KB`, `docs/spec-ledger.md`, `docs/SETUP.md`, `STRUCTURE.md`), `.github/ISSUE_TEMPLATE/config.yml`, `.gitignore`, `apps/web/vercel.json`, real dead Vite plugin deps (`vite-plugin-compression`, `vite-plugin-pwa`), and a lint blocking new duplicate `specs/` prefixes — while preserving `pg`, `db-diagnose.cjs`, and `vite`, keeping `033`/`034`/`040` as frozen historical exceptions, and listing heavy root folders for owner relocation (never deleting per I9).

## Non-goals

- Do NOT remove or move `pg`, `apps/web/scripts/db-diagnose.cjs`, `vite`, or `@vitejs/plugin-react`.
- Do NOT delete any heavy/ignored folder (per I9, list them for owner relocation only).
- Do NOT rename existing historical `specs/033-*`, `034-*`, `040-*` directories; keep them as frozen historical exceptions.
- Do NOT rewrite `drizzle-orm` / `ProfileRow` unless separately approved (note as type-only, not fully dead).

## Steps

1. **Split check**: If executing all cleanup items exceeds ~1 day, split into `T-014a` (docs/ledger/SETUP/STRUCTURE/ISSUE_TEMPLATE/spec-prefix-lint) and `T-014b` (`.gitignore` + dead Vite plugins + `vercel.json` + heavy-folder inventory) before coding.
2. Extract `AGENTS.md:43-84` into `docs/spec-ledger.md`, keep a 1-line pointer in `AGENTS.md`, trim `AGENTS.md:18` so I5/I14-I16 link to `03-invariants.md` & `11-git-standards.md` without prose duplication, and update I5 (`03-invariants.md:9`) to reflect `pnpm-workspace.yaml:35` `onlyBuiltDependencies` (shrinking `AGENTS.md < 8 KB`).
3. Rewrite `docs/SETUP.md` concisely for the current pnpm monorepo setup (removing stale `npm install`, `EmailJS`, and outdated line counts in `docs/agents/references/00-setup.md:13`).
4. Update `.github/ISSUE_TEMPLATE/config.yml:4,7` to `Masar-X/Masar-x` URLs.
5. Update `STRUCTURE.md` (`specs/` count 61, `apps/web/vercel.json` path), document `033`/`034`/`040` as frozen historical exceptions in `docs/spec-ledger.md`, and add `scripts/check-spec-prefixes.mjs` (wired into `.github/workflows/ci.yml`) failing on any new duplicate `specs/NNN-*` prefix outside `{033, 034, 040}`.
6. Un-ignore `/docs/audits` (`.gitignore:233`) and `check-supabase-secrets.ps1` (`.gitignore:110`) after verifying no secrets exist in those files.
7. Remove real dead deps `vite-plugin-compression` and `vite-plugin-pwa` from `apps/web/package.json:89-90` (cleaning `apps/web/tsconfig.node.json:26-27` and `apps/web/src/vite-env.d.ts:2`) and refresh `pnpm-lock.yaml`; leave `pg`, `db-diagnose.cjs`, `vite`, `@vitejs/plugin-react` untouched (and note `drizzle-orm`/`drizzle-kit` as type-only).
8. Fix `apps/web/vercel.json:3,40` (drop `lottie-patch` from `buildCommand` and `/dotlottie-player.wasm` header) and list heavy root folders (`masarx-video-ad`, `sandbox`, `masarx-remotion-ad`, `videos`, `.opencode`, `context_output`) in the PR body for owner cleanup.

## Acceptance criteria

- [x] `wc -c AGENTS.md` — strictly `< 8192` bytes (`< 8 KB`) with ledger moved to `docs/spec-ledger.md`
  evidence: `wc -c AGENTS.md` -> `4806 AGENTS.md` (< 8192); the 34-row ledger lives in `docs/spec-ledger.md` (verified row-for-row against `origin/main:AGENTS.md` lines 43-84 during review)
- [x] `node scripts/check-spec-prefixes.mjs` — exits 0 allowing the five frozen historical duplicates `{015, 023, 033, 034, 040}` and failing on any new duplicate prefix (a frozen number also fails when it gains a third directory)
  evidence: exit 0 on the tree (`specs/ numbering OK (frozen historical duplicates: 015, 023, 033, 034, 040)`); negative controls both exit 1 — a temporary `specs/035-probe-dup` (non-frozen duplicate) and a temporary `specs/015-probe-third` (frozen third directory); both removed, check green again
- [x] `pnpm install --lockfile-only && pnpm --filter web build && pnpm typecheck && pnpm lint && pnpm test` — exits 0 with `pg` and `db-diagnose.cjs` intact
  evidence: `pnpm install --lockfile-only` -> `Done in 588ms` (re-run 2026-11-27, exit 0); `pnpm --filter web build` -> exit 0 (after copying the git-ignored `apps/web/.env.local` per the spec-044 env guard); `pnpm typecheck` -> exit 0 (4 workspaces Done); `pnpm lint` -> exit 0 (38 warnings, 0 errors); `pnpm test` -> exit 0 (shared 20, desktop 6, mobile 16, web 113 files, all green)
- [x] `bash .github/scripts/check-doc-links.sh` — exits 0
  evidence: `All internal Markdown links resolve.`, exit 0 (re-run after the AGENTS.md reference re-pointing)

## Evidence

- Owner decision (2026-11-26): the root `AGENTS.md` guide is untracked — the ledger moved to `docs/spec-ledger.md`, `AGENTS.md` was slimmed to a 4,806-byte rules index, `git rm --cached AGENTS.md` + a local exclude entry keep the working copy on disk for local tooling, and a copy lives at `masarx-ops/AGENTS.md`. Old commits still contain the file (no history rewrite).
- `scripts/check-spec-prefixes.mjs` was tightened per review: a frozen number now also fails when it gains a third directory (`FROZEN_DUPLICATE_LIMIT = 2`); verified with the two negative controls above.
- Heavy untracked folders re-measured for the owner: `masarx-video-ad` 442.10 MB (the others from the card's earlier measurement are gone). Nothing was deleted.

## Rollback

Restore modified config/doc/manifest files via `git checkout` and re-run `pnpm install` if `pnpm-lock.yaml` was updated.

## Open questions

- None
