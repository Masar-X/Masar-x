#!/usr/bin/env node
/**
 * generate-docs-image.mjs — AI image generation for repo documentation.
 *
 * Generates an image and writes it to disk, so agent sessions can produce
 * docs/media figures (guides, before/after pairs, illustrations) without a
 * committed screenshot. See docs/media/README.md for the convention and
 * docs/agents/references/14-docs-media.md for the agent-facing guide.
 *
 * Two providers:
 *   - cloudflare (default): a Workers AI image worker (free-tier neurons).
 *     Needs CF_IMAGE_GEN_URL (the worker URL) + CF_IMAGE_GEN_API_KEY in the
 *     environment chain. Text-to-image only.
 *   - gemini: Google's image model. Needs GEMINI_IMAGE_GEN_API_KEY and a
 *     billed project (free tier returns 429 "limit: 0"). Required for
 *     image-to-image edits (--ref), which the worker does not support.
 *
 * Usage:
 *   node scripts/generate-docs-image.mjs --prompt "…text…" \
 *        --out docs/media/<slug>-illustration.png \
 *        [--provider cloudflare|gemini] [--ref path/to/image.png] \
 *        [--model <id>]
 *
 * Keys are read from the environment chain (process.env → repo-root
 * .env/.env.local → apps/web/.env.local) and are never printed. Models come
 * from flags or env vars (CF_IMAGE_GEN_MODEL / GEMINI_IMAGE_GEN_MODEL) —
 * image models deprecate, so a swap is an env change, not a code change.
 *
 * Zero dependencies (Node 20+ global fetch); not covered by CI gates —
 * verify locally with `node --check` before committing changes.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PROVIDERS = {
  cloudflare: {
    defaultModel: "@cf/black-forest-labs/flux-1-schnell",
    modelEnv: "CF_IMAGE_GEN_MODEL",
  },
  gemini: {
    defaultModel: "gemini-2.5-flash-image",
    modelEnv: "GEMINI_IMAGE_GEN_MODEL",
    apiBase: "https://generativelanguage.googleapis.com/v1beta/models",
  },
};

/** audit-rls.mjs loadEnv pattern, extended with apps/web/.env.local. */
function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local", "apps/web/.env.local"]) {
    const full = resolve(ROOT, file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith("--")) fail(`Unexpected argument: ${flag}`);
    const key = flag.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) fail(`Missing value for --${key}`);
    args[key] = next;
    i++;
  }
  if (!args.prompt || !args.out) {
    fail(
      "Usage: node scripts/generate-docs-image.mjs --prompt \"…\" --out docs/media/<slug>.png " +
        "[--provider cloudflare|gemini] [--ref <image>] [--model <id>]",
    );
  }
  return args;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function extForMime(mime) {
  return mime.includes("jpeg") ? ".jpg" : mime.includes("webp") ? ".webp" : ".png";
}

/** POST the worker; returns { bytes, mime }. The worker answers binary image data. */
async function generateCloudflare({ prompt, model, url, apiKey }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ prompt, model }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    const text = await response.text();
    // A 401 from the worker means the API key is wrong; from Cloudflare's edge
    // (html) it usually means the worker URL/subdomain is not live yet.
    const hint = response.status === 401 && !contentType.includes("json")
      ? " — the worker URL may not be live yet (workers.dev subdomain must exist)"
      : "";
    fail(`cloudflare API ${response.status}: ${text.slice(0, 600)}${hint}`);
  }
  if (!contentType.startsWith("image/")) {
    const text = await response.text();
    fail(`cloudflare: expected image data, got ${contentType || "unknown"}: ${text.slice(0, 400)}`);
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), mime: contentType };
}

/** POST generateContent; returns { bytes, mime, note }. */
async function generateGemini({ prompt, model, apiKey, refPath }) {
  const parts = [{ text: prompt }];
  if (refPath) {
    const mime = MIME_BY_EXT[extname(refPath).toLowerCase()];
    if (!mime) fail(`--ref must be png/jpg/jpeg/webp/gif: ${refPath}`);
    parts.push({ inlineData: { mimeType: mime, data: readFileSync(refPath).toString("base64") } });
  }
  const response = await fetch(`${PROVIDERS.gemini.apiBase}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    fail(`gemini API ${response.status}: ${text.slice(0, 600)}`);
  }
  const payload = await response.json();
  const candidate = payload.candidates?.[0];
  if (!candidate) fail(`gemini: no candidate in the response: ${JSON.stringify(payload).slice(0, 400)}`);
  const imagePart = candidate.content?.parts?.find((p) => p.inlineData);
  if (!imagePart) {
    const textPart = candidate.content?.parts?.find((p) => p.text)?.text;
    fail(
      `gemini: the model returned no image${textPart ? ` — its text reply: ${textPart.slice(0, 300)}` : ""}. ` +
        `Refine the prompt (image models refuse some requests) or try a different model.`,
    );
  }
  const note = candidate.content?.parts?.find((p) => p.text)?.text?.trim();
  return {
    bytes: Buffer.from(imagePart.inlineData.data, "base64"),
    mime: imagePart.inlineData.mimeType ?? "image/png",
    note,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv();

  // --ref needs an image-to-image model → gemini is the only provider for it.
  const providerName = args.provider ?? (args.ref ? "gemini" : "cloudflare");
  const provider = PROVIDERS[providerName];
  if (!provider) fail(`Unknown provider "${providerName}" — use cloudflare or gemini.`);
  if (providerName === "cloudflare" && args.ref) {
    fail("--ref (image-to-image) is gemini-only — pass --provider gemini or drop --ref.");
  }

  const model = args.model ?? env[provider.modelEnv] ?? provider.defaultModel;
  const outPath = resolve(ROOT, args.out);
  if (!outPath.startsWith(resolve(ROOT, "docs") + sep)) {
    console.warn("warn: --out is outside docs/ — docs/media/ is the convention home (see docs/media/README.md)");
  }

  let result;
  if (providerName === "cloudflare") {
    const url = env.CF_IMAGE_GEN_URL;
    const apiKey = env.CF_IMAGE_GEN_API_KEY;
    if (!url || !apiKey) {
      fail("CF_IMAGE_GEN_URL / CF_IMAGE_GEN_API_KEY are not set — add them to apps/web/.env.local (git-ignored; see docs/agents/references/14-docs-media.md)");
    }
    result = await generateCloudflare({ prompt: args.prompt, model, url, apiKey });
  } else {
    const apiKey = env.GEMINI_IMAGE_GEN_API_KEY;
    if (!apiKey) {
      fail("GEMINI_IMAGE_GEN_API_KEY is not set — add it to apps/web/.env.local (git-ignored; see docs/agents/references/14-docs-media.md)");
    }
    const refPath = args.ref ? resolve(ROOT, args.ref) : null;
    if (refPath && !existsSync(refPath)) fail(`--ref not found: ${refPath}`);
    result = await generateGemini({ prompt: args.prompt, model, apiKey, refPath });
  }

  const finalPath = /\.(png|jpg|jpeg|webp)$/i.test(outPath) ? outPath : outPath + extForMime(result.mime);
  mkdirSync(dirname(finalPath), { recursive: true });
  writeFileSync(finalPath, result.bytes);

  const size = statSync(finalPath).size;
  console.log(`provider: ${providerName}`);
  console.log(`model:    ${model}`);
  console.log(`wrote:    ${finalPath}`);
  console.log(`size:     ${size} bytes (${result.mime})`);
  if (result.note) console.log(`note:     ${result.note.slice(0, 300)}`);
  if (size > 500 * 1024) {
    console.warn("warn: image is over the 500 KB budget — consider regenerating smaller or compressing (docs/media/README.md)");
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
