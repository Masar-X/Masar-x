/**
 * Lecture-content matching for the mobile subject-detail screen
 * (spec 019 C2/T078).
 *
 * The matcher itself lives in masarx-shared/lectures since T-012 — the
 * exact non-inference rules the web hook
 * (apps/web/src/hooks/useLectureContent.ts) applies before its web-only
 * title-inference fallback. This module re-exports it so mobile call
 * sites keep importing from lib/.
 */
export {
  groupContentByLecture,
  matchesLecture,
  resolveLectureKey,
} from "masarx-shared/lectures";
export type {
  LectureRef,
  MatchableRow,
} from "masarx-shared/lectures";
