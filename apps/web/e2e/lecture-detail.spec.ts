import { expect, test } from "@playwright/test";

/**
 * Lecture detail — spec 056.
 *
 * The route is a thin Suspense wrapper around the subject dashboard:
 * `{subject}` is matched EXACTLY against subjects.name after decode +
 * dash→space (case-sensitive PostgREST eq — the mock name must equal the
 * URL slug normalized), and `{lectureId}` is the lecture_key string matched
 * client-side against fetched subject_lectures rows; an unknown key renders
 * the plain subject dashboard instead of the lecture view.
 *
 * Load requests: subjects (single), subject_lectures (list), and — when a
 * lecture key matches — the four scoped content queries (summaries/videos/
 * files/quizzes) which re-fetch BROADLY per table when scoped returns []
 * (documented useLectureContent behavior; the catch-all absorbs it).
 *
 * Mocked: subjects → object, subject_lectures → one lecture row, content
 * tables → [] via the catch-all, platform_settings (single object). Guest
 * only — fetchUserProgress fires only for authed users.
 *
 * Local dev compile cost: 120s timeout (quiz-finish precedent; CI is a
 * prebuilt `next start`).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث شيء ما|عذراً/;
const SUBJECT_NAME = "anatomy basics";
const LECTURE_LABEL = "المحاضرة الأولى";
const LECTURE_BADGE = "محتوى المحاضرة";
const NO_EXAMS = "لا توجد اختبارات لهذه المحاضرة حالياً.";
const LECTURES_LIST = "قائمة المحاضرات";

async function seedSubjectMocks(page: import("@playwright/test").Page) {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/platform_settings*", (route) =>
    route.fulfill({ json: { key: "default_semester", value: "1" } }),
  );
  await page.route("**/rest/v1/subjects*", (route) =>
    route.fulfill({
      json: {
        id: "00000000-0000-4000-8000-00000000sub1",
        name: SUBJECT_NAME,
        name_en: "Anatomy Basics",
        semester: 1,
        level: 3,
        show_on_home: true,
        status: "approved",
        created_at: "2026-01-01T00:00:00Z",
      },
    }),
  );
  await page.route("**/rest/v1/subject_lectures*", (route) =>
    route.fulfill({
      json: [
        {
          id: "00000000-0000-4000-8000-00000000lec1",
          subject: SUBJECT_NAME,
          lecture_key: "lecture-1",
          lecture_label: LECTURE_LABEL,
          order_index: 1,
        },
      ],
    }),
  );
}

test.describe("lecture detail (guest)", () => {
  test("a known lecture key opens the lecture view with its label and empty exams state", async ({
    page,
  }) => {
    await seedSubjectMocks(page);
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: { id: null, email: null, aud: null } }),
    );
    await page.route("**/auth/v1/token*", (route) =>
      route.fulfill({ json: { error: "no_session" } }),
    );

    await page.goto(`/ar/subjects/${SUBJECT_NAME.replace(/ /g, "-")}/lectures/lecture-1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: LECTURE_LABEL }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(LECTURE_BADGE)).toBeVisible();
    await expect(page.getByText(NO_EXAMS)).toBeVisible();
    await expect(page.getByText("العودة للمحاضرات")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("an unknown lecture key falls back to the plain subject dashboard", async ({
    page,
  }) => {
    await seedSubjectMocks(page);
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: { id: null, email: null, aud: null } }),
    );
    await page.route("**/auth/v1/token*", (route) =>
      route.fulfill({ json: { error: "no_session" } }),
    );

    await page.goto(
      `/ar/subjects/${SUBJECT_NAME.replace(/ /g, "-")}/lectures/lecture-404`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { name: LECTURES_LIST }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});
