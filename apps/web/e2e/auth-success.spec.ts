import { expect, test } from "@playwright/test";

import { buildSeededSession } from "./helpers/auth";

/**
 * Hydration gate: PlatformSettingsProvider fetches platform_settings from a
 * mount effect, which only runs AFTER React has hydrated the route. Awaiting
 * this request before interacting closes the fill-before-hydration wipe
 * (controlled inputs reset to "" when hydration lands after the fill — the
 * cold-Turbopack e2e flake recorded in the repo memory).
 */
async function awaitHydration(page: import("@playwright/test").Page) {
  await page.waitForRequest("**/rest/v1/platform_settings*", {
    timeout: 45_000,
  });
}

/**
 * Successful auth flows — spec 056.
 *
 * auth-surface.spec.ts covers the failure banners; this spec covers the
 * happy paths, all browser-mockable:
 *
 * 1. Login success: signInWithPassword → POST /auth/v1/token?grant_type=password
 *    → full session JSON (buildSeededSession shape). NO cookie is seeded —
 *    the test proves the login flow itself persists the `sb-<ref>-auth-token`
 *    cookie, fires /api/auth/sync + the login analytics insert, and lands on
 *    /{locale} via the login page's signed-in effect.
 * 2. Forgot-password: resetPasswordForEmail → POST /auth/v1/recover →
 *    authPages.resetLinkSent banner (login-error-banner testid, emerald).
 * 3. Signup: signUp → POST /auth/v1/signup → a user WITHOUT a session
 *    (email-confirmation flow) → authPages.signupConfirmationSent banner and
 *    the visitor stays on /signup with NO session cookie. A session-shaped
 *    response would auto-login and redirect — the shape is the contract.
 *
 * Mocked: auth pair (anon), token?* → session (login only) / signup →
 * sessionless user, catch-all rest/v1, profiles (filled — AcademicOnboarding
 * Gate trap), platform_settings (single object), /api/auth/sync,
 * /api/metrics/event, rest/v1/analytics → 201.
 *
 * Local dev servers compile these routes cold under parallel workers — the
 * 120s timeout mirrors quiz-finish.spec.ts (CI serves a prebuilt build).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث خطأ|حدث شيء ما|عذراً/;
const WELCOME_TITLE = "مرحباً بك مجدداً";
const FORGOT_LINK = "نسيت كلمة المرور؟";
const SEND_RESET = "إرسال رابط إعادة التعيين";
const RESET_LINK_SENT =
  "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.";
const SIGNUP_CONFIRMATION_SENT =
  "تم إرسال رابط التأكيد إلى بريدك الإلكتروني. يرجى التحقق من بريدك الإلكتروني.";
const LOGIN_EMAIL = "e2e-login@example.com";
const USER_ID = "00000000-0000-4000-8000-00000000e2e4";
const DEPARTMENT_ID = "00000000-0000-4000-8000-00000000d3p7";

test.describe("login success", () => {
  test("email login persists the session cookie, syncs, and lands on home", async ({
    page,
  }) => {
    // Catch-all FIRST; specifics after (LIFO wins).
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/platform_settings*", (route) =>
      route.fulfill({ json: { key: "default_semester", value: "1" } }),
    );
    // Filled profile: home mounts AcademicOnboardingGate for authed users.
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
    // Login analytics insert is a real POST — answer 201, not the [] catch-all.
    await page.route("**/rest/v1/analytics*", (route) =>
      route.fulfill({ status: 201, json: { id: "analytics-row" } }),
    );
    await page.route("**/api/auth/sync", (route) =>
      route.fulfill({ json: { ok: true } }),
    );
    await page.route("**/api/metrics/event", (route) =>
      route.fulfill({ status: 204 }),
    );
    await page.route("**/auth/v1/user", (route) =>
      route.fulfill({ json: { id: null, email: null, aud: null } }),
    );
    const session = buildSeededSession(USER_ID);
    await page.route("**/auth/v1/token*", (route) =>
      route.fulfill({ json: session }),
    );

    const passwordGrant = page.waitForRequest(
      (request) =>
        request.url().includes("/auth/v1/token") &&
        request.url().includes("grant_type=password"),
    );
    await page.goto("/ar/login", { waitUntil: "domcontentloaded" });
    await awaitHydration(page);
    await expect(
      page.getByRole("heading", { level: 1, name: WELCOME_TITLE }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("login-email").fill(LOGIN_EMAIL);
    await page.getByTestId("login-password").fill("Sup3rSecret!");
    await page.getByTestId("login-submit").click();

    const grant = await passwordGrant;
    expect(grant.postDataJSON()).toMatchObject({ email: LOGIN_EMAIL });

    await page.waitForURL((url) => url.pathname === "/ar", { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
    await expect(page.getByTestId("login-error-banner")).toHaveCount(0);

    // The login flow itself must have persisted the supabase-js session cookie.
    const authCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"),
    );
    expect(authCookie, "login must persist the @supabase/ssr session cookie").toBeTruthy();
  });
});

test.describe("forgot-password success", () => {
  test("recover request shows the resetLinkSent banner", async ({ page }) => {
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
    // resetPasswordForEmail POSTs /auth/v1/recover?redirect_to=… — the
    // trailing * matches the query string (exact glob missed it and leaked
    // the request to the real project).
    await page.route("**/auth/v1/recover*", (route) =>
      route.fulfill({ json: {} }),
    );

    const recover = page.waitForRequest("**/auth/v1/recover*");
    await page.goto("/ar/login", { waitUntil: "domcontentloaded" });
    await awaitHydration(page);
    await page.getByRole("button", { name: FORGOT_LINK }).click();
    await expect(page.locator("#forgot-email")).toBeVisible();

    await page.locator("#forgot-email").fill(LOGIN_EMAIL);
    await page.getByRole("button", { name: SEND_RESET }).click();

    const request = await recover;
    expect(request.postDataJSON()).toMatchObject({ email: LOGIN_EMAIL });

    await expect(page.getByTestId("login-error-banner")).toContainText(
      RESET_LINK_SENT,
    );
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });
});

test.describe("signup success (email-confirmation flow)", () => {
  test("sessionless signup response shows the confirmation banner and stays put", async ({
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
    // Sessionless response: the email-confirmation contract. A `session` key
    // here would auto-login and redirect instead.
    await page.route("**/auth/v1/signup", (route) =>
      route.fulfill({
        json: { user: { id: USER_ID, email: LOGIN_EMAIL, identities: [] } },
      }),
    );

    const signup = page.waitForRequest("**/auth/v1/signup");
    await page.goto("/ar/signup", { waitUntil: "domcontentloaded" });
    await awaitHydration(page);

    await page.getByTestId("signup-email").fill(LOGIN_EMAIL);
    await page.getByTestId("signup-password").fill("Sup3rSecret!");
    await page.getByTestId("signup-confirm-password").fill("Sup3rSecret!");
    await page.getByTestId("signup-submit").click();

    const request = await signup;
    expect(request.postDataJSON()).toMatchObject({ email: LOGIN_EMAIL });

    await expect(page.getByText(SIGNUP_CONFIRMATION_SENT)).toBeVisible();
    expect(page.url()).toContain("/ar/signup");
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);

    const authCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"),
    );
    expect(
      authCookie,
      "a sessionless signup response must NOT create a session",
    ).toBeFalsy();
  });
});
