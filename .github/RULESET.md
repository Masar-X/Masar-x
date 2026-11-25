# Branch Protection Ruleset

This document is a **human-readable snapshot** of the active branch protection
[Ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
for the `main` branch on `Masar-X/Masar-x`. The actual source of truth
lives in the GitHub UI / API (Rulesets are not stored in the repo).

> **Ruleset ID:** `20299668` &nbsp;·&nbsp; **Name:** `Main Branch Protection` &nbsp;·&nbsp; **Enforcement:** `active` &nbsp;·&nbsp; **Target:** `refs/heads/main`
>
> **Snapshot taken:** 2026-11-25 with `gh api repos/Masar-X/Masar-x/rulesets/20299668` (admin token)

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

> **Both `e2e` and `workflow-lint` were added by the owner via the GitHub UI on
> 2026-09-20** and verified via `gh api repos/Masar-X/Masar-x/rulesets/20299668`
> (enforcement `active`, 7 required contexts total — the same 7 as today).
> Background: writes to the ruleset need owner admin credentials; the classic
> `repo`-scope token gets `404` (2026-09-17 and 2026-09-19). The
> `workflow-lint` gate catches unparseable workflow YAML on the introducing PR
> (the failure class that left Lighthouse silently broken; see MVP report pass
> 5/6) — proven 2026-09-19 against the actual pre-fix `lighthouse.yml`
> (`d2b4e3a^`).

- `strict_required_status_checks_policy`: `false` — a missing check on a PR
  does not block the merge; the requirement is only enforced once a check
  has been reported.
- `do_not_enforce_on_create`: `false` — the rule is enforced on the initial
  push that creates a matching branch.

### Pending change (T-002, tracked in #312)

**Not applied yet.** On 2026-11-25 the live ruleset still had the 7 checks
above with the strict policy off. Applying the change below is a manual step
for the repository owner (#312); merging the PR that adds this section
changes nothing on GitHub. Once it is applied, move these rows into the table
above, set the strict policy line to `true` and delete this section.

| Check name    | Source                                | Notes |
|---------------|---------------------------------------|-------|
| `workspaces` | GitHub Actions — workflow `CI` (`workspaces` job) | Workspace linking + react/react-dom version parity + cross-workspace typecheck |
| `test` | GitHub Actions — workflow `CI` (`test` job) | Vitest coverage suites for web / desktop / mobile / shared |
| `mobile` | GitHub Actions — workflow `CI` (`mobile` job) | Mobile ESLint + `expo export` bundle proof |
| `deno-check` | GitHub Actions — workflow `CI` (`deno-check` job) | `deno check` + offline unit tests for Supabase edge functions |
| `docs-lint` | GitHub Actions — workflow `CI` (`docs-lint` job) | markdownlint on root docs + `.github/scripts/check-doc-links.sh` |
| `deps-audit (critical gate)` | GitHub Actions — workflow `CI` (`deps-audit` job) | `pnpm audit --prod --audit-level=critical`; job ID `deps-audit` emits context `deps-audit (critical gate)` |

- `strict_required_status_checks_policy` becomes `true`: a PR whose branch is
  behind `main` cannot merge until the branch is up to date with `main`
  (`git merge origin/main`; a pushed branch is never rebased), and every
  required check must pass again on the updated head.
- All 13 jobs were green on `main` run `45643236102` (`4c664fd`, 2026-11-25),
  before `db-verify` was added.
- Not promoted: `db-verify` (on `main` since #339) until it has one green
  week on `main`; the report-only jobs (`fallow-audit (report-only)`,
  `lighthouse`); `translations`.

---

## Other active rules

| Rule                          | Setting |
|-------------------------------|---------|
| `deletion`                    | Enabled — `main` cannot be deleted. |
| `non_fast_forward`            | Enabled — force pushes to `main` are blocked. |
| `required_linear_history`     | Enabled — merges must be linear (squash or rebase). |
| `required_signatures`         | Enabled — commits must be GPG/SSH signed. |
| `pull_request`                | `required_approving_review_count: 0`, `dismiss_stale_reviews_on_push: true`, `required_review_thread_resolution: true`, `require_extra_approval_for_unattributed_changes: true`, allowed merge methods: `merge`, `squash`, `rebase`. |

---

## Bypass actors

None. The live ruleset lists no bypass actors (`bypass_actors: []`,
`current_user_can_bypass: never` in the admin `GET` of 2026-11-25), so
administrators are held to the same rules.

---

## How to update this file

1. Apply the change through the API, always starting from a fresh read:

   ```bash
   # 1. Read the live ruleset with admin credentials and keep a copy.
   gh api repos/Masar-X/Masar-x/rulesets/20299668 > ruleset.before.json

   # 2. Change only the fields you intend to change and write ruleset.after.json.

   # 3. Review the difference. It must contain only the intended change.
   git diff --no-index ruleset.before.json ruleset.after.json

   # 4. Write it back.
   gh api --method PUT repos/Masar-X/Masar-x/rulesets/20299668 --input ruleset.after.json
   ```

   Never `PUT` a copy saved earlier or assembled from this document: a `PUT`
   replaces the whole ruleset, and a stale copy silently drops whatever
   changed since it was taken.
2. Update this file to mirror the new state.
3. Open a PR titled `chore(ruleset): <short description>` so the change has an
   audit trail.
