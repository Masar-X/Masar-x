---
id: T-002
title: "Require all CI checks and strict ruleset policy"
priority: P0
status: done
depends_on:
  - T-001
touches:
  - ".github/RULESET.md"
owner_action: true
area: ci
estimate: 0.25d
---

## Context

Facts as read on 2026-11-25:

- `.github/RULESET.md` and the live ruleset (`gh api repos/Masar-X/Masar-x/rulesets/20299668`) enforce 7 status checks: `Vercel`, `ESLint`, `next build`, `ai-endpoint-grep`, `gitleaks-artifacts`, `e2e`, and `workflow-lint`, with `strict_required_status_checks_policy: false`.
- `.github/workflows/ci.yml` defines 14 jobs. The 6 to promote use the exact `name:` values `workspaces` (`ci.yml:115`), `test` (`ci.yml:345`), `mobile` (`ci.yml:400`), `deno-check` (`ci.yml:517`), `docs-lint` (`ci.yml:306`) and `deps-audit (critical gate)` (`ci.yml:582`; job ID `deps-audit` at `:581`).
- `ci.yml:3-7` triggers on `pull_request` and `push` to `main` with no `paths:` filters, and none of the 14 jobs has a job-level `if:`, so no candidate required job can be skipped and leave a PR waiting.
- Across the 10 `main` CI runs from 2026-11-22 to 2026-11-23 (`45043921655`, `45048656678`, `45055631032`, `45057522480`, `45060892539`, `45073059936`, `45077445370`, `45078374902`, `45086452278`, `45086856930`), the `e2e` job passed 8/10 and failed 2/10 (`45057522480`, `45078374902`, the only failing job in both). `e2e` stays required: it is the only Playwright end-to-end gate. The intermittent failure is tracked separately.
- Live ruleset, admin `GET` (`updated_at` 2026-11-25T18:42:13+02:00): 6 rules (`deletion`, `required_linear_history`, `pull_request`, `required_status_checks`, `required_signatures`, `non_fast_forward`), `bypass_actors: []`, `current_user_can_bypass: never`.
- The `RULESET.md` on `main` was out of date in two places: it listed three rules that are not on the ruleset (`required_deployments`, `code_scanning`, `copilot_code_review`) and three bypass actors. Both are corrected here.
- Correction to this card's earlier text: it said a non-admin token hides `bypass_actors`. The token in use is the owner's admin token, so the empty array is the real state. What matters for the update is simpler: a `PUT` replaces the whole ruleset, so it has to start from a fresh admin `GET`.

## Goal

Ruleset `20299668` requires `test`, `workspaces`, `mobile`, `deno-check`, `deps-audit (critical gate)` and `docs-lint` alongside the existing 7 (keeping `e2e`), with `strict_required_status_checks_policy: true`, and `.github/RULESET.md` stays true to the live state. The ruleset write is the owner's step (#312); this card delivers the document and the exact commands.

## Non-goals

- Modifying CI job definitions in `.github/workflows/ci.yml` (covered by `T-006a` and `T-007`).
- Promoting `db-verify` before 1 green week post-`T-006a`, or requiring report-only workflows (`fallow-audit (report-only)` in `.github/workflows/fallow.yml`, `lighthouse` in `.github/workflows/lighthouse.yml`).

## Steps

1. [done] `.github/RULESET.md` mirrors the live ruleset (7 checks, strict policy off, the 6 live rules, no bypass actors) and lists the 6 checks to promote in a section marked pending, with the target strict policy.
2. [done] Runbook published on #312: fresh admin `GET`, change only `required_status_checks`, review the diff, owner `PUT`.
3. [done] The PR references #312 (`Refs`, not `Closes`); the Issue carries `needs: owner` and stays open until the ruleset is updated.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] `.github/RULESET.md` lists the exact check names of the 6 to promote and the target strict policy, apart from the live 7.
  evidence: `grep -n "Pending change\|^| \`workspaces\`\|^| \`test\`\|^| \`mobile\`\|^| \`deno-check\`\|^| \`docs-lint\`\|^| \`deps-audit (critical gate)\`" .github/RULESET.md` -> `48:### Pending change (T-002, tracked in #312)` and the six rows at lines 58-63; line 42 reads `- \`strict_required_status_checks_policy\`: \`false\`` (live) and the pending block says it becomes \`true\`.
- [x] The live part of `.github/RULESET.md` matches the live ruleset.
  evidence: `gh api repos/Masar-X/Masar-x/rulesets/20299668` (admin, 2026-11-25) -> required contexts `Vercel`, `next build`, `ESLint`, `ai-endpoint-grep`, `gitleaks-artifacts`, `e2e`, `workflow-lint`; `strict_required_status_checks_policy: false`; rule types `deletion`, `required_linear_history`, `pull_request`, `required_status_checks`, `required_signatures`, `non_fast_forward`; `bypass_actors: []`; `current_user_can_bypass: never`.
- [x] #312 carries the `needs: owner` label and the runbook.
  evidence: `gh issue view 312 --json state,labels,comments` -> `state: OPEN labels: needs: owner, priority: P0, area: ci comments: 1`; the comment is the runbook (fresh `GET`, diff check, `PUT`).
- [ ] `gh api repos/Masar-X/Masar-x/rulesets/20299668 --jq '.rules[] | select(.type=="required_status_checks") | .parameters'` shows `strict_required_status_checks_policy: true` and 13 contexts.
- [ ] `bash .github/scripts/check-doc-links.sh` exits 0 and CI `workflow-lint` passes. (Local half done, see Evidence; the CI half is ticked once the run on this PR's head reports.)

## Evidence

- `bash .github/scripts/check-doc-links.sh` -> `All internal Markdown links resolve.`, `doclinks exit=0`.
- `node scripts/tasks.mjs lint` -> `tasks:lint OK (24 card(s) checked)`, exit 0.
- `gh run view 45643236102` (`4c664fd`, 2026-11-25T15:16:09Z): all 13 jobs `success`, before `db-verify` was added.
- `e2e` history: `gh run view <id> --json jobs` for each of the 10 runs listed under Context; `45086452278` and `45086856930` are whole-run failures on the `test` job with `e2e` `success`.
- Not run here: the ruleset `PUT`. It needs owner admin credentials and is the owner step in #312.

## Rollback

Revert the PR. The ruleset is untouched until the owner applies #312; its rollback is described there.

## Open questions

- Should `translations` (`ci.yml:329`) be promoted as well? Not in this change: the Goal names exactly the six checks above and the runbook adds only those. Promoting it later is a one-line addition to the same runbook.
