import { expect, test } from "@playwright/test";

import { seedAuthedSession } from "./helpers/auth";

/**
 * Protected-route walls + logout — spec 056.
 *
 * The middleware (src/lib/supabase/proxy.ts guards at :66 /non-academic*,
 * :89 /admin* + /admin-dashboard*, :112 /profile* /quiz-attempts* /add-video*
 * /add-file*) resolves the session SERVER-side against the real Supabase
 * project. A seeded MOCK cookie carries a rejected JWT, so the server sees
 * user = null exactly like no cookie — every guarded route redirects to
 * /{locale}/login for BOTH anonymous and mock-authed visitors. That redirect
 * is the contract asserted here; the authed renders of these routes are
 * unreachable without a real server session (future unlock: a local Supabase
 * stub server as the e2e dev server's NEXT_PUBLIC_SUPABASE_URL — spec 056 §1).
 *
 * Bounce chain for mock-authed visitors: /ar/profile → middleware 307 →
 * /ar/login → the login page's signed-in effect (AuthContext restores the
 * cookie client-side) pushes home → /ar. So the authed assertions assert
 * "left the protected path" (trw-gate.spec.ts precedent) rather than the
 * exact login URL.
 *
 * Logout IS reachable: the control lives in the sidenav footer (AppNav →
 * UserMenu, aria-label nav.logout) on unguarded pages, exercised from
 * /ar/quizzes.
 *
 * Mocked: anonymous auth pair or seeded cookie, catch-all rest/v1,
 * platform_settings (single object — .single() reader).
 */

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث خطأ|حدث شيء ما|عذراً/;
const LOGIN_URL = /\/ar\/login$/;
const LOGOUT_AR = "تسجيل الخروج";
const USER_ID = "00000000-0000-4000-8000-00000000e2e10";

// Every test here lands on /ar/login (and logout ends on /ar): on a LOCAL
// dev server those are cold Turbopack compiles, and with fullyParallel
// workers racing compiles on a slow filesystem the 45s default can expire
// while the first /ar/login render is still in flight (CI is unaffected —
// the e2e job serves a prebuilt `next start`). House precedent:
// quiz-finish.spec.ts uses the same bump for heavy pages.
test.setTimeout(120_000);

test.describe("protected routes redirect anonymous visitors", () => {
  test.beforeEach(async ({ page }) => {
    // Catch-all FIRST; the platform_settings specific handler (registered
    // later) wins via LIFO and returns one object — the .single() reader.
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
  });

  test("/ar/profile redirects to login", async ({ page }) => {
    await page.goto("/ar/profile", { waitUntil: "domcontentloaded" });
    await page.waitForURL(LOGIN_URL, { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("/ar/quiz-attempts redirects to login", async ({ page }) => {
    await page.goto("/ar/quiz-attempts", { waitUntil: "domcontentloaded" });
    await page.waitForURL(LOGIN_URL, { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});

test.describe("protected routes reject the seeded mock cookie (SSR wall)", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await seedAuthedSession(page, { baseURL, userId: USER_ID });
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
  });

  test("authed /ar/profile is bounced off the protected path", async ({ page }) => {
    await page.goto("/ar/profile", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => !url.pathname.includes("/profile"), {
      timeout: 30_000,
    });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("authed /ar/admin-dashboard is bounced off the protected path", async ({ page }) => {
    await page.goto("/ar/admin-dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => !url.pathname.includes("/admin-dashboard"), {
      timeout: 30_000,
    });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});

test.describe("logout (reachable from the sidenav on unguarded pages)", () => {
  test("signs out via /auth/v1/logout?scope=global and lands on home", async ({
    page,
    baseURL,
  }) => {
    await seedAuthedSession(page, { baseURL, userId: USER_ID });
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
    await page.route("**/auth/v1/logout*", (route) => route.fulfill({ status: 204 }));

    const logoutRequest = page.waitForRequest("**/auth/v1/logout*");
    await page.goto("/ar/quizzes", { waitUntil: "domcontentloaded" });

    // Hydration gate: a pre-hydration click silently no-ops.
    const logoutButton = page.getByRole("button", { name: LOGOUT_AR });
    await expect(logoutButton).toBeVisible({ timeout: 15_000 });
    await logoutButton.click();

    const request = await logoutRequest;
    expect(request.url()).toContain("scope=global");

    // AuthContext SIGNED_OUT → router.push("/") → next-intl resolves /ar.
    await page.waitForURL((url) => url.pathname === "/ar" || url.pathname === "/", {
      timeout: 30_000,
    });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});
