import { expect, test } from "@playwright/test";

/**
 * Downloads center + Android waitlist — spec 056.
 *
 * The GitHub Releases version lookup is SERVER-side (lib/github-releases.ts,
 * revalidate 3600), so the hero is asserted SOFT: either the release hero or
 * the localized error card may render depending on GitHub reachability from
 * the server — but never the app error boundary. The platform cards and the
 * waitlist form are static. Shell test (T-016): unmocked — anonymous shell
 * requests flow through to the real backend. Waitlist test: stays
 * route-mocked — a real POST would write rows into the live waitlist table;
 * the 201-then-409 sequence is a mutation contract.
 *
 * Local dev compile cost: 120s timeout (quiz-finish precedent; CI is a
 * prebuilt `next start`).
 */

test.setTimeout(120_000);

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث شيء ما|عذراً/;
const HERO_TITLE = "حمّل Masar X";
const GITHUB_ERROR_CARD = "تعذّر جلب آخر إصدار";
const ANDROID_SOON = "قريباً";
const WAITLIST_PLACEHOLDER = "أدخل بريدك الإلكتروني";
// The footer's WaitlistSignup is source="trw" (always rendered, independent
// of the GitHub fetch state) — its CTA is waitlist.trw.cta. The downloads
// page's own android form (platform.cta) only renders on a successful fetch.
const WAITLIST_CTA = "انضم لقائمة الانتظار";
const WAITLIST_EMAIL = "e2e-waitlist@example.com";
const WAITLIST_SUCCESS = "تمت إضافتك إلى قائمة الانتظار بنجاح!";
const WAITLIST_DUPLICATE = "أنت مسجل بالفعل في قائمة الانتظار!";

async function seedShell(page: import("@playwright/test").Page) {
  // Every load starts storage-clean: queryCache falls back to localStorage,
  // so without this a reload reuses the cached platform_settings and the
  // hydration gate below would starve — and the post-reload fill/click
  // could land pre-hydration (native form submit, no POST).
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // storage unavailable — nothing to clear
    }
  });
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
}

test.describe("downloads (anonymous)", () => {
  test("renders the shell: hero-or-error card, platform cards, waitlist form", async ({
    page,
  }) => {
    await page.goto("/ar/downloads", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    // Soft hero: the GitHub fetch is server-side; either outcome is legal.
    await expect(
      page
        .getByRole("heading", { level: 1, name: HERO_TITLE })
        .or(page.getByText(GITHUB_ERROR_CARD))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    // #platforms renders the Windows+Android grid on a successful fetch or
    // the localized error card on a failed one — never both, never nothing.
    await expect(
      page
        .locator("#platforms")
        .getByText(ANDROID_SOON)
        .or(page.locator("#platforms").getByText(GITHUB_ERROR_CARD))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    // The footer waitlist form is fetch-state-independent.
    await expect(
      page.getByRole("contentinfo").getByLabel(WAITLIST_PLACEHOLDER),
    ).toBeVisible();
    await expect(
      page.getByRole("contentinfo").getByRole("button", { name: WAITLIST_CTA }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  test("waitlist submit succeeds once, then reports the duplicate", async ({
    page,
  }) => {
    await seedShell(page);
    let submissions = 0;
    await page.route("**/rest/v1/waitlist*", (route) => {
      submissions += 1;
      if (submissions === 1) {
        return route.fulfill({ status: 201, json: { id: "waitlist-row" } });
      }
      return route.fulfill({
        status: 409,
        json: { code: "23505", message: "duplicate key value violates unique constraint" },
      });
    });

    await page.goto("/ar/downloads", { waitUntil: "domcontentloaded" });
    await page.waitForRequest("**/rest/v1/platform_settings*", { timeout: 45_000 });

    const input = page.getByRole("contentinfo").getByLabel(WAITLIST_PLACEHOLDER);
    await input.fill(WAITLIST_EMAIL);
    const first = page.waitForRequest("**/rest/v1/waitlist*");
    await page.getByRole("contentinfo").getByRole("button", { name: WAITLIST_CTA }).click();
    await first;
    await expect(page.getByText(WAITLIST_SUCCESS)).toBeVisible({ timeout: 15_000 });

    // The component unmounts its input in the success/duplicate state — a
    // fresh mount (reload) is the only way to submit again within one page.
    const rehydrated = page.waitForRequest("**/rest/v1/platform_settings*", {
      timeout: 60_000,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await rehydrated; // post-hydration: the click must hit React's onSubmit
    await page
      .getByRole("contentinfo")
      .getByLabel(WAITLIST_PLACEHOLDER)
      .fill(WAITLIST_EMAIL);
    const second = page.waitForRequest("**/rest/v1/waitlist*");
    await page.getByRole("contentinfo").getByRole("button", { name: WAITLIST_CTA }).click();
    await second;
    await expect(page.getByText(WAITLIST_DUPLICATE)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
    expect(submissions).toBe(2);
  });
});
