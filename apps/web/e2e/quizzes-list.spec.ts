import { expect, test } from "@playwright/test";

import { seedAuthedSession } from "./helpers/auth";

/**
 * Quizzes dashboard list — spec 056.
 *
 * The page renders client-only (dynamic ssr:false) via useQuizzesData:
 * GET /rest/v1/quizzes?select=*&status=eq.approved&order=created_at.desc
 * (admin omits the status filter) + GET /rest/v1/subjects?...&order=name.asc
 * (guest adds show_on_home=eq.true and level/semester or-filters; the
 * client-side filter drops quizzes whose subject is not in the subjects
 * list — the subjects fixture must carry show_on_home: true and matching
 * names). isAdmin comes from the JWT app_metadata.role (seeded via the
 * spec-056 helper role option): admins see the manage header + new-exam
 * button and no previous-exams button; students/guests the reverse.
 *
 * Mocked: catch-all rest/v1 → [], quizzes/subjects/academic_levels/
 * departments fixtures, platform_settings (single object), profiles (filled
 * L3/S1 for the authed variants — AcademicOnboardingGate trap).
 *
 * Local dev compile cost: 120s timeout (quiz-finish precedent; CI is a
 * prebuilt `next start`).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث شيء ما|عذراً/;
const EXAMS_TITLE = "الامتحانات";
const MANAGE_TITLE = "إدارة الامتحانات";
const START_EXAM = "ابدأ الاختبار";
const PREVIOUS_EXAMS = "امتحاناتي السابقة";
const NEW_EXAM = "امتحان جديد";
const QUIZ_1 = "امتحان تشريح الوحدة الأولى";
const QUIZ_2 = "امتحان كيمياء حيوية منتصف الفصل";

const STUDENT_ID = "00000000-0000-4000-8000-00000000e2e6";
const ADMIN_ID = "00000000-0000-4000-8000-00000000e2e7";
const DEPARTMENT_ID = "00000000-0000-4000-8000-00000000d3p7";

const SUBJECTS = [
  {
    id: "00000000-0000-4000-8000-00000000s1a1",
    name: "تشريح",
    name_en: "Anatomy",
    semester: 1,
    level: 3,
    show_on_home: true,
    status: "approved",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-00000000s1b2",
    name: "كيمياء حيوية",
    name_en: "Biochemistry",
    semester: 1,
    level: 3,
    show_on_home: true,
    status: "approved",
    created_at: "2026-01-01T00:00:00Z",
  },
];

const QUIZZES = [
  {
    id: "00000000-0000-4000-8000-00000000q1a1",
    title: QUIZ_1,
    subject: "تشريح",
    description: "Unit 1 mock quiz",
    status: "approved",
    created_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-00000000q2b2",
    title: QUIZ_2,
    subject: "كيمياء حيوية",
    description: "Midterm mock quiz",
    status: "approved",
    created_at: "2026-01-03T00:00:00Z",
  },
];

/** Catch-all first, then specifics (LIFO); platform_settings is a .single(). */
async function seedDashboardMocks(page: import("@playwright/test").Page) {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/platform_settings*", (route) =>
    route.fulfill({ json: { key: "default_semester", value: "1" } }),
  );
  await page.route("**/rest/v1/quizzes*", (route) =>
    route.fulfill({ json: QUIZZES }),
  );
  await page.route("**/rest/v1/subjects*", (route) =>
    route.fulfill({ json: SUBJECTS }),
  );
  await page.route("**/rest/v1/academic_levels*", (route) =>
    route.fulfill({
      json: [
        { id: "00000000-0000-4000-8000-00000000l1a1", name: "المستوى الثالث", level_number: 3 },
      ],
    }),
  );
  await page.route("**/rest/v1/departments*", (route) =>
    route.fulfill({
      json: [
        { id: DEPARTMENT_ID, name: "علمي", academic_level_id: "00000000-0000-4000-8000-00000000l1a1" },
      ],
    }),
  );
}

test.describe("quizzes dashboard (guest)", () => {
  test("renders approved quizzes with the student previous-exams entry", async ({
    page,
  }) => {
    await seedDashboardMocks(page);
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: { id: null, email: null, aud: null } }),
    );
    await page.route("**/auth/v1/token*", (route) =>
      route.fulfill({ json: { error: "no_session" } }),
    );

    await page.goto("/ar/quizzes", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: EXAMS_TITLE }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: QUIZ_1 })).toBeVisible();
    await expect(page.getByRole("button", { name: START_EXAM }).first()).toBeVisible();
    await expect(page.getByText(PREVIOUS_EXAMS)).toBeVisible();

    // Client-side search filter over titles.
    await page.locator("#quiz-search").fill(QUIZ_1);
    await expect(page.getByRole("heading", { name: QUIZ_1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: QUIZ_2 })).not.toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});

test.describe("quizzes dashboard (authed student)", () => {
  test("keeps the student header and the previous-exams entry", async ({
    page,
    baseURL,
  }) => {
    await seedDashboardMocks(page);
    await page.route("**/rest/v1/profiles*", (route) =>
      route.fulfill({
        json: {
          id: STUDENT_ID,
          level: 3,
          semester: 1,
          department_id: DEPARTMENT_ID,
          full_name: "E2E Student",
          show_extra_assets: false,
        },
      }),
    );
    await seedAuthedSession(page, { baseURL, userId: STUDENT_ID });

    await page.goto("/ar/quizzes", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: EXAMS_TITLE }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(PREVIOUS_EXAMS)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});

test.describe("quizzes dashboard (authed admin)", () => {
  test("switches to the manage header with the new-exam action and no previous-exams entry", async ({
    page,
    baseURL,
  }) => {
    await seedDashboardMocks(page);
    await page.route("**/rest/v1/profiles*", (route) =>
      route.fulfill({
        json: {
          id: ADMIN_ID,
          level: 3,
          semester: 1,
          department_id: DEPARTMENT_ID,
          full_name: "E2E Admin",
          show_extra_assets: false,
        },
      }),
    );
    await seedAuthedSession(page, { baseURL, userId: ADMIN_ID, role: "admin" });

    await page.goto("/ar/quizzes", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: MANAGE_TITLE }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(NEW_EXAM)).toBeVisible();
    await expect(page.getByText(PREVIOUS_EXAMS)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});
