import { expect, test } from "@playwright/test";

import { buildSeededSession } from "./helpers/auth";

/**
 * Reset-password flow — spec 056.
 *
 * Page contract (reset-password/page.tsx, no data-testids — id/text
 * selectors): `?code&type=recovery` gates the form; a visit WITHOUT them
 * shows resetPassword.invalidLinkError and auto-pushes to /{locale}/login
 * after a 3s timer; the submit handler runs exchangeCodeForSession →
 * updateUser (PUT /auth/v1/user) → signOut → successMessage → login.
 *
 * ⚠️ Web-client reality (probed empirically, spec 056 §4): the browser
 * client runs `detectSessionInUrl: true` (createBrowserClient default), so
 * supabase-js AUTO-EXCHANGES the URL code at page load — POST
 * /auth/v1/token?grant_type=pkce fires before any submit and consumes the
 * single-use code + PKCE verifier. The load-time exchange is therefore the
 * deterministic, user-relevant contract asserted here (test 2). The page's
 * own submit-time exchange cannot succeed afterwards on the web client —
 * flagged to the owner as a product-behavior observation (the desktop
 * client sets detectSessionInUrl: false and does not share it).
 *
 * Test 3 pins the user-visible contract for an unexchangeable code: the
 * page surfaces resetPassword.expiredLinkError and stays on the form. In
 * the test no PKCE verifier exists, so the exchange fails locally
 * (AuthPKCECodeVerifierMissingError, zero network) and auth-js returns it
 * as the exchange error — the same page branch a real invalid/expired
 * grant takes. The assertion pins the banner, not the transport error.
 *
 * Mocked: anon auth pair (GET /auth/v1/user), catch-all rest/v1,
 * platform_settings (single object), filled profiles (the authed client
 * session from a successful load-time exchange would otherwise trip the
 * AcademicOnboardingGate → onboarding redirect), token?* → session or 400.
 *
 * Local dev servers compile these routes cold under parallel workers — the
 * 120s timeout mirrors quiz-finish.spec.ts (CI serves a prebuilt build).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث شيء ما|عذراً/;
const INVALID_LINK = "رابط إعادة التعيين غير صالح. يرجى طلب رابط جديد.";
const EXPIRED_LINK = "رابط إعادة التعيين منتهي الصلاحية أو غير صالح";
const TITLE = "إعادة تعيين كلمة المرور";
const SUBMIT_AR = "تحديث كلمة المرور";
const NEW_PASSWORD = "N3wPassword!";
const USER_ID = "00000000-0000-4000-8000-00000000e2e5";
const DEPARTMENT_ID = "00000000-0000-4000-8000-00000000d3p7";

/**
 * Hydration gate (see auth-success.spec.ts): the platform_settings fetch
 * fires from a mount effect, i.e. only after React hydration — awaiting it
 * prevents the fill-before-hydration wipe on cold dev-server compiles.
 */
async function awaitHydration(page: import("@playwright/test").Page) {
  await page.waitForRequest("**/rest/v1/platform_settings*", {
    timeout: 45_000,
  });
}

/**
 * Let supabase-js store the PKCE verifier itself: drive the forgot-password
 * flow (recover mocked) so the recover call generates and persists the
 * verifier under the client's own storage keys (flow-slot + legacy cookie,
 * base64-JSON encoded — seeding a plain cookie value does not satisfy the
 * lookup). Mirrors how real users arrive on the reset page.
 */
async function recoverToSeedVerifier(page: import("@playwright/test").Page) {
  // Recover MUST be mocked — `**/auth/v1/recover*` (trailing * for the
  // ?redirect_to= query; the exact glob leaks to the real project).
  await page.route("**/auth/v1/recover*", (route) => route.fulfill({ json: {} }));
  await page.goto("/ar/login", { waitUntil: "domcontentloaded" });
  await awaitHydration(page);
  await page.getByRole("button", { name: "نسيت كلمة المرور؟" }).click();
  await page.locator("#forgot-email").fill("e2e-reset@example.com");
  // Register the wait BEFORE the submitting click — the recover fetch can
  // fire inside the click's own await window and be missed otherwise.
  const recover = page.waitForRequest("**/auth/v1/recover*", { timeout: 20_000 });
  await page.getByRole("button", { name: "إرسال رابط إعادة التعيين" }).click();
  await recover;
}

test.describe("reset-password", () => {
  test("a visit without ?code&type=recovery shows invalidLinkError and auto-pushes to login", async ({
    page,
  }) => {
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

    await page.goto("/ar/reset-password", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(INVALID_LINK)).toBeVisible({ timeout: 20_000 });

    // The 3s redirect timer starts at mount — generous window for hydration.
    await page.waitForURL(/\/ar\/login$/, { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("a recovery link fires the load-time PKCE exchange with the URL code and renders the form", async ({
    page,
  }) => {
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
    // The load-time exchange SUCCEEDS → the client session cookie is set →
    // AuthContext hydrates authed → keep the AcademicOnboardingGate satisfied.
    const session = buildSeededSession(USER_ID);
    await page.route("**/rest/v1/profiles*", (route) =>
      route.fulfill({
        json: {
          id: USER_ID,
          level: 3,
          semester: 1,
          department_id: DEPARTMENT_ID,
          full_name: "E2E User",
          show_extra_assets: false,
        },
      }),
    );
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: session.user }),
    );
    await page.route("**/auth/v1/token*", (route) =>
      route.fulfill({ json: session }),
    );
    await recoverToSeedVerifier(page);

    const pkceExchange = page.waitForRequest(
      (request) =>
        request.url().includes("/auth/v1/token") &&
        request.url().includes("grant_type=pkce"),
    );

    await page.goto("/ar/reset-password?code=e2e-code&type=recovery", {
      waitUntil: "domcontentloaded",
    });
    // No hydration gate here: platform_settings is localStorage-cached by
    // the login-page load in this same context (queryCache falls back to
    // localStorage), so it never re-fires on this navigation — and this
    // test performs no fill/click interactions. The pkce wait below is the
    // load signal; visibility asserts auto-wait through hydration.

    // detectSessionInUrl: the client exchanges the URL code at load.
    const exchange = await pkceExchange;
    expect(exchange.postDataJSON()).toMatchObject({ auth_code: "e2e-code" });

    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#new-password")).toBeVisible();
    await expect(page.getByText(EXPIRED_LINK)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("an unexchangeable code surfaces expiredLinkError and stays on the form", async ({
    page,
  }) => {
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: { id: null, email: null, aud: null } }),
    );
    await page.route("**/auth/v1/token*", (route) =>
      route.fulfill({ status: 400, json: { error: "invalid_grant" } }),
    );
    // No PKCE verifier exists in this test — see the header note: the
    // exchange fails locally and the page surfaces the same expiredLinkError
    // branch a real invalid grant takes.
    await page.goto("/ar/reset-password?code=e2e-code&type=recovery", {
      waitUntil: "domcontentloaded",
    });
    await awaitHydration(page);
    await expect(page.locator("#new-password")).toBeVisible({
      timeout: 20_000,
    });

    await page.locator("#new-password").fill(NEW_PASSWORD);
    await page.locator("#confirm-new-password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: SUBMIT_AR }).click();

    await expect(page.getByText(EXPIRED_LINK)).toBeVisible();
    expect(page.url()).toContain("/ar/reset-password");
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});
