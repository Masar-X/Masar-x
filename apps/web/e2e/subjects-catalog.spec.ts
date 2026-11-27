import { expect, test } from "@playwright/test";

import { seedAuthedSession } from "./helpers/auth";

/**
 * Subjects catalog e2e — spec 015 Contract E, re-baselined by spec 022.
 *
 * Anonymous variant (T-016): real-data — the academic grid renders the live
 * public seed subjects (guest = level 1 + platform default semester, anon
 * show_on_home filter) and must NEVER render the non-academic empty-state
 * copy on the academic grid (the old is_academic ternary bug — post-merge
 * this assertion also covers spec 015 scenario c). Specific seed rows are
 * not pinned: the guest slice follows the admin-set platform default
 * semester, so only the populated-grid contract is asserted.
 *
 * Signed-in variant: unblocked by the spec-056 seeded-cookie auth contract
 * (fabricated session + route mocks, zero real Supabase writes) — no seed
 * database needed (#281). It stays route-mocked (T-016): the fabricated
 * cookie is rejected server-side, so authed scoping needs the fixtures.
 */

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث خطأ|حدث شيء ما|عذراً/;
const NON_ACADEMIC_EMPTY_COPY = /emptyNonAcademicTitle|emptyNonAcademicDescription/;

const MOCK_SUBJECTS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "تشريح",
    name_en: "Anatomy",
    is_academic: true,
    semester: 1,
    level: 1,
    show_on_home: true,
    created_at: "2025-01-01T00:00:00Z",
    status: "approved",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "فسيولوجي",
    name_en: "Physiology",
    is_academic: true,
    semester: 1,
    level: 1,
    show_on_home: true,
    created_at: "2025-01-02T00:00:00Z",
    status: "approved",
  },
  {
    // show_on_home: false — the probe distinguishing signed-in scoping
    // (useSubjects adds the home filter only for anonymous viewers).
    id: "00000000-0000-4000-8000-000000000003",
    name: "علم الأورام",
    name_en: "Oncology",
    is_academic: true,
    semester: 1,
    level: 1,
    show_on_home: false,
    created_at: "2025-01-03T00:00:00Z",
    status: "approved",
  },
];

test.describe("subjects catalog (anonymous, real data)", () => {
  test("renders live seed subject cards on /ar/subjects without non-academic copy", async ({
    page,
  }) => {
    await page.goto("/ar/subjects", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);

    // Real seed data: the guest slice (level 1 + platform default semester,
    // anonymous show_on_home filter) renders at least one subject card.
    await expect
      .poll(async () => page.locator('main [data-testid="subject-card"]').count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    // Regression: the academic grid must never show the non-academic
    // empty-state copy (or the i18n key itself leaked as text).
    await expect(page.locator("body")).not.toContainText(NON_ACADEMIC_EMPTY_COPY);
  });
});

test.describe("subjects catalog (signed-in student)", () => {
  // #281 — portable "seed user" via the spec-056 seeded-cookie contract
  // (helpers/auth.ts): fabricated session + route mocks, zero Supabase
  // writes. USER_ID allocation: e2e11.
  const USER_ID = "00000000-0000-4000-8000-00000000e2e11";
  const DEPARTMENT_ID = "00000000-0000-4000-8000-00000000d3p7";

  test("a semester-1 student sees their subjects", async ({ page, baseURL }) => {
    // LIFO: catch-all first, specific handlers after.
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
    // Filled profile — an all-null one triggers the AcademicOnboardingGate
    // redirect to /onboarding/academic after its 1s grace.
    await page.route("**/rest/v1/profiles*", (route) =>
      route.fulfill({
        json: {
          id: USER_ID,
          level: 1,
          semester: 1,
          department_id: DEPARTMENT_ID,
        },
      }),
    );
    await page.route("**/rest/v1/subjects*", (route) => {
      // Same filter emulation as the guest test — the signed-in query has
      // no show_on_home param, so all rows come back.
      const url = route.request().url();
      const rows = url.includes("show_on_home=eq.true")
        ? MOCK_SUBJECTS.filter((s) => s.show_on_home)
        : MOCK_SUBJECTS;
      return route.fulfill({ json: rows });
    });
    await seedAuthedSession(page, { baseURL, userId: USER_ID });

    await page.goto("/ar/subjects", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);

    // Signed-in students skip the show_on_home home filter — the hidden
    // subject is the assertion distinguishing this path from the guest one.
    await expect(
      page.getByRole("button", { name: /تشريح|Anatomy/ }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /فسيولوجي|Physiology/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /علم الأورام|Oncology/ })).toBeVisible();

    // The onboarding gate did NOT bounce (profile was filled).
    await expect(page).not.toHaveURL(/onboarding\/academic/);
    await expect(page.locator("body")).not.toContainText(NON_ACADEMIC_EMPTY_COPY);
  });
});
