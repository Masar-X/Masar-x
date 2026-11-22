import { describe, expect, it } from "vitest";

import { hasInvalidQuestionOptions } from "../quizFormValidation";

describe("hasInvalidQuestionOptions (#278 H12/H13)", () => {
  it("accepts clean option sets", () => {
    expect(
      hasInvalidQuestionOptions([
        { options: ["a", "b", "c"], correctAnswer: 1 },
      ]),
    ).toBe(false);
  });

  it("rejects empty option text (an empty selected option grades correct)", () => {
    expect(
      hasInvalidQuestionOptions([
        { options: ["a", "", "c"], correctAnswer: 0 },
      ]),
    ).toBe(true);
    expect(
      hasInvalidQuestionOptions([{ options: ["a", "   "], correctAnswer: 0 }]),
    ).toBe(true);
  });

  it("rejects duplicate options (trim + case-insensitive)", () => {
    expect(
      hasInvalidQuestionOptions([{ options: ["a", "a"], correctAnswer: 0 }]),
    ).toBe(true);
    expect(
      hasInvalidQuestionOptions([
        { options: ["Alpha", " alpha "], correctAnswer: 0 },
      ]),
    ).toBe(true);
    expect(
      hasInvalidQuestionOptions([
        { options: ["Alpha", "alpha"], correctAnswer: 0 },
      ]),
    ).toBe(true);
  });

  it("rejects a correct-answer index outside the option list", () => {
    expect(
      hasInvalidQuestionOptions([{ options: ["a", "b"], correctAnswer: 2 }]),
    ).toBe(true);
    expect(
      hasInvalidQuestionOptions([{ options: ["a", "b"], correctAnswer: -1 }]),
    ).toBe(true);
  });

  it("rejects a question with no options at all", () => {
    expect(
      hasInvalidQuestionOptions([{ options: [], correctAnswer: 0 }]),
    ).toBe(true);
  });
});
