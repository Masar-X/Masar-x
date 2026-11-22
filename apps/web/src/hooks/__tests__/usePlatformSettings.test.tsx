import { describe, expect, it, vi } from "vitest";

// Module-level mocks keep the hook import side-effect-free: ../lib/supabase
// builds a real client at import time, and the context/cache reads would
// otherwise need jsdom storage state.
vi.mock("../../lib/supabase", () => ({ supabase: {} }));
vi.mock("../lib/queryCache", () => ({
  queryCache: { get: vi.fn(), set: vi.fn() },
  cacheKeys: { settings: () => "settings" },
  cacheTTL: { settings: 1 },
}));
vi.mock("@/contexts/PlatformSettingsContext", () => ({
  useOptionalPlatformSettingsContext: () => undefined,
}));

// Issue #276 — the JSONB value reader behind the hook's default_semester
// fetch. platform_settings.value is generated-typed `Json`; the documented
// shape for the key is `{ semester: number }` (PlatformSettingsContext).
import { readDefaultSemesterValue } from "../usePlatformSettings";

describe("readDefaultSemesterValue", () => {
  it("reads a numeric semester", () => {
    expect(readDefaultSemesterValue({ semester: 2 })).toBe(2);
    expect(readDefaultSemesterValue({ semester: 3 })).toBe(3);
  });

  it("coerces numeric strings; null/undefined semester falls back to 1", () => {
    expect(readDefaultSemesterValue({ semester: "2" })).toBe(2);
    expect(readDefaultSemesterValue({ semester: null })).toBe(1);
    expect(readDefaultSemesterValue({ semester: undefined })).toBe(1);
  });

  it("clamps non-finite and non-positive values to 1 (cache never persists NaN/0)", () => {
    expect(readDefaultSemesterValue({ semester: "not-a-number" })).toBe(1);
    expect(readDefaultSemesterValue({ semester: 0 })).toBe(1);
    expect(readDefaultSemesterValue({ semester: -2 })).toBe(1);
    expect(readDefaultSemesterValue({ semester: Number.NaN })).toBe(1);
    expect(readDefaultSemesterValue({ semester: Number.POSITIVE_INFINITY })).toBe(1);
  });

  it("returns 1 for non-object or shapeless JSON values", () => {
    expect(readDefaultSemesterValue(null)).toBe(1);
    expect(readDefaultSemesterValue(undefined)).toBe(1);
    expect(readDefaultSemesterValue("2")).toBe(1);
    expect(readDefaultSemesterValue(2)).toBe(1);
    expect(readDefaultSemesterValue([1, 2])).toBe(1);
    expect(readDefaultSemesterValue({ other: 2 })).toBe(1);
  });
});
