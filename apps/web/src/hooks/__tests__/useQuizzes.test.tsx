import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";

// Mutable chain mock (vi.mock factories are hoisted).
const { chain } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/mocks/supabase");
  return { chain: createSupabaseMock() };
});

vi.mock("@/lib/supabase", () => ({ supabase: chain.supabase }));
// queryCache is module-level and shared across tests — stub it so the
// admin_quizzes_v2 cache from one test can't satisfy another test's fetch.
vi.mock("@/lib/queryCache", () => ({
  queryCache: { get: () => null, set: vi.fn(), delete: vi.fn() },
  cacheTTL: { summaries: 300_000 },
}));
vi.mock("next-intl", () => nextIntlMockFactory());

import { nextIntlMockFactory } from "@/test/mocks/next-intl";
import { useQuizzes } from "../useQuizzes";
import { renderHookWithProviders } from "@/test/utils/render";

beforeEach(() => {
  chain.calls.length = 0;
  chain.respondWith({ data: [], error: null });
});

describe("useQuizzes — WS1 enabled gate (spec 060)", () => {
  it("fetches on mount by default — admin consumers unchanged", async () => {
    const { result } = renderHookWithProviders(() => useQuizzes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      chain.calls.some(
        (c) => c.method === "from" && c.table === "quizzes_with_ratings",
      ),
    ).toBe(true);
  });

  it("fetches nothing while enabled: false (ai-assistant pre-activation)", async () => {
    const { result, rerender } = renderHookWithProviders(() =>
      useQuizzes({ enabled: false }),
    );
    rerender();
    await act(async () => {});
    expect(result.current.loading).toBe(true);
    expect(chain.calls.some((c) => c.method === "from")).toBe(false);
  });

  it("fetches when the gate flips false → true (student_agent activation)", async () => {
    let enabled = false;
    const { result, rerender } = renderHookWithProviders(() =>
      useQuizzes({ enabled }),
    );
    rerender();
    await act(async () => {});
    expect(chain.calls.some((c) => c.method === "from")).toBe(false);

    enabled = true;
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(
      chain.calls.some(
        (c) => c.method === "from" && c.table === "quizzes_with_ratings",
      ),
    ).toBe(true);
  });
});
