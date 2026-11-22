import { expect, test } from "@playwright/test";

import { seedAuthedSession } from "./helpers/auth";

/**
 * TRW pages: catalog, category, course detail, my-access — spec 056.
 *
 * /trw/* is NOT middleware-guarded (only /non-academic* is), so the gate is
 * the in-page TRWAccessGate: anonymous → the "Access Required" fallback
 * card; authed + membership row → content. The membership probe runs even
 * for the {id:null} anon mock (truthy user object) — trw_memberships must
 * be mocked (`null` for the .maybeSingle() probe).
 *
 * Shape branching on shared globs (LIFO: catch-all first):
 * - trw_categories: catalog select=*&is_published=eq.true → array;
 *   category page select=id&slug=eq.<slug> → single object.
 * - trw_courses: category page category_id list → array; course detail
 *   slug single → nested object with modules:trw_modules(*,materials:trw_materials(*)).
 *
 * my-access formats membership.granted_at — the mock must carry it.
 *
 * Local dev compile cost: 120s timeout (quiz-finish precedent).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث شيء ما|عذراً/;
const CATALOG_H1 = "MONEY MAKING IS A SKILL";
const ACCESS_REQUIRED = "Access Required";
const COURSE_OVERVIEW = "Course Overview";
const CATEGORY_SLUG = "trading-basics";
const CATEGORY_NAME = "Trading Basics";
const COURSE_SLUG = "reading-price-action";
const COURSE_TITLE = "Reading Price Action";
const MODULE_1 = "Candlestick Foundations";
const USER_ID = "00000000-0000-4000-8000-00000000e2e8";
const DEPARTMENT_ID = "00000000-0000-4000-8000-00000000d3p7";
const CATEGORY_ID = "00000000-0000-4000-8000-00000000tc1a";
const COURSE_ID = "00000000-0000-4000-8000-00000000tw1a";

const CATEGORIES = [
  {
    id: CATEGORY_ID,
    slug: CATEGORY_SLUG,
    name: CATEGORY_NAME,
    description: "Start here",
    sort_order: 1,
    is_published: true,
  },
  {
    id: "00000000-0000-4000-8000-00000000tc2b",
    slug: "risk-management",
    name: "Risk Management",
    description: "Protect the downside",
    sort_order: 2,
    is_published: true,
  },
];

const COURSE_ROW = {
  id: COURSE_ID,
  slug: COURSE_SLUG,
  title: COURSE_TITLE,
  category_id: CATEGORY_ID,
  instructor: "TRW Instructor",
  description: "Mock course",
  is_published: true,
  sort_order: 1,
};

const MEMBERSHIP = {
  id: "00000000-0000-4000-8000-00000000tm1a",
  user_id: USER_ID,
  granted_at: "2026-01-01T00:00:00Z",
  expires_at: null,
  revoked_at: null,
  plan: { id: "00000000-0000-4000-8000-00000000tp1a", name: "TRW Annual" },
};

/** Anonymous gate mocks: the {id:null} probe still fires trw_memberships. */
async function seedAnonymousTrw(page: import("@playwright/test").Page) {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/platform_settings*", (route) =>
    route.fulfill({ json: { key: "default_semester", value: "1" } }),
  );
  await page.route("**/rest/v1/trw_memberships*", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({ json: { id: null, email: null, aud: null } }),
  );
  await page.route("**/auth/v1/token*", (route) =>
    route.fulfill({ json: { error: "no_session" } }),
  );
}

test.describe("TRW catalog (anonymous)", () => {
  test("shows the in-page access gate instead of the catalog", async ({ page }) => {
    await seedAnonymousTrw(page);
    await page.route("**/rest/v1/trw_categories*", (route) =>
      route.fulfill({ json: [] }),
    );

    await page.goto("/ar/trw", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(page.getByText(ACCESS_REQUIRED)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});

test.describe("TRW pages (authed member)", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
    await page.route("**/rest/v1/trw_memberships*", (route) =>
      route.fulfill({ json: MEMBERSHIP }),
    );
    await page.route("**/rest/v1/trw_categories*", (route) => {
      if (route.request().url().includes("slug=eq.")) {
        return route.fulfill({ json: CATEGORIES[0] });
      }
      return route.fulfill({ json: CATEGORIES });
    });
    await page.route("**/rest/v1/trw_courses*", (route) => {
      if (route.request().url().includes("slug=eq.")) {
        return route.fulfill({
          json: {
            ...COURSE_ROW,
            modules: [
              {
                id: "00000000-0000-4000-8000-00000000mo1a",
                title: MODULE_1,
                slug: "candlestick-foundations",
                sort_order: 1,
                materials: [
                  {
                    id: "00000000-0000-4000-8000-00000000ma1a",
                    title: "Reading the open",
                    duration: "04:30",
                    sort_order: 1,
                  },
                ],
              },
            ],
          },
        });
      }
      return route.fulfill({ json: [COURSE_ROW] });
    });
    await page.route("**/rest/v1/trw_user_progress*", (route) =>
      route.fulfill({ json: [] }),
    );
    // Filled profile — the AcademicOnboardingGate redirects authed members
    // with null academics to /onboarding/academic (hit in the first run).
    await page.route("**/rest/v1/profiles*", (route) =>
      route.fulfill({
        json: {
          id: USER_ID,
          level: 3,
          semester: 1,
          department_id: DEPARTMENT_ID,
          full_name: "E2E Member",
          show_extra_assets: false,
        },
      }),
    );
    await seedAuthedSession(page, { baseURL, userId: USER_ID });
  });

  test("catalog lists published categories and navigates to the category", async ({
    page,
  }) => {
    await page.goto("/ar/trw", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: CATALOG_H1 }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(CATEGORY_NAME)).toBeVisible();

    await page.getByText(CATEGORY_NAME).click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `${CATEGORY_SLUG.replace(/-/g, " ")} Courses`,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(COURSE_TITLE)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("course detail renders the nested modules and materials", async ({ page }) => {
    await page.goto(`/ar/trw/${CATEGORY_SLUG}/${COURSE_SLUG}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(page.getByText(COURSE_OVERVIEW)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(MODULE_1)).toBeVisible();
    await expect(page.getByText("Reading the open")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("my-access shows the active membership details", async ({ page }) => {
    await page.goto("/ar/trw/my-access", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: "اشتراكي في TRW" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("اشتراك نشط")).toBeVisible();
    await expect(page.getByText("موثّق ونشط")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});
