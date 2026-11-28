#!/usr/bin/env node
/**
 * generate-docs-image.mjs — AI image generation for repo documentation.
 *
 * Generates an image with the Gemini image model and writes it to disk, so
 * agent sessions can produce docs/media figures (guides, before/after pairs,
 * illustrations) without a committed screenshot. See docs/media/README.md
 * for the convention and docs/agents/references/14-docs-media.md for the
 * agent-facing guide.
 *
 * Usage:
 *   node scripts/generate-docs-image.mjs --prompt "…text…" \
 *        --out docs/media/<slug>-illustration.png [--ref path/to/image.png] \
 *        [--model gemini-2.5-flash-image]
 *
 * The API key is read from the environment chain (process.env → repo-root
 * .env/.env.local → apps/web/.env.local) as GEMINI_IMAGE_GEN_API_KEY and is
 * never printed. The model comes from GEMINI_IMAGE_GEN_MODEL or --model
 * (default gemini-2.5-flash-image) — image models deprecate (see the
 * reference doc), so a swap is an env/flag change, not a code change.
 *
 * Zero dependencies (Node 20+ global fetch); not covered by CI gates —
 * verify locally with `node --check` before committing changes.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MODEL = "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
    fail("Usage: node scripts/generate-docs-image.mjs --prompt \"…\" --out docs/media/<slug>.png [--ref <image>] [--model <id>]");
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

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv();
  const apiKey = env.GEMINI_IMAGE_GEN_API_KEY;
  const model = args.model ?? env.GEMINI_IMAGE_GEN_MODEL ?? DEFAULT_MODEL;
  if (!apiKey) {
    fail("GEMINI_IMAGE_GEN_API_KEY is not set — add it to apps/web/.env.local (git-ignored; see docs/agents/references/14-docs-media.md)");
  }

  const outPath = resolve(ROOT, args.out);
  if (!outPath.startsWith(resolve(ROOT, "docs") + sep)) {
    console.warn(`warn: --out is outside docs/ — docs/media/ is the convention home (see docs/media/README.md)`);
  }

  const parts = [{ text: args.prompt }];
  if (args.ref) {
    const refPath = resolve(ROOT, args.ref);
    if (!existsSync(refPath)) fail(`--ref not found: ${refPath}`);
    const mime = MIME_BY_EXT[extname(refPath).toLowerCase()];
    if (!mime) fail(`--ref must be png/jpg/jpeg/webp/gif: ${refPath}`);
    parts.push({
      inlineData: {
        mimeType: mime,
        data: readFileSync(refPath).toString("base64"),
      },
    });
  }

  const response = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    fail(`API ${response.status}: ${text.slice(0, 600)}`);
  }

  const payload = await response.json();
  const candidate = payload.candidates?.[0];
  if (!candidate) fail(`No candidate in the response: ${JSON.stringify(payload).slice(0, 400)}`);

  const imagePart = candidate.content?.parts?.find((p) => p.inlineData);
  if (!imagePart) {
    const textPart = candidate.content?.parts?.find((p) => p.text)?.text;
    fail(
      `The model returned no image${textPart ? ` — its text reply: ${textPart.slice(0, 300)}` : ""}. ` +
      `Refine the prompt (image models refuse some requests) or try a different model.`,
    );
  }

  const mime = imagePart.inlineData.mimeType ?? "image/png";
  const ext = mime.includes("jpeg") ? ".jpg" : mime.includes("webp") ? ".webp" : ".png";
  const finalPath = /\.(png|jpg|jpeg|webp)$/i.test(outPath)
    ? outPath
    : outPath + ext;
  mkdirSync(dirname(finalPath), { recursive: true });
  const bytes = Buffer.from(imagePart.inlineData.data, "base64");
  writeFileSync(finalPath, bytes);

  const textPart = candidate.content?.parts?.find((p) => p.text)?.text;
  console.log(`model:  ${model}`);
  console.log(`wrote:  ${finalPath}`);
  console.log(`size:   ${statSync(finalPath).size} bytes (${mime})`);
  if (textPart?.trim()) console.log(`note:   ${textPart.trim().slice(0, 300)}`);
  if (statSync(finalPath).size > 500 * 1024) {
    console.warn("warn: image is over the 500 KB budget — consider regenerating smaller or compressing (docs/media/README.md)");
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
