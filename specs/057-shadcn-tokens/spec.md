# Spec 057 — Wire the dead shadcn semantic-token layer (#282)

> | | |
> |---|---|
> | **Branch** | `feat/057-shadcn-tokens` |
> | **Created** | 2026-11-22 |
> | **Status** | Approved (owner — plan approval in session; wiring scope + delivery locked via AskUserQuestion) |
> | **Type** | Theming (CSS tokens + e2e regression probe) |
> | **Baseline** | `origin/main` `8372c73` |
> | **Origin** | spec-046 scope guard (`specs/046-scrollbar-polish/spec.md:115-120`) + issue #282 |

---

## 1. Context & problem statement

The shadcn semantic utility classes (`bg-background`, `text-muted-foreground`, `ring-ring`,
`bg-card`, …) generate **no CSS** in Tailwind v4: the matching `--color-*` tokens were never
added to the `@theme` block in `apps/web/src/index.css`. Spec 046 healed only `--color-border`
(#231, 12 sites) and deferred the rest.

**Exact audit (2026-11-22, supersedes the "~98 sites" estimate):**

| Count | Class | Missing token |
|---|---|---|
| 41 | `text-muted-foreground` | `--color-muted-foreground` |
| 23 | `ring-ring` | `--color-ring` |
| 22 | `text-foreground` | `--color-foreground` |
| 18 | `bg-accent` | `--color-accent` |
| 16 | `bg-background` | `--color-background` |
| 13 | `bg-primary` | `--color-primary` |
| 10 | `text-primary` | `--color-primary` |
| 10 | `bg-muted` | `--color-muted` |
| 5 | `text-accent-foreground` | `--color-accent-foreground` |
| 5 | `border-input` | `--color-input` |
| 5 | `bg-destructive` | `--color-destructive` |
| 4 | `bg-secondary` | `--color-secondary` |
| 3 | `text-destructive` | `--color-destructive` |
| 2 | `text-secondary-foreground` | `--color-secondary-foreground` |
| 2 | `bg-card` | `--color-card` |

**Total: 179 dead occurrences / 124 dead lines / 25 files.** 15 of 17 classes with hits are
dead; only `border-border` and `text-primary-foreground` resolve. Zero hits for the remaining
shadcn classes (`bg-popover`, `text-card-foreground`, …). Hotspots: `components/ui/` primitives
(Button, Badge, Input, Textarea, Tabs, Card), desktop chrome (CustomTitlebar, UpdateToast,
AssistantPanel, ReaderToolbar, LectureListColumn, StudyWorkspace, DocumentReader), and
`app/[locale]/trw/*` pages.

**The fix is purely additive:** all 19 shadcn HSL triplets already exist in `:root`
(`index.css:163-191`) and `.dark` (`222-249`) — the call sites were authored against them.

## 2. Owner decisions (locked 2026-11-22)

- **Wiring scope: ALL 15 dead classes** (13 unique live tokens + 4 zero-usage triplets for
  full shadcn parity — no visual delta on the extras). Rationale: the `:root`/`.dark` values
  are the app's own palette the sites were authored against; dead classes currently render
  transparent/inherit, so wiring RESTORES intended design (e.g. authored `bg-accent` hover
  states start painting).
- **Delivery: ONE PR** (the code change is 17 CSS lines; the risk is visual and is covered by
  a computed-color regression probe + screenshot matrix).

## 3. Deliverables

1. `apps/web/src/index.css` `@theme`: wire the 17 unwired triplets (`--color-*: hsl(var(--*))`),
   replacing the stale "still dead (~98 sites)" comment.
2. `apps/web/e2e/shadcn-tokens.spec.ts`: regression probe — (a) CSSOM rule-existence checks for
   every previously-dead class (Tailwind v4 emits no utility when the token is unwired, so a
   missing rule = regression), (b) painted-element checks on the home page (light + dark) using
   the canvas-readback pattern from `e2e/titlebar-border.spec.ts` (Chromium serializes
   `hsl(var(--*))` in modern color spaces), comparing element bytes against a reference swatch
   built from the ACTIVE theme's `:root` triplet — theme-agnostic, no hard-coded values.
3. Visual evidence: light/dark × ar/en screenshots of `/`, `/subjects`, one trw page attached
   to the PR for the owner's eyeball pass (spec-026 recipe).

## 4. Risks & mitigations

- **Visual drift** on surfaces that accidentally relied on a dead class doing nothing (the
  "transparent/inherit/hover-noop consequences" from spec 046) → probe + screenshot matrix +
  owner eyeball pass before merge.
- **Dark-mode regressions** → probe asserts painted bytes against the ACTIVE theme's triplet;
  `.dark` triplets verified the same way as light.
- No behavioral/product-code changes — CSS tokens + tests only.

## 5. Out of scope

- Switching any call site to explicit colors (owner declined the selective path).
- New semantic tokens beyond the shadcn triplets (the `ax-*` admin palette is separate).
