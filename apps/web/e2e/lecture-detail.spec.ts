import { expect, test } from "@playwright/test";

/**
 * Lecture detail — spec 056, real-data variant (T-016).
 *
 * The route is a thin Suspense wrapper around the subject dashboard:
 * `{subject}` is matched EXACTLY against subjects.name after decode +
 * dash→space (case-sensitive PostgREST eq — the URL slug must equal the
 * seeded subject name), and `{lectureId}` is the lecture_key string
 * matched client-side against fetched subject_lectures rows; an unknown key
 * renders the plain subject dashboard instead of the lecture view.
 *
 * Unmocked: the seeded public subject `برمجة 1` carries real lectures
 * (lec-programming-1 = `مقدمة في البرمجة`); content queries flow through to
 * the real backend, so data-dependent emptiness assertions are dropped —
 * real quizzes may exist for the subject. Guest only — fetchUserProgress
 * fires only for authed users.
 *
 * Local dev compile cost: 120s timeout (quiz-finish precedent; CI is a
 * prebuilt `next start`).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث شيء ما|عذراً/;
const SUBJECT_NAME = "برمجة 1";
const LECTURE_LABEL = "مقدمة في البرمجة";
const LECTURE_BADGE = "محتوى المحاضرة";
const LECTURES_LIST = "قائمة المحاضرات";

test.describe("lecture detail (guest)", () => {
  test("a known lecture key opens the lecture view with its label and content", async ({
    page,
  }) => {

    await page.goto(`/ar/subjects/${SUBJECT_NAME.replace(/ /g, "-")}/lectures/lec-programming-1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: LECTURE_LABEL }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(LECTURE_BADGE)).toBeVisible();
    await expect(page.getByText("العودة للمحاضرات")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("an unknown lecture key falls back to the plain subject dashboard", async ({
    page,
  }) => {

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
