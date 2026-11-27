import { expect, test } from "@playwright/test";

/**
 * News shell + FAQ accordion — spec 056, real-data variant (T-016).
 *
 * News is SSR-data + client-shell: the RSC page fetches `news` SERVER-side
 * and seeds the client hook via initialData (staleTime 5m — no client
 * refetch on mount), so data-dependent assertions stay FORBIDDEN — this
 * spec pins the shell only (title, category chips, search input, anon
 * login-to-add CTA) plus a client-side filter click that must not crash.
 * The news list content varies with the server's real Supabase data by
 * design.
 *
 * FAQ is fully static (4 hardcoded items, ids whatIsMasarx/approvalProcess/
 * accountRequired/reportIssue) — asserted via aria-expanded/aria-controls,
 * no i18n strings needed. First item open by default.
 *
 * Unmocked (T-016): no route mocks — the anonymous shell requests
 * (the platform_settings hydration gate) flow through to the real backend;
 * a no-session browser never calls /auth/v1. The signed-in add-news flow is
 * out of scope here (authed renders need the seeded-cookie contract, which
 * the server rejects — spec 056).
 *
 * Local dev compile cost: 120s timeout (quiz-finish precedent; CI is a
 * prebuilt `next start`).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث شيء ما|عذراً/;
const NEWS_TITLE = "الأخبار";
const LOGIN_TO_ADD = "تسجيل الدخول لإضافة خبر";
const FAQ_TITLE = "الأسئلة الشائعة";

test.describe("news (shell, anonymous)", () => {
  test("renders the shell, filters interact without crashing", async ({ page }) => {
    await page.goto("/ar/news", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: NEWS_TITLE }),
    ).toBeVisible({ timeout: 20_000 });
    for (const chip of ["الكل", "إعلان", "تحديث", "هام جداً"]) {
      await expect(page.getByRole("button", { name: chip }).first()).toBeVisible();
    }
    await expect(page.locator("#news-search")).toBeVisible();
    await expect(page.getByRole("button", { name: LOGIN_TO_ADD })).toBeVisible();

    // Client-side filter interaction: must not crash the page.
    await page.getByRole("button", { name: "هام جداً" }).first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: NEWS_TITLE }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});

test.describe("faq (static)", () => {
  test("renders the accordion with the first item open and toggles another", async ({
    page,
  }) => {
    await page.goto("/ar/faq", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    await expect(
      page.getByRole("heading", { level: 1, name: FAQ_TITLE }),
    ).toBeVisible({ timeout: 20_000 });

    const firstButton = page.locator('button[aria-controls="faq-panel-whatIsMasarx"]');
    await expect(firstButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#faq-panel-whatIsMasarx")).toBeVisible();

    const secondButton = page.locator('button[aria-controls="faq-panel-approvalProcess"]');
    await secondButton.click();
    await expect(secondButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#faq-panel-approvalProcess")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});
