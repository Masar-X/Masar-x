# Inventory — checklists in `.specify/` and `.github/`

Read-only analysis (card T-017c) of every unchecked `- [ ]` item under `.specify/` and `.github/`. Enumeration 2026-11-27, worktree at `main` `a9e329d`. No file inside either tree was edited.

Scan command and result:

```
rg --no-ignore -n "^\s*- \[ \]" .specify .github
```

58 items across 4 files. Every item is classified below by status (`already-done` / `stale` / `duplicate-of-card` / `unverified` / `real`) and type (`work-item` / `procedure`).

Scan gotcha, verified this pass and worth remembering: a plain `rg -n "^\s*- \[ \]" .specify .github` returns **0 matches** in this repo. `.gitignore:208-225` ignores `.github/*` (with an allowlist for `FUNDING.yml`, `dependabot.yml`, `workflows/`, `scripts/`, `RULESET.md`) and `.specify` (`:225`), while all 23 files under the two trees are tracked in git (`git ls-files .specify .github` = `rg --no-ignore --files .specify .github` = 23). Scans here need `--no-ignore`, or `git grep -n -- .specify .github`.

Scope: markdown `- [ ]` items only. Of the 10 markdown files under the two trees, only the 4 tabulated below carry `- [ ]` items. Zero checked `- [x]` items exist anywhere under either tree (`rg --no-ignore -n "^\s*- \[[xX]\]" .specify .github` → no matches).

Status semantics (same as `INVENTORY-specs.md` and `INVENTORY-docs.md`):

- `already-done` — verified against the current tree, evidence cited.
- `stale` — not applicable as real work in the current tree (superseded, deprecated, or placeholder boilerplate), evidence cited.
- `duplicate-of-card` — covered by an existing `T-001`..`T-019` card. None found here.
- `unverified` — current truth not established in this pass; for GitHub templates this means the item is evaluated per PR / per issue by its author, not now.
- `real` — still outstanding, verified against the current tree. None found here.

Items matching `"owner owes..."` are routed to `T-008` and not duplicated here.

## Count Summary

| Type | already-done | stale | duplicate-of-card | unverified | real | Total |
|---|---|---|---|---|---|---|
| work-item | 0 | 0 | 0 | 0 | 0 | 0 |
| procedure | 0 | 40 | 0 | 18 | 0 | 58 |
| **Total** | **0** | **40** | **0** | **18** | **0** | **58** |

Excluded-from-detail note: the 40 `stale` procedure items are SpecKit template placeholders (`.specify/templates/tasks-template.md` 34 + `.specify/templates/checklist-template.md` 6), recorded as **one consolidated `procedure/template` row** below instead of 40 fake work items.

Routed to `T-008` (`owner owes...` items): **0** (`rg -in "owner owes" .specify .github` → no matches).

## Per-file counts

| File | Items | Type |
|---|---|---|
| `.specify/templates/tasks-template.md` | 34 | procedure/template (boilerplate) |
| `.specify/templates/checklist-template.md` | 6 | procedure/template (boilerplate) |
| `.github/PULL_REQUEST_TEMPLATE.md` | 13 | procedure |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 5 | procedure |

Markdown files scanned with **zero** checkbox items: `.github/RULESET.md` (human-readable snapshot of the `main` branch-protection ruleset), `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/config.yml` (contact links only), `.specify/memory/constitution.md`, `.specify/templates/constitution-template.md`, `.specify/templates/plan-template.md`, `.specify/templates/spec-template.md`. The remaining tracked files (`.github/scripts/*.sh`, `.github/workflows/*.yml`, JSON manifests) are CI-enforced procedures or config, not markdown checklists — out of scope for this scan.

## work-item

None. Every unchecked item under `.specify/` and `.github/` is template scaffolding or a per-PR / per-issue selection — `procedure` by definition. No unfinished repository work was found in either tree, so this table has no rows and this inventory proposes no card candidates.

## procedure

### `.specify/templates/*.md` — SpecKit boilerplate (40 items, one consolidated row)

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `.specify/templates/tasks-template.md:52-54,66-71,87-88,92-97,111-112,116-119,133-134,138-140,154-159` (34 items) + `.specify/templates/checklist-template.md:25-27,31-33` (6 items) | SpecKit scaffolding placeholders (`T001 Create project structure...`, `CHK001 First checklist item...`, bracket placeholders like `[language]`, `[framework]`, `[Entity]`) filled in by the `/speckit.*` commands when a feature is generated | stale — template boilerplate, recorded as one consolidated procedure/template row | none — SpecKit-managed via `.specify/integrations/speckit.manifest.json`; the repo has no generated feature dirs under `.specify/` (only `memory/` + `templates/`), so no placeholder refers to real work |

Evidence for the `stale` classification: `checklist-template.md:9-19` states "The checklist items below are SAMPLE ITEMS for illustration only ... DO NOT keep these sample items in the generated checklist file", and `tasks-template.md` items are bracketed template examples rather than repo-specific tasks.

### `.github/PULL_REQUEST_TEMPLATE.md` (13 items)

Rendered by GitHub on every new PR; each item is selected or checked by the PR author per PR, so `unverified` here by nature. Proposed target: **keep in `.github/`** — GitHub renders PR/issue templates only from `.github/`, so consolidating them under `docs/checklists/` would break that.

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `.github/PULL_REQUEST_TEMPLATE.md:12` | Type of change: bug fix | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:13` | Type of change: new feature | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:14` | Type of change: breaking change | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:15` | Type of change: refactor / internal cleanup | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:16` | Type of change: documentation only | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:30` | Test: `pnpm typecheck` | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:31` | Test: `pnpm lint` | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:32` | Test: `pnpm test` | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:33` | Test: manually verified in the running app | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:45` | Contributor: new env vars documented in `.env.example`, no real secrets committed | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:46` | Contributor: `packages/shared/` changes state cross-platform contract impact | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:47` | Contributor: spec-affecting changes update `specs/` | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md:48` | Contributor: Code of Conduct + Contributing guide read and followed | unverified | keep in `.github/PULL_REQUEST_TEMPLATE.md` |

### `.github/ISSUE_TEMPLATE/feature_request.md` (5 items)

"Affected surfaces" block rendered by GitHub on new feature requests; the reporter selects what the request touches, per issue.

| Source file:line | Summary | Status | Proposed target |
|---|---|---|---|
| `.github/ISSUE_TEMPLATE/feature_request.md:21` | Affected surface: Web | unverified | keep in `.github/ISSUE_TEMPLATE/feature_request.md` |
| `.github/ISSUE_TEMPLATE/feature_request.md:22` | Affected surface: Desktop | unverified | keep in `.github/ISSUE_TEMPLATE/feature_request.md` |
| `.github/ISSUE_TEMPLATE/feature_request.md:23` | Affected surface: Mobile | unverified | keep in `.github/ISSUE_TEMPLATE/feature_request.md` |
| `.github/ISSUE_TEMPLATE/feature_request.md:24` | Affected surface: Shared package (`packages/shared/`) | unverified | keep in `.github/ISSUE_TEMPLATE/feature_request.md` |
| `.github/ISSUE_TEMPLATE/feature_request.md:25` | Affected surface: Backend (Supabase schema / Edge Functions) | unverified | keep in `.github/ISSUE_TEMPLATE/feature_request.md` |

## Follow-up notes (no action taken here)

- `docs/checklists/` does not exist yet (same starting point as `INVENTORY-docs.md`). The PR-template test block (`:30-33`) overlaps `docs/agents/references/08-precommit.md:5-7` (typecheck / lint / test). If the owner later consolidates `docs/checklists/precommit.md`, the PR template could link it instead of restating the commands. Owner decision.
- When scanning these two trees in the future, use `rg --no-ignore` or `git grep`; the plain-`rg` zero-result gotcha described above is easy to misread as "no checklists here".
