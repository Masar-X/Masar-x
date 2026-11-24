# Task Board Protocol

Single-source task cards (`T-XXX-<slug>.md`). **Never commit `BOARD.md` or any generated status file.** Run `pnpm tasks:status` to view live state.

## Derived Statuses (never hand-edited)

Frontmatter `status` may only be `todo` or `done` (set `status: done` only in the card's finishing PR). Live status is derived from git/GitHub:

- `todo` — no remote branch `task/T-XXX` and all `depends_on` are `done` (`waiting-deps` when blocked by unmet `depends_on`)
- `doing` — remote branch `refs/heads/task/T-XXX` exists and no open PR
- `review` — open PR from `task/T-XXX` (without `blocked` / `owner-action`)
- `blocked` — open PR or issue has label `blocked` or `owner-action`
- `done` — card on `main` has `status: done`

## Branch, Worktree & Claim Rules

- **One session = one card = one branch = one PR.** Split cards larger than ~1 day before starting.
- **Fixed branch name:** `task/T-XXX` (no slug).
- **Worktree isolation (I14):** work only in `../masarx-wt/task-T-XXX`; never edit in the primary checkout.
- **Atomic claim before any work:** always run `pnpm tasks:next` (never pick cards manually).
  - Creates `refs/heads/task/T-XXX` on `origin` via `gh api`; HTTP `422` collision automatically retries the next eligible card.
  - Enforces `wip_limit = 3` across `doing + review` (`--force` is **owner-only**).
  - Skips cards whose `touches` paths/globs overlap any active `doing` or `review` card.
  - Preview without claiming via `pnpm tasks:next --dry-run`.

## Evidence & `owner_action` Rules

- **Evidence rule:** Acceptance criteria are `- [ ]` items. Check an item `- [x]` **only** when the immediately following line is `evidence: <command and real output, or PR comment link>`. Enforced by `pnpm tasks:lint`.
- **`owner_action: true` cards** (secrets, GitHub settings): prepare exact commands/instructions in the PR, apply label `owner-action`, and stop for the owner.

## Stale Claims & Validation

- **Stale claim:** no push for 24h and no open PR = releasable by the **owner** via `pnpm tasks:release T-XXX`.
- **Commands:** `pnpm tasks:status`, `pnpm tasks:next [--dry-run]`, `pnpm tasks:lint`, `pnpm tasks:test`, `pnpm tasks:sync-issues [--apply]` (owner-only `--apply`).
