# GitHub Project Setup (Owner-run only)

> **Owner-run only.** `gh project` setup commands and `pnpm tasks:sync-issues --apply` are run by the repository owner.

## 1. Create & Link Project

```bash
gh auth refresh -s project
gh project create --owner Masar-X --title "Masar X Tasks"
gh project link <PROJECT_NUMBER> --owner Masar-X --repo Masar-X/Masar-x
gh project view <PROJECT_NUMBER> --owner Masar-X --web
```

## 2. Board Layout & Built-in Workflows (Web UI)

1. Set default view layout to **Board** with Status columns: `Todo`, `In progress`, `In review`, `Done`.
2. Enable built-in **Workflows**:
   - **Pull request opened** -> set Status to `In review`
   - **Item closed** / **Pull request merged** -> set Status to `Done`

## 3. Sync Task Cards to Issues

```bash
pnpm tasks:sync-issues          # dry-run: preview label + gh issue create commands
pnpm tasks:sync-issues --apply  # owner-only: create missing labels and GitHub issues
```

Add created issues to the project board (`gh project item-add <PROJECT_NUMBER> --owner Masar-X --url <ISSUE_URL>`).
