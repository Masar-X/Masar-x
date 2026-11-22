import { expect, test } from "@playwright/test";

import { seedAuthedSession } from "./helpers/auth";

/**
 * Academic onboarding — spec 056.
 *
 * Client-gated only: !user → router.push(/login); admins → replace(/).
 * The form renders when the fetched academic is all-null (level/semester/
 * department_id) — an existing-student profile (both non-null) redirects
 * home BEFORE the form; /onboarding paths are exempt from the
 * AcademicOnboardingGate so nulls do not loop. Submit (متابعة) → POST
 * /rest/v1/profiles?on_conflict=id body {level, semester,
 * semester_manually_set: false, department_id: null} → router.replace("/")
 * immediately (optimistic).
 *
 * Mocked: catch-all rest/v1 → [], platform_settings (single object),
 * profiles branch (GET maybeSingle → all-null object; POST → captured 201).
 *
 * Local dev compile cost: 120s timeout (quiz-finish precedent).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث شيء ما|عذراً/;
const TITLE = "تحديد المستوى والترم";
const CONTINUE = "متابعة";
const USER_ID = "00000000-0000-4000-8000-00000000e2e9";

test.describe("academic onboarding (authed, fresh profile)", () => {
  test("submits level+semester via the upsert and routes home", async ({
    page,
    baseURL,
  }) => {
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
    const upserts: Array<Record<string, unknown>> = [];
    await page.route("**/rest/v1/profiles*", (route) => {
      if (route.request().method() === "POST") {
        upserts.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({ status: 201, json: null });
      }
      return route.fulfill({
        json: { id: USER_ID, level: null, semester: null, department_id: null },
      });
    });
    await seedAuthedSession(page, { baseURL, userId: USER_ID });

    const upsert = page.waitForRequest(
      (request) =>
        request.url().includes("/rest/v1/profiles") &&
        request.method() === "POST",
    );
    await page.goto("/ar/onboarding/academic", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible({ timeout: 20_000 });

    await page.locator("#onboarding-level").selectOption("2");
    await page.locator("#onboarding-semester").selectOption("1");
    await page.getByRole("button", { name: CONTINUE }).click();

    const request = await upsert;
    expect(request.postDataJSON()).toMatchObject({
      id: USER_ID,
      level: 2,
      semester: 1,
      semester_manually_set: false,
    });
    await page.waitForURL((url) => url.pathname === "/ar", { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
    expect(upserts).toHaveLength(1);
  });
});

test.describe("academic onboarding (anonymous)", () => {
  test("unauthenticated visitors are pushed to login", async ({ page }) => {
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: { id: null, email: null, aud: null } }),
    );
    await page.route("**/auth/v1/token*", (route) =>
      route.fulfill({ json: { error: "no_session" } }),
    );

    await page.goto("/ar/onboarding/academic", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/ar\/login$/, { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});
