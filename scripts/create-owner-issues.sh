#!/usr/bin/env bash
#
# T-008 - create the owner-owed GitHub issues on Masar-X/Masar-x.
#
# DRY-RUN by default: prints every gh issue create command and its body
# without touching GitHub. Pass --apply to actually create the issues.
# --apply is intended for the OWNER only (docs/tasks/README.md:
# owner_action cards wait for the "owner step done" comment; agents never
# run --apply).
#
# Sources audited (card docs/tasks/T-008-owner-owes-issues.md):
#   AGENTS.md ledger rows 57, 65, 75, 77, 80, 81 (row 72 / spec 047 was
#   stale - "owner owes merge" on an already-merged row - removed in PR)
#   specs/018_mobile_launch_readiness/tasks.md  (Owner actions, post-merge)
#   specs/019_mobile_parity/tasks.md            (Owner actions, post-C7)
#   specs/020_mobile_polish/tasks.md            (Owner actions, post-C5)
#   specs/014-desktop-launch-readiness/spec.md  (:6 standing owner actions)
#   specs/028-desktop-crashpad-logs/spec.md     (:9 remote submission decision)
#   specs/052-faculty-white-label/spec.md       (:15 - dedupes into issue 4)
#   specs/009_mvp-launch-ops-hardening/tasks.md (:21 - 4.2/4.3 owner-assisted)
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

# Every issue is framed "Verify if still open" so the owner can immediately
# close anything already resolved (card step 1).
issue() {
  title="$1"
  body="$2"
  if [ "$APPLY" -eq 1 ]; then
    gh issue create --repo "$REPO" --title "$title" --label "owner-action" --body "$body"
  else
    echo "[DRY-RUN] gh issue create --repo \"$REPO\" --label owner-action"
    echo "TITLE: $title"
    echo "--- BODY ---"
    printf '%s\n' "$body"
    echo "------------"
    echo
  fi
}

issue "Owner: newer «طبعة (نهائي)» الشعبة-tab sheet for the /schedules data swap (spec 034)" "$(cat <<'ISSUE_EOF'
Created by "scripts/create-owner-issues.sh" (task card T-008).
**Verify if still open** - close immediately if already resolved.

The owner's newer «طبعة (نهائي)» الشعبة-tab sheet still needs to be extracted and swapped into the static /schedules timetable data (the weekly cohort timetables shipped by spec 034 / PR #180 are the older extraction).

Source: AGENTS.md ledger row [034-subjects-schedules] (line 57).
ISSUE_EOF
)"

issue "Owner: set SEND_EMAIL_HOOK_SECRET (auth email hook secret - spec 040-review-remediation / T-004)" "$(cat <<'ISSUE_EOF'
Created by "scripts/create-owner-issues.sh" (task card T-008).
**Verify if still open** - close immediately if already resolved.

SEND_EMAIL_HOOK_SECRET for the Supabase auth email hook is still owed in production (owner action recorded when spec 040-review-remediation landed; cross-referenced by task card T-004 / PR #333).

Source: AGENTS.md ledger row [040-review-remediation] (line 65).
ISSUE_EOF
)"

issue "Owner: redeploy the ai-chat edge function (edge-side changes from specs 050 + 055)" "$(cat <<'ISSUE_EOF'
Created by "scripts/create-owner-issues.sh" (task card T-008).
**Verify if still open** - close immediately if already resolved.

The ai-chat edge function needs a redeploy to pick up edge-side changes from:
- spec 050 (Zane prompt-injection hardening) - merged 2026-11-16;
- spec 055 (AiRequest.context.facultyId contract key + resolveAiChatPlatformName allowlist) - merged 2026-11-21.

Edge functions are owner-owned. Folded follow-up from the same 055 row: when roadmap doc 02 lands anu-x, write promptPlatformName ("ANU-X" / "انيو اكس") + one edge id-map entry.

Source: AGENTS.md rows [050-zane-prompt-injection-hardening] (line 75) + [055-brand-string-sweep] (line 80) - merged into one issue per T-008 step 1.
ISSUE_EOF
)"

issue "Owner: BIS preset real naming + faculty stack provisioning (spec 052)" "$(cat <<'ISSUE_EOF'
Created by "scripts/create-owner-issues.sh" (task card T-008).
**Verify if still open** - close immediately if already resolved.

(a) Real naming for the "bis" faculty preset placeholder in packages/shared/src/branding/faculties.ts.
(b) The faculty stack: a new Supabase project + a new Vercel project configured with NEXT_PUBLIC_FACULTY=fcai-asnu and its own NEXT_PUBLIC_SITE_URL.

(The GitHub-transfer owner action from the same spec section is already done - the repo is at Masar-X/Masar-x.)

Source: AGENTS.md row [052-faculty-white-label] (line 77) + specs/052-faculty-white-label/spec.md:15.
ISSUE_EOF
)"

issue "Owner triage: detectSessionInUrl auto-exchanges the PKCE recovery code at /reset-password (spec 056)" "$(cat <<'ISSUE_EOF'
Created by "scripts/create-owner-issues.sh" (task card T-008).
**Verify if still open** - close immediately if already resolved.

On web, Supabase JS detectSessionInUrl auto-exchanges the recovery code when /reset-password loads, so the page's own submit exchange can never succeed - real users likely hit expiredLinkError after entering a new password. The desktop client sets detectSessionInUrl:false and is unaffected.

Triage: decide the fix (detectSessionInUrl:false on web + an explicit exchange path, or equivalent) and verify against prod.

Source: AGENTS.md row [056-web-e2e-gap-close] (line 81).
ISSUE_EOF
)"

issue "Owner decisions: desktop Authenticode signing, Crashpad remote submission, mac targets (specs 014 + 028)" "$(cat <<'ISSUE_EOF'
Created by "scripts/create-owner-issues.sh" (task card T-008).
**Verify if still open** - close immediately if already resolved.

Standing desktop owner decisions:
(a) Authenticode signing (EV cert). When enabled: re-enable the signing block in apps/desktop/electron-builder.yml (verifyUpdateCodeSignature: true) and flip autoDownload/autoInstallOnAppQuit back to true in apps/desktop/src/main/updater.ts, per the T-005 note in both files.
(b) Crashpad remote submission - local-only by owner decision; a remote endpoint/Sentry remains undecided.
(c) mac targets - Windows-only pipeline by design.

Source: specs/014-desktop-launch-readiness/spec.md:6 + specs/028-desktop-crashpad-logs/spec.md:9.
ISSUE_EOF
)"

issue "Owner: mobile store launch ops - EAS init/secrets/builds, store listings, submit, device smoke (specs 018-020)" "$(cat <<'ISSUE_EOF'
Created by "scripts/create-owner-issues.sh" (task card T-008).
**Verify if still open** - close immediately if already resolved.

Mobile launch checklist from the specs 018/019/020 owner-action sections:
- eas init, projectId into eas.json; repo secret EXPO_TOKEN if CI builds are wanted
- EAS secrets for EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
- eas build --profile production -p android (AAB) and -p ios (IPA) on a macOS-capable EAS worker (cloud-side)
- Google Play Console / App Store Connect accounts, listings, screenshots, privacy policy, then submit
- Device smoke of v0.6.1: login, subjects, summaries, quiz, AI chat (bearer fix), language switch

Already-stale sub-items to close if resolved: spec 020's "push the fast-forwarded main" (main has long moved past 720b79a) and spec 019's "approve C2-C7 execution" (C1-C7 all landed).

Source: specs/018_mobile_launch_readiness/tasks.md:35, specs/019_mobile_parity/tasks.md:46, specs/020_mobile_polish/tasks.md:29.
ISSUE_EOF
)"

issue "Owner-assisted runbook checks: AI chat prod round-trip + admin demotion propagation (spec 009 4.2-4.3)" "$(cat <<'ISSUE_EOF'
Created by "scripts/create-owner-issues.sh" (task card T-008).
**Verify if still open** - close immediately if already resolved.

Two owner-assisted runbook checks left unchecked in spec 009:
- 4.2 AI chat round-trip + rate-limit rejection in prod (expected via Puter fallback); record in checklist
- 4.3 admin demotion propagation test; record in checklists/role-propagation.md

Source: specs/009_mvp-launch-ops-hardening/tasks.md:21.
ISSUE_EOF
)"

if [ "$APPLY" -eq 1 ]; then
  echo "Created 8 issues on $REPO."
else
  echo "DRY-RUN complete - 8 issues would be created on $REPO. Re-run with --apply to create them."
fi
