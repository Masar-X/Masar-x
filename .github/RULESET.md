# Branch Protection Ruleset

This document is a **human-readable snapshot** of the active branch protection
[Ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
for the `main` branch on `Masar-X/Masar-x`. The actual source of truth
lives in the GitHub UI / API (Rulesets are not stored in the repo).

> **Ruleset ID:** `20299668` &nbsp;·&nbsp; **Name:** `Main Branch Protection` &nbsp;·&nbsp; **Enforcement:** `active` &nbsp;·&nbsp; **Target:** `refs/heads/main`

> If you change a rule in the GitHub UI, please update this file in the same
> PR that triggered the change so the docs stay in sync.

---

## Required status checks

A pull request into `main` is blocked from merging until all of the following
checks report `success` from the latest commit on the PR head:

| Check name    | Source                                | Notes |
|---------------|---------------------------------------|-------|
| `Vercel`      | Vercel GitHub App (integration `8329`) | Production build + preview deploy |
| `ESLint`      | GitHub Actions — workflow `CI` (`ESLint` job) | Lint via `pnpm lint` |
| `next build`  | GitHub Actions — workflow `CI` (`next-build` job) | Build via `pnpm build` (with placeholder env vars) |
| `ai-endpoint-grep` | GitHub Actions — workflow `CI` (`ai-endpoint-grep` job) | Spec 004 T014 — no direct AI provider endpoints |
| `gitleaks-artifacts` | GitHub Actions — workflow `CI` (`gitleaks-artifacts` job) | Secret scan on the built bundle |
| `e2e` | GitHub Actions — workflow `CI` (`e2e` job) | Playwright public study-flow smoke (Spec 010 / MVP report G6.1) |
| `workflow-lint` | GitHub Actions — workflow `CI` (`workflow-lint` job) | actionlint over `.github/workflows/` + shellcheck on inline run scripts |
| `workspaces` | GitHub Actions — workflow `CI` (`workspaces` job) | Workspace linking + react/react-dom version parity + cross-workspace typecheck |
| `test` | GitHub Actions — workflow `CI` (`test` job) | Vitest coverage suites for web / desktop / mobile / shared |
| `mobile` | GitHub Actions — workflow `CI` (`mobile` job) | Mobile ESLint + `expo export` bundle proof |
| `deno-check` | GitHub Actions — workflow `CI` (`deno-check` job) | `deno check` + offline unit tests for Supabase edge functions |
| `docs-lint` | GitHub Actions — workflow `CI` (`docs-lint` job) | markdownlint on root docs + `.github/scripts/check-doc-links.sh` |
| `deps-audit (critical gate)` | GitHub Actions — workflow `CI` (`deps-audit` job) | `pnpm audit --prod --audit-level=critical`; job ID `deps-audit` emits context `deps-audit (critical gate)` |

> **Both `e2e` and `workflow-lint` were added by the owner via the GitHub UI on
> 2026-09-20** and verified via `gh api repos/Masar-X/Masar-x/rulesets/20299668`
> (enforcement `active`, 13 required contexts total). Background: the agent-side
> ruleset PATCH path is a proven token-class dead end (404 with classic `repo`
> scope, 2026-09-17 and 2026-09-19). The `workflow-lint` gate catches unparseable
> workflow YAML on the introducing PR (the failure class that left Lighthouse
> silently broken; see MVP report pass 5/6) — proven 2026-09-19 against the actual
> pre-fix `lighthouse.yml` (`d2b4e3a^`).

> **Promotion (T-002, 2026-11-25):** 6 more contexts became required alongside the
> original 7 — `workspaces`, `test`, `mobile`, `deno-check`, `docs-lint`,
> `deps-audit (critical gate)` (job ID `deps-audit`) — via the owner `PUT` on
> ruleset `20299668`, with `strict_required_status_checks_policy` set to `true`.
> All 13 CI jobs were green on `main` run `45643236102` at promotion time.
> `db-verify` (once introduced by T-006a) stays non-required until it has 1
> green week on `main`; report-only jobs (`fallow-audit (report-only)` and
> `lighthouse`) also stay non-required.

- `strict_required_status_checks_policy`: `true` — a PR head that is not
  up to date with `main` is blocked from merging until it is re-based; the
  required checks must all resolve on the updated head (T-002 owner `PUT`,
  2026-11-25).
- `do_not_enforce_on_create`: `false` — the rule is enforced on the initial
  push that creates a matching branch.

---

## Other active rules

| Rule                          | Setting |
|-------------------------------|---------|
| `deletion`                    | Enabled — `main` cannot be deleted. |
| `non_fast_forward`            | Enabled — force pushes to `main` are blocked. |
| `required_linear_history`     | Enabled — merges must be linear (squash or rebase). |
| `required_signatures`         | Enabled — commits must be GPG/SSH signed. |
| `required_deployments`        | Required deployment environment: `Preview`. |
| `code_scanning`               | Tool: `CodeQL`, alerts threshold: `errors`, security alerts: `high_or_higher`. |
| `copilot_code_review`         | `review_on_push: false`, `review_draft_pull_requests: false`. |
| `pull_request`                | `required_approving_review_count: 0`, `dismiss_stale_reviews_on_push: true`, `required_review_thread_resolution: true`, `require_extra_approval_for_unattributed_changes: true`, allowed merge methods: `merge`, `squash`, `rebase`. |

---

## Bypass actors

The following can bypass any rule:

| Actor                                              | Mode     |
|----------------------------------------------------|----------|
| RepositoryRole `5` (Admin / Maintainer)            | `always` |
| Integration `8329` (Vercel GitHub App)             | `always` |
| Integration `347564` (CodeRabbit)                  | `always` |

---

## How to update this file

1. Apply the change via the GitHub UI **or** `gh api`:
   ```bash
   # Example: get current
   gh api repos/Masar-X/Masar-x/rulesets/20299668

   # Example: update (PUT full ruleset body)
   gh api --method PUT \
       repos/Masar-X/Masar-x/rulesets/20299668 \
       --input ruleset.json
   ```
2. Update this file to mirror the new state.
3. Open a PR titled `chore(ruleset): <short description>` so the change has an
   audit trail.
