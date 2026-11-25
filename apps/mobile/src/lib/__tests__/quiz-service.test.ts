import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/mocks/supabase";

const store = vi.hoisted(() => new Map<string, string>());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    getAllKeys: vi.fn(async () => [...store.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) store.delete(key);
    }),
  },
}));

import {
  completeQuizAttempt,
  fetchQuizWithQuestions,
  finishAttempt,
  getGuestResult,
  listGuestResults,
  saveAnswer,
  saveGuestResult,
  startAttempt,
} from "../quiz";

beforeEach(() => {
  store.clear();
});

describe("fetchQuizWithQuestions", () => {
  it("maps quiz + ordered question rows to the player shape without selecting revoked answer key", async () => {
    const chain = createSupabaseMock();
    chain.respondWith(
      { data: { id: "q1", title: "T", description: "D", duration_seconds: 600 }, error: null },
      { table: "quizzes" },
    );
    chain.respondWith(
      {
        data: [
          { id: "qq1", quiz_id: "q1", question: "Q?", options: ["a", "b"], explanation: "e", image_url: null, order_index: 0 },
        ],
        error: null,
      },
      { table: "quiz_questions" },
    );

    const res = await fetchQuizWithQuestions(chain.supabase as never, "q1");
    expect(res.title).toBe("T");
    expect(res.durationSeconds).toBe(600);
    // Current mapping omits imageUrl entirely (parity gap noted in spec 022 §5).
    expect(res.questions[0]).toEqual({
      id: "qq1",
      question: "Q?",
      options: ["a", "b"],
      explanation: "e",
    });
    const questionSelect = chain.calls.find(
      (c) => c.table === "quiz_questions" && c.method === "select",
    );
    expect(questionSelect).toBeDefined();
    expect(questionSelect!.args[0]).toBe(
      "id, quiz_id, question, options, explanation, image_url, order_index",
    );
    expect(String(questionSelect!.args[0])).not.toContain("correct_answer");
    expect(chain.calls.find((c) => c.method === "order")!.args).toEqual([
      "order_index",
      { ascending: true },
    ]);
  });

  it("throws quiz_not_found when the row is missing", async () => {
    const chain = createSupabaseMock();
    chain.respondWith({ data: null, error: null }, { table: "quizzes" });
    await expect(fetchQuizWithQuestions(chain.supabase as never, "gone")).rejects.toThrow(
      "quiz_not_found",
    );
  });

  it("treats null options as empty arrays", async () => {
    const chain = createSupabaseMock();
    chain.respondWith(
      { data: { id: "q1", title: "T", description: null, duration_seconds: null }, error: null },
      { table: "quizzes" },
    );
    chain.respondWith(
      { data: [{ id: "qq1", question: "Q?", options: null }], error: null },
      { table: "quiz_questions" },
    );
    const res = await fetchQuizWithQuestions(chain.supabase as never, "q1");
    expect(res.questions[0].options).toEqual([]);
    expect(res.durationSeconds).toBeNull();
  });
});

describe("attempt lifecycle", () => {
  it("startAttempt resumes an unfinished attempt before inserting", async () => {
    const chain = createSupabaseMock();
    chain.respondWith({ data: { id: "att-1" }, error: null });
    const attempt = await startAttempt(chain.supabase as never, "q1", "u1");
    expect(attempt).toEqual({ id: "att-1" });
    expect(chain.calls.filter((c) => c.method === "insert")).toHaveLength(0);
    const is = chain.calls.find((c) => c.method === "is");
    expect(is!.args).toEqual(["finished_at", null]);
  });

  it("startAttempt creates a new attempt when none is open", async () => {
    const chain = createSupabaseMock({ data: null, error: null });
    await startAttempt(chain.supabase as never, "q1", "u1");
    expect(chain.calls.some((c) => c.method === "insert")).toBe(true);
    const insert = chain.calls.find((c) => c.method === "insert");
    expect((insert!.args[0] as Record<string, unknown>).user_id).toBe("u1");
  });

  it("saveAnswer upserts with the composite conflict key", async () => {
    const chain = createSupabaseMock();
    await saveAnswer(chain.supabase as never, "att-1", "qq-1", 2, true);
    const upsert = chain.calls.find((c) => c.method === "upsert");
    expect(upsert!.args[1]).toEqual({ onConflict: "attempt_id,question_id" });
    expect((upsert!.args[0] as Record<string, unknown>).is_correct).toBe(true);
  });

  it("finishAttempt calls the server-grading RPC and returns trusted numbers + graded answers (spec 030)", async () => {
    const gradedAnswers = [
      { question_id: "qq1", selected_option: 1, is_correct: true },
    ];
    const chain = createSupabaseMock({
      data: {
        success: true,
        score: 4,
        total_questions: 5,
        answers: gradedAnswers,
      },
      error: null,
    });
    const result = await finishAttempt(chain.supabase as never, "att-1", {
      timeTakenSeconds: 120,
    });
    const rpc = chain.calls.find((c) => c.method === "rpc");
    expect(rpc!.table).toBe("rpc:finish_quiz_attempt");
    expect(rpc!.args[0]).toEqual({
      p_attempt_id: "att-1",
      p_time_taken_seconds: 120,
    });
    expect(result).toEqual({
      score: 4,
      totalQuestions: 5,
      answers: gradedAnswers,
    });
  });

  it("finishAttempt defaults answers to an empty array when omitted", async () => {
    const chain = createSupabaseMock({
      data: { success: true, score: 0, total_questions: 0 },
      error: null,
    });
    const result = await finishAttempt(chain.supabase as never, "att-1");
    expect(result).toEqual({ score: 0, totalQuestions: 0, answers: [] });
  });
});

describe("completeQuizAttempt (server grading vs guest parity)", () => {
  const keylessQuestions = [
    { id: "qq1", question: "Q1?", options: ["A", "B"] },
    { id: "qq2", question: "Q2?", options: ["C", "D"] },
  ];

  it("signed-in path sends is_correct=false when key is absent and returns server-graded results", async () => {
    const gradedAnswers = [
      { question_id: "qq1", selected_option: 1, is_correct: true },
    ];
    const chain = createSupabaseMock();
    chain.respondWith({ data: { id: "att-1" }, error: null }, { table: "quiz_attempts" });
    chain.respondWith({ data: null, error: null }, { table: "quiz_answers" });
    chain.respondWith(
      {
        data: {
          success: true,
          score: 1,
          total_questions: 2,
          answers: gradedAnswers,
        },
        error: null,
      },
      { table: "rpc:finish_quiz_attempt" },
    );

    const result = await completeQuizAttempt({
      supabase: chain.supabase as never,
      quizId: "quiz-1",
      quizTitle: "Sample",
      userId: "user-1",
      questions: keylessQuestions,
      answers: [1, null],
      timeTakenSeconds: 45,
    });

    const upserts = chain.calls.filter(
      (c) => c.table === "quiz_answers" && c.method === "upsert",
    );
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args[0]).toMatchObject({
      attempt_id: "att-1",
      question_id: "qq1",
      selected_option: 1,
      is_correct: false,
    });
    const rpc = chain.calls.find((c) => c.method === "rpc");
    expect(rpc?.table).toBe("rpc:finish_quiz_attempt");
    expect(rpc?.args[0]).toEqual({
      p_attempt_id: "att-1",
      p_time_taken_seconds: 45,
    });
    expect(result).toEqual({
      score: 1,
      total: 2,
      savedToServer: true,
      isGuest: false,
      gradedAnswers,
    });
  });

  it("guest path saves locally with isCorrect=false, skips DB, and omits gradedAnswers", async () => {
    const chain = createSupabaseMock();
    const result = await completeQuizAttempt({
      supabase: chain.supabase as never,
      quizId: "quiz-guest",
      quizTitle: "Guest Quiz",
      userId: null,
      questions: keylessQuestions,
      answers: [0, 1],
      timeTakenSeconds: 30,
    });

    expect(chain.calls).toEqual([]);
    expect(result).toEqual({
      score: 0,
      total: 2,
      savedToServer: false,
      isGuest: true,
    });
    expect(result.gradedAnswers).toBeUndefined();

    const cached = await getGuestResult("quiz-guest");
    expect(cached).toMatchObject({
      quizId: "quiz-guest",
      score: 0,
      total: 2,
      title: "Guest Quiz",
      timeTakenSeconds: 30,
      answers: [
        { questionId: "qq1", selected: 0, isCorrect: false },
        { questionId: "qq2", selected: 1, isCorrect: false },
      ],
    });
  });
});

describe("guest results (on-device only)", () => {
  it("saves and reads a guest result through the cache", async () => {
    await saveGuestResult("q9", {
      quizId: "q9",
      score: 3,
      total: 5,
      finishedAt: new Date().toISOString(),
      title: "T",
      answers: [],
    });
    const res = await getGuestResult("q9");
    expect(res?.score).toBe(3);
    expect(res?.quizId).toBe("q9");
  });

  it("returns null for quizzes with no saved result", async () => {
    expect(await getGuestResult("never-saved")).toBeNull();
  });

  it("listGuestResults enumerates every saved quiz", async () => {
    await saveGuestResult("qA", { quizId: "qA", score: 1, total: 2, finishedAt: "x" });
    await saveGuestResult("qB", { quizId: "qB", score: 2, total: 2, finishedAt: "y" });
    const list = await listGuestResults();
    expect(list.map((e) => e.quizId).sort()).toEqual(["qA", "qB"]);
  });
});
