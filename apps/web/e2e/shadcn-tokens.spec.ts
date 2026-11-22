import { expect, test, type Page } from "@playwright/test";

/**
 * shadcn token wiring e2e — spec 057 (#282).
 *
 * Before this spec, the shadcn semantic utilities (bg-background,
 * text-muted-foreground, ring-ring, …) generated NO CSS: their --color-*
 * tokens were never wired into the @theme block, so 179 audited call sites
 * silently rendered transparent/inherit. Spec 046 healed only
 * --color-border. This pins the rest two ways:
 *
 *   (a) CSSOM — every previously-dead class must EMIT a rule referencing
 *       its var(--color-*) token. Tailwind v4 emits no utility when the
 *       @theme token is missing, so a missing rule is the regression
 *       signature (traverses @layer/@media/@supports wrappers).
 *   (b) Painted — representative elements on the home page compute to the
 *       ACTIVE theme's :root triplet, via the canvas-readback pattern from
 *       titlebar-border.spec.ts (Chromium serializes hsl(var(--*)) in
 *       modern color spaces; string-parsing rgb() is not enough). The
 *       reference swatch is built from the live documentElement triplet, so
 *       light and dark both verify without hard-coded values.
 */

const ERROR_BOUNDARY = /Application error|Something went wrong|حدث خطأ|حدث شيء ما|عذراً/;

/** [class, css property, --color-* token name] — all 15 previously dead. */
const PREVIOUSLY_DEAD: Array<[string, string, string]> = [
  ["bg-background", "background-color", "background"],
  ["text-foreground", "color", "foreground"],
  ["bg-card", "background-color", "card"],
  ["bg-primary", "background-color", "primary"],
  ["text-primary", "color", "primary"],
  ["bg-secondary", "background-color", "secondary"],
  ["text-secondary-foreground", "color", "secondary-foreground"],
  ["bg-muted", "background-color", "muted"],
  ["text-muted-foreground", "color", "muted-foreground"],
  ["bg-accent", "background-color", "accent"],
  ["text-accent-foreground", "color", "accent-foreground"],
  ["bg-destructive", "background-color", "destructive"],
  ["text-destructive", "color", "destructive"],
  ["border-input", "border-color", "input"],
  ["ring-ring", "--tw-ring-color", "ring"],
];

/** Hermetic guest: no auth session, empty content tables. */
async function mockGuestApi(page: Page): Promise<void> {
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({ json: { id: null, email: null, aud: null } }),
  );
  await page.route("**/auth/v1/token*", (route) =>
    route.fulfill({ json: { error: "no_session" } }),
  );
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
}

test.describe("shadcn token wiring (spec 057)", () => {
  test("(a) every previously-dead class emits a CSS rule bound to its token", async ({
    page,
  }) => {
    await mockGuestApi(page);
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);

    const missing = await page.evaluate((expected) => {
      const flat: string[] = [];
      const walk = (rules: CSSRuleList): void => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            flat.push(`${rule.selectorText}\u0000${rule.style.cssText}`);
          } else if ("cssRules" in rule) {
            walk((rule as CSSRule & { cssRules: CSSRuleList }).cssRules);
          }
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules);
        } catch {
          continue; // cross-origin sheet (CDN fonts) — not ours
        }
      }
      return (expected as Array<[string, string, string]>).filter(
        ([cls, prop, token]) =>
          !flat.some(
            (entry) =>
              entry.includes(cls) &&
              entry
                .split("\u0000")[1]
                .toLowerCase()
                .includes(`var(--color-${token})`) &&
              // The property/custom-prop this utility sets must be present.
              entry.split("\u0000")[1].toLowerCase().includes(prop),
          ),
      );
    }, PREVIOUSLY_DEAD);

    expect(
      missing.map((m) => m[0]),
      "classes emitting no CSS — token unwired or utility missing",
    ).toEqual([]);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`(b) painted values track the ACTIVE theme triplet (${theme})`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));

      await mockGuestApi(page);
      await page.addInitScript((t) => {
        window.localStorage.setItem("theme", t);
      }, theme);
      await page.goto("/en", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
      if (theme === "dark") {
        await expect(page.locator("html.dark")).toBeAttached({
          timeout: 15_000,
        });
      }

      // Inject throwaway probe elements carrying the utilities: this tests
      // the CLASS → token resolution in the live cascade directly, without
      // coupling to any page's specific markup (which shifts constantly).
      // bg-primary was transparent + text-muted-foreground was inherited
      // body color before spec 057 wired the tokens. Canvas readback
      // normalizes whatever color space Chromium serializes (spec 046).
      const result = await page.evaluate(() => {
        const bytes = (color: string): number[] => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data);
        };
        const triplet = (token: string): string =>
          getComputedStyle(document.documentElement)
            .getPropertyValue(token)
            .trim();
        const bg = document.createElement("div");
        bg.className = "bg-primary";
        document.body.appendChild(bg);
        const fg = document.createElement("div");
        fg.className = "text-muted-foreground";
        document.body.appendChild(fg);
        const bgColor = getComputedStyle(bg).backgroundColor;
        const fgColor = getComputedStyle(fg).color;
        bg.remove();
        fg.remove();
        return {
          bg: bytes(bgColor),
          fg: bytes(fgColor),
          bgRef: bytes(`hsl(${triplet("--primary")})`),
          fgRef: bytes(`hsl(${triplet("--muted-foreground")})`),
          bgRaw: bgColor,
          fgRaw: fgColor,
        };
      });

      // Guard the guard: the probe elements must have resolved real colors,
      // not the transparent/inherit state that dead tokens produced.
      expect(result.bgRaw).not.toBe("rgba(0, 0, 0, 0)");
      expect(result.bg).toEqual(result.bgRef);
      expect(result.fg).toEqual(result.fgRef);

      expect(pageErrors, "no uncaught page errors").toEqual([]);
    });
  }
});
