# Docs media

Visual evidence and illustration assets that live in the git history: guides' figures, before/after comparisons, and AI-generated illustrations. Real screenshots of the product belong in [`docs/images/`](../images/) and brand assets in [`docs/design/`](../design/) — this directory is for everything else, especially generated material.

## What belongs here

| Kind | Naming | Source |
|---|---|---|
| Guide/tutorial figure | `<slug>.png` | real screenshot, diagram, or generated illustration |
| Before/after pair | `<slug>-before.png` / `<slug>-after.png` | real screenshots for behavior claims; generated mockups only for design proposals |
| AI illustration | `<slug>-illustration.png` | `scripts/generate-docs-image.mjs` |

## The honesty rule

**Never present a generated image as a real product screenshot.** Claims about actual behavior are proven with real screenshots (`docs/images/`) or test output; generated images illustrate design intent, concepts, and documentation visuals, and their names say so (`-illustration`). A generated "after" is only acceptable for design proposals — never as evidence that something shipped.

## Generating images

```bash
# text-to-image
node scripts/generate-docs-image.mjs \
  --prompt "An isometric illustration of a study platform: lectures, quizzes, AI tutor" \
  --out docs/media/onboarding-illustration.png

# image-to-image (edit an existing "before" into a mockup) — gemini provider
node scripts/generate-docs-image.mjs \
  --prompt "Apply the dark theme to this interface, keep the layout" \
  --ref docs/images/screenshot-web.png \
  --out docs/media/dark-theme-mockup.png
```

Text-to-image defaults to a Cloudflare Workers AI worker (free tier); `--ref` edits use Gemini, which needs a billed project.

The API key lives in `apps/web/.env.local` (`GEMINI_IMAGE_GEN_API_KEY` — git-ignored, never commit or echo it). The model comes from `GEMINI_IMAGE_GEN_MODEL` or `--model`; image models deprecate, so a swap is an env change (see [docs/agents/references/14-docs-media.md](../agents/references/14-docs-media.md)). Note: image generation requires a **billed** Gemini project — free-tier keys are quota-blocked (`429 … limit: 0`); see the reference doc's traps.

## Budget

Keep committed images ≤ ~500 KB and at sensible dimensions (illustrations ~1024–1536 px wide is plenty for docs rendering). The script warns over budget. Git history keeps binaries forever — regenerate smaller instead of stacking hi-res variants.
