import { expect, test } from "@playwright/test";

/**
 * Footer route scope e2e (owner decision 2026-11-20).
 *
 * The footer renders ONLY on info/utility routes (footerRoutes.ts allowlist);
 * studying pages ship footer-free by default. Public info pages are checked
 * unmocked against the real backend (T-016): the assertions are about route
 * scope, not data, so live Supabase responses are irrelevant. The
 * desktop-shell case — footer count 0 on any
 * route — is already covered by sidenav.spec.ts's desktop-mode simulation.
 */

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث خطأ|حدث شيء ما|عذراً/;

test.describe("footer route scope (web mode)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("info/utility pages keep the footer", async ({ page }) => {
    for (const route of ["/en", "/en/downloads", "/en/faq"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
      await expect(
        page.locator("footer"),
        `${route} keeps the footer`,
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("studying pages ship footer-free", async ({ page }) => {
    for (const route of ["/en/subjects", "/en/quizzes", "/en/schedules"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
      await expect(page.locator("footer"), `${route} has no footer`).toHaveCount(0);
    }
  });

  test("footer links to the Masar-X org + star badge (spec 054)", async ({ page }) => {
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
    const footer = page.locator("footer");
    await expect(footer, "/en keeps the footer").toBeVisible({ timeout: 15_000 });
    // API-outcome-agnostic: both anchors render whether or not the cached
    // star fetch succeeded (the count is simply omitted on failure).
    await expect(
      footer.locator('a[href="https://github.com/Masar-X"]'),
    ).toBeVisible();
    await expect(
      footer.locator('a[href="https://github.com/Masar-X/Masar-x"]'),
    ).toBeVisible();
  });
});
