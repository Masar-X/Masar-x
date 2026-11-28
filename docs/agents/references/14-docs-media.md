# 14 — Docs media (guides, before/after, AI illustrations)

When a PR or spec benefits from visual material — perf-wave before/after pairs, UI-spec mockups, guide figures, brand-consistent illustrations — produce it into [`docs/media/`](../../media/) instead of leaving docs text-only. The convention, honesty rules, and budget live in [`docs/media/README.md`](../../media/README.md); this page is the agent-facing how-to.

## When to produce media

- **Visual PRs deserve visual evidence**: layout/theme changes, desktop-shell work, sidenav/footer work → a before/after pair beats prose.
- **Specs proposing UI changes** → a generated mockup (`-illustration` or `-mockup` naming) makes the intent reviewable before any code.
- **Guides/docs explaining flows** → a figure where a paragraph would need three paragraphs.
- Perf measurements: prefer real numbers/screenshots (Lighthouse, traces) — generated images never substitute measurement evidence.

## Generating

```bash
node scripts/generate-docs-image.mjs --prompt "…" --out docs/media/<slug>-illustration.png
node scripts/generate-docs-image.mjs --prompt "…" --ref docs/images/screenshot-web.png --out docs/media/<slug>-after.png
```

- Key: `GEMINI_IMAGE_GEN_API_KEY` in `apps/web/.env.local` (git-ignored). If missing, tell the owner to add it — never ask them to paste it in chat, never commit or echo it.
- Model: `GEMINI_IMAGE_GEN_MODEL` env or `--model` flag; default `gemini-2.5-flash-image`.
- The script refuses nothing silently: API errors print and exit 1; refusals (safety/policy) come back as text — refine the prompt.

## Traps

- 🔴 **Image generation needs a billed Gemini project.** Free-tier keys return `429 … limit: 0, model: …` on every image model (verified 2026-11-28 against a fresh free-tier key), and older ids 404. The API call pipeline itself is model-independent — if the key reports limit 0, escalate to the owner: enable billing (pay-as-you-go) on the AI Studio project, or supply a key from a billed project.
- 🔴 **Image models deprecate on Google's schedule** (`gemini-2.5-flash-image` retires 2027-03-15; a "Nano Banana Pro"/Gemini-3 successor exists). A 404 "model not found" on generate = swap the model via `GEMINI_IMAGE_GEN_MODEL` or `--model` — no code change; check [aistudio.google.com/docs/models](https://aistudio.google.com/docs/models) for current ids.
- 🔴 `generationConfig.responseModalities` must include `"IMAGE"` — omitting it yields text-only replies (the script surfaces the model's text as the error note).
- The honesty rule from `docs/media/README.md` is a hard rule: generated ≠ screenshot. Reviewers should be able to tell from the filename alone.
- The script is deliberately outside CI gates (root `scripts/` is unlinted) — run `node --check scripts/generate-docs-image.mjs` after editing it.
