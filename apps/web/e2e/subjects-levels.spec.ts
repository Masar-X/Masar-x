import { expect, test } from "@playwright/test";

/**
 * Subjects profile scoping — owner decision 2026-11-05 (supersedes the
 * spec 034 level tabs): level selection lives in the profile, so /subjects
 * renders no tab bar and the subjects query is scoped server-side to the
 * viewer's profile level (useSubjects default path).
 *
 * Unmocked real-data variant (T-016): the guest request is OBSERVED, not
 * intercepted (page.on("request") — the real call goes through to the live
 * Supabase project). The guest fallback (profile level null → 1) still
 * scopes the query, the anonymous show_on_home filter is preserved, and the
 * real seed data renders at least one subject card. The signed-in variant
 * (profile level N → level.eq.N) is covered by the useSubjects unit tests —
 * authed Playwright runs need the seeded-cookie contract, which the server
 * rejects (spec 056).
 */

test.describe("subjects profile scoping (no level tabs)", () => {
  test("anonymous visitor: no tab bar, level-1 scoped query with show_on_home", async ({
    page,
  }) => {
    let subjectsUrl = "";
    page.on("request", (request) => {
      if (request.url().includes("/rest/v1/subjects")) {
        subjectsUrl = decodeURIComponent(request.url());
      }
    });

    await page.goto("/ar/subjects", { waitUntil: "domcontentloaded" });

    // The spec 034 tab bar is gone — level comes from the profile only.
    await expect(page.getByTestId("subjects-level-tabs")).toHaveCount(0);
    await expect(page.getByTestId("subjects-level-tab")).toHaveCount(0);

    // Guest fallback (profile level null → 1) scopes the query, and the
    // anonymous show_on_home filter is preserved — asserted on the real
    // request the page actually sent.
    await expect.poll(() => subjectsUrl).toContain("level.eq.1");
    await expect.poll(() => subjectsUrl).toContain("show_on_home=eq.true");

    // Real seed data renders the guest's scoped slice of the catalog.
    await expect(page.locator('main [data-testid="subject-card"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
