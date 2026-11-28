# 14 — Docs media (guides, before/after, AI illustrations)

When a PR or spec benefits from visual material — perf-wave before/after pairs, UI-spec mockups, guide figures, brand-consistent illustrations — produce it into [`docs/media/`](../../media/) instead of leaving docs text-only. The convention, honesty rules, and budget live in [`docs/media/README.md`](../../media/README.md); this page is the agent-facing how-to.

## When to produce media

- **Visual PRs deserve visual evidence**: layout/theme changes, desktop-shell work, sidenav/footer work → a before/after pair beats prose.
- **Specs proposing UI changes** → a generated mockup (`-illustration` or `-mockup` naming) makes the intent reviewable before any code.
- **Guides/docs explaining flows** → a figure where a paragraph would need three paragraphs.
- Perf measurements: prefer real numbers/screenshots (Lighthouse, traces) — generated images never substitute measurement evidence.

## Generating

Two providers; the script picks `cloudflare` unless `--ref` is given (then `gemini`). `--provider` overrides.

```bash
# text-to-image — Cloudflare Workers AI worker (free tier), the default
node scripts/generate-docs-image.mjs --prompt "…" --out docs/media/<slug>-illustration.png

# image-to-image edit — gemini only (the worker has no edit support)
node scripts/generate-docs-image.mjs --prompt "…" --ref docs/images/screenshot-web.png --out docs/media/<slug>-mockup.png
```

| Provider | Env (in `apps/web/.env.local`, git-ignored) | Default model | Notes |
|---|---|---|---|
| `cloudflare` | `CF_IMAGE_GEN_URL` (worker URL) + `CF_IMAGE_GEN_API_KEY` | `@cf/black-forest-labs/flux-1-schnell` (`CF_IMAGE_GEN_MODEL` / `--model`) | Free Workers AI neurons; text-to-image only. Worker source lives outside this repo (a Workers AI binding + `API_KEY` secret). |
| `gemini` | `GEMINI_IMAGE_GEN_API_KEY` | `gemini-2.5-flash-image` (`GEMINI_IMAGE_GEN_MODEL` / `--model`) | Needs a **billed** project; required for `--ref`. |

Keys are never committed or echoed. If one is missing, tell the owner to add it to the file — never ask them to paste it in chat. The script refuses nothing silently: API errors print and exit 1; refusals (safety/policy) come back as text — refine the prompt.

If the network blocks the target host, set `HTTPS_PROXY=socks5h://127.0.0.1:9150` (Tor Browser's SOCKS port while it runs) — the script tunnels the request itself because node's fetch ignores the variable. Plain `http://` proxies are not supported.

## Traps

- 🔴 **A Cloudflare HTML 401/404 from the worker URL means the URL is not live, not a bad key** — a `workers.dev` subdomain must exist on the account (created by opening the Workers & Pages dashboard once); API tokens cannot create it (`10405 Method not allowed for this authentication scheme`). The script appends that hint on a non-JSON 401.
- 🔴 **ISP-level blocking of `*.workers.dev`** (Egypt, observed 2026-11-28): every TCP connect to the subdomain times out while the worker is healthy — proven by a Tor-routed test reaching the worker's Bearer gate (`{"error":"Unauthorized"}`) and by a full generation through `HTTPS_PROXY=socks5h://127.0.0.1:9150`. On a bare connection failure without a proxy the script suggests setting it.
- 🔴 **Trust the magic bytes, not the content-type**: the worker labels flux output `image/png` even when the bytes are JPEG — the script sniffs and names the file accordingly (`.jpg` for JPEG); a `.png` name over JPEG bytes breaks magic-byte tooling.
- 🔴 **Gemini image generation needs a billed project.** Free-tier keys return `429 … limit: 0, model: …` on every image model (verified 2026-11-28 against a fresh free-tier key), and older ids 404. Use the cloudflare provider for plain text-to-image, or escalate to the owner for billing.
- 🔴 **Image models deprecate on the provider's schedule** (`gemini-2.5-flash-image` retires 2027-03-15). A 404 "model not found" on generate = swap the model via the `*_IMAGE_GEN_MODEL` env or `--model` — no code change.
- 🔴 `--ref` with `--provider cloudflare` is rejected up front (the worker has no image input).
- 🔴 Gemini `generationConfig.responseModalities` must include `"IMAGE"` — omitting it yields text-only replies (the script surfaces the model's text as the error note).
- The honesty rule from `docs/media/README.md` is a hard rule: generated ≠ screenshot. Reviewers should be able to tell from the filename alone.
- The script is deliberately outside CI gates (root `scripts/` is unlinted) — run `node --check scripts/generate-docs-image.mjs` after editing it.
