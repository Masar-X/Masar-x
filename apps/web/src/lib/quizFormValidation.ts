/**
 * Issue #278 (bug-audit wave-04 H12/H13) — authoring-side guard for the
 * quiz form's option grid. Grading is index-based, so an empty selected
 * option would grade "correct" and duplicate options make the correct
 * answer ambiguous. The QuizFormModal save button disables while this
 * reports true.
 */

export interface QuizOptionValidationQuestion {
  options: string[];
  correctAnswer: number;
}

export function hasInvalidQuestionOptions(
  questions: ReadonlyArray<QuizOptionValidationQuestion>,
): boolean {
  return questions.some((q) => {
    const trimmed = (q.options ?? []).map((o) => (o ?? "").trim());
    // No empty option text (an empty selected option grades correct).
    if (trimmed.some((o) => o.length === 0)) return true;
    // No duplicate options (trim + case-insensitive).
    if (new Set(trimmed.map((o) => o.toLowerCase())).size !== trimmed.length) {
      return true;
    }
    // The correct-answer index must point at a real option.
    return !(q.correctAnswer >= 0 && q.correctAnswer < trimmed.length);
  });
}
