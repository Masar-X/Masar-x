#!/usr/bin/env bash
#
# T-008 - create the owner GitHub issues that have no ticket yet.
#
# DRY-RUN by default: prints every gh issue create command and its body
# without touching GitHub. Pass --apply to actually create the issues.
# --apply is intended for the repository owner (tracked in #319).
#
# Items that already have a ticket are NOT re-created here; the AGENTS.md
# ledger rows point at them directly:
#   schedules data swap        -> #283
#   SEND_EMAIL_HOOK_SECRET     -> #289 (step-by-step runbook: #314)
#   Authenticode signing,
#   crashpad submission, BIS
#   preset naming              -> #289
#   detectSessionInUrl fix     -> #308 (this script only asks for the
#                                 production verification)
# As a safety net, any issue whose exact title already exists is skipped,
# so re-running the script can never duplicate an issue.
#
# Sources audited (card docs/tasks/T-008-owner-owes-issues.md):
#   AGENTS.md ledger rows 57, 65, 75, 77, 80, 81 (row 57 -> #283, row 65 ->
#   #289, row 81 -> #308; rows 75/80 are the ones this script files)
#   specs/050-zane-prompt-injection-hardening/plan.md (T4: ai-chat AND
#   summarize-chat)
#   specs/018_mobile_launch_readiness/tasks.md  (Owner actions, post-merge)
#   specs/019_mobile_parity/tasks.md            (Owner actions, post-C7)
#   specs/020_mobile_polish/tasks.md            (Owner actions, post-C5)
#   specs/009_mvp-launch-ops-hardening/tasks.md (:22-23 - 4.2/4.3 owner-assisted)
#
set -euo pipefail

REPO="Masar-X/Masar-x"
APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help) echo "usage: $0 [--apply]  (default: dry-run, prints commands only)"; exit 0 ;;
    *) echo "unknown argument: $arg (usage: $0 [--apply])" >&2; exit 2 ;;
  esac
done

# Snapshot of every existing issue title (open or closed), one
# "NUMBER<TAB>TITLE" line each. The duplicate check needs it in both modes:
# the dry run reports what --apply would skip, and --apply refuses to run
# without it rather than risk duplicates.
EXISTING="$(mktemp)"
trap 'rm -f "$EXISTING"' EXIT
if gh issue list --repo "$REPO" --state all --limit 1000 --json number,title \
     --jq '.[] | (.number|tostring) + "\t" + .title' > "$EXISTING"; then
  HAVE_EXISTING=1
else
  HAVE_EXISTING=0
  if [ "$APPLY" -eq 1 ]; then
    echo "error: could not list existing issues; refusing to --apply without the duplicate check" >&2
    exit 1
  fi
  echo "warning: could not list existing issues; the dry run cannot report duplicates" >&2
  : > "$EXISTING"
fi

CREATED=0
SKIPPED=0

# Every issue is framed "Verify if still open" so the owner can immediately
# close anything already resolved (card step 1).
issue() {
  local title="$1"
  local body="$2"
  local num=""
  if [ "$HAVE_EXISTING" -eq 1 ]; then
    num="$(awk -F'\t' -v t="$title" '$2 == t { print $1; exit }' "$EXISTING")"
  fi
  if [ -n "$num" ]; then
    echo "[SKIP] #$num already tracks this: $title"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi
  if [ "$APPLY" -eq 1 ]; then
    gh issue create --repo "$REPO" --title "$title" --label "needs: owner" --body "$body"
    CREATED=$((CREATED + 1))
  else
    echo "[DRY-RUN] gh issue create --repo \"$REPO\" --label \"needs: owner\""
    echo "TITLE: $title"
    echo "--- BODY ---"
    printf '%s\n' "$body"
    echo "------------"
    echo
    CREATED=$((CREATED + 1))
  fi
}

issue "redeploy the ai-chat and summarize-chat edge functions (edge-side changes from specs 050 + 055)" "$(cat <<'ISSUE_EOF'
**Verify if still open** - close immediately if already resolved.

The edge functions need a redeploy to pick up the edge-side changes already merged:
- ai-chat: spec 050 (systemInstruction on both Gemini sites, user-message framing) + spec 055 (context.facultyId contract key + platform-name allowlist).
- summarize-chat: spec 050 (per-message / sender-name / total input caps + conversation framing).

Verify first: #290 (2026-11-22 sweep) records the ai-chat redeploy as done, with no date recorded. Close this issue if both functions are current (deploy dates vs the spec merge dates: 050 = 2026-11-16, 055 = 2026-11-21).

Edge functions are deployed by hand. Folded follow-up from the same 055 row: when roadmap doc 02 lands anu-x, write the ANU-X promptPlatformName strings + one edge id-map entry.

Source: AGENTS.md rows [050-zane-prompt-injection-hardening] + [055-brand-string-sweep] - merged into one issue per T-008 step 1; summarize-chat from specs/050-zane-prompt-injection-hardening/plan.md (T4).
ISSUE_EOF
)"

issue "faculty stack provisioning - new Supabase + Vercel projects for the faculty deployment (spec 052)" "$(cat <<'ISSUE_EOF'
**Verify if still open** - close immediately if already resolved.

The faculty deployment needs its own backend and hosting: a new Supabase project and a new Vercel project configured with NEXT_PUBLIC_FACULTY=fcai-asnu and its own NEXT_PUBLIC_SITE_URL.

BIS preset official naming is tracked separately in #289 (the same decision gates ANU-X doc-02) and is not part of this issue.

Source: AGENTS.md row [052-faculty-white-label]; specs/052-faculty-white-label/spec.md.
ISSUE_EOF
)"

issue "Verify the reset-password recovery flow in production after #308 (spec 056)" "$(cat <<'ISSUE_EOF'
**Verify if still open** - close immediately if already resolved.

Spec 056 flagged that the web client's detectSessionInUrl auto-exchanged the recovery code when /reset-password loaded, so the page's own submit exchange could never succeed. #308 fixed it (detectSessionInUrl disabled at load; the reset page owns the exchange).

Verify in production: request a password recovery, open the emailed link, set a new password, and confirm the reset succeeds without an expired-link error. If it works, record the verification in the AGENTS.md ledger row [056-web-e2e-gap-close] and close this issue.

Source: AGENTS.md row [056-web-e2e-gap-close]; fix in #308.
ISSUE_EOF
)"

issue "mobile store launch ops - EAS init/secrets/builds, store listings, submit, device smoke (specs 018-020)" "$(cat <<'ISSUE_EOF'
**Verify if still open** - close immediately if already resolved.

Mobile launch checklist from the specs 018/019/020 owner-action sections:
- eas init, projectId into eas.json; repo secret EXPO_TOKEN if CI builds are wanted
- EAS secrets for EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
- eas build --profile production -p android (AAB) and -p ios (IPA) on a macOS-capable EAS worker (cloud-side)
- Google Play Console / App Store Connect accounts, listings, screenshots, privacy policy, then submit
- Device smoke of the current production build (0.7.0): login, subjects, quizzes, AI chat, language switch

Already-stale sub-items to close if resolved: spec 020's "push the fast-forwarded main" (main has long moved past 720b79a) and spec 019's "approve C2-C7 execution" (C1-C7 all landed).

Source: specs/018_mobile_launch_readiness/tasks.md:35, specs/019_mobile_parity/tasks.md:46, specs/020_mobile_polish/tasks.md:29.
ISSUE_EOF
)"

issue "Runbook checks in production: AI chat round-trip + admin demotion propagation (spec 009 4.2-4.3)" "$(cat <<'ISSUE_EOF'
**Verify if still open** - close immediately if already resolved.

Two owner-assisted runbook checks left unchecked in spec 009:
- 4.2 AI chat round-trip + rate-limit rejection in prod (expected via Puter fallback); record in checklist
- 4.3 admin demotion propagation test; record in checklists/role-propagation.md

Source: specs/009_mvp-launch-ops-hardening/tasks.md:22-23.
ISSUE_EOF
)"

echo
if [ "$APPLY" -eq 1 ]; then
  echo "Done: $CREATED issue(s) created, $SKIPPED skipped (already tracked) on $REPO."
else
  echo "DRY-RUN complete - $CREATED issue(s) would be created, $SKIPPED skipped (already tracked) on $REPO. Re-run with --apply to create them."
fi
