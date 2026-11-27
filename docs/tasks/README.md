# Task Board Protocol

Single-source task cards (`T-XXX-<slug>.md`). **Never commit `BOARD.md` or any generated status file.** Run `pnpm tasks:status` to view live state.

## Derived Statuses (never hand-edited)

Frontmatter `status` may only be `todo` or `done` (set `status: done` only in the card's finishing PR). Live status is derived from git/GitHub:

- `todo` — no remote branch `task/T-XXX` and all `depends_on` are `done` (`waiting-deps` when blocked by unmet `depends_on`)
- `doing` — remote branch `refs/heads/task/T-XXX` exists and no open PR
- `review` — open PR from `task/T-XXX`
- `blocked` — a branch or PR exists and the card's Issue carries `needs: owner`: the owner step is still pending. Informational only; it never prevents a merge
- `done` — card on `origin/main` has `status: done` (`tasks:status` and `tasks:next` read `done` state from `origin/main`, falling back locally only before `docs/tasks/` exists on `origin/main`)

## Branch, Worktree & Claim Rules

- **One task = one card = one branch = one PR.** Split cards larger than ~1 day before starting.
- **Fixed branch name:** `task/T-XXX` (no slug).
- **Worktree isolation (I14):** work only in `../masarx-wt/task-T-XXX`; never edit in the primary checkout.
- **Atomic claim before any work:** always run `pnpm tasks:next` (never pick cards manually).
  - Creates `refs/heads/task/T-XXX` on `origin` via `gh api`; HTTP `422` collision automatically retries the next eligible card.
  - Enforces `wip_limit = 3` across `doing + review` (`--force` is **owner-only**).
  - Skips cards whose `touches` paths/globs overlap any active `doing`, `review`, or `blocked` card (while `wip_limit = 3` counts `doing + review`).
  - Preview without claiming via `pnpm tasks:next --dry-run`.

## Labels

- `priority: P0|P1|P2` and `area: <name>` come from the card frontmatter; `sync-issues` applies them to the Issue.
- `needs: owner` goes on the **Issue** of a card with a pending owner step, never on a PR.
- `sync-issues` creates any missing label (`needs: owner`, priority, area) before creating issues.

## Evidence & `owner_action` Rules

- **Evidence rule:** Acceptance criteria are `- [ ]` items. Check an item `- [x]` **only** when the immediately following line is `evidence: <command and real output, or PR comment link>`. Enforced by `pnpm tasks:lint`.
- **`owner_action: true` cards** (secrets, deploys, GitHub settings): the PR prepares the exact commands, uses `Refs #N` (never `Closes`), and merges like any other PR once its gates pass. Merging changes no GitHub setting and deploys no Edge Function, but it does ship `main` to Vercel, so whatever the change needs at build or run time has to be in place first. Only steps a merge cannot trigger stay with the owner: they live in the linked Issue as a checkbox runbook labeled `needs: owner`, and the Issue stays open until the owner finishes them.

## Stale Claims & Validation

- **Stale claim:** no push for 24h and no open PR = releasable by the **owner** via `pnpm tasks:release T-XXX`.
- **Commands:** `pnpm tasks:status`, `pnpm tasks:next [--dry-run]`, `pnpm tasks:lint`, `pnpm tasks:test`, `pnpm tasks:sync-issues [--apply]` (owner-only `--apply`).
