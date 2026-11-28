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
 * Optional proxy: some ISPs block *.workers.dev outright (observed 2026-11-28
 * in Egypt — every TCP connect to the subdomain times out while the worker
 * itself is healthy). Node's fetch ignores HTTPS_PROXY, so when the variable
 * is set to a SOCKS5 proxy the script tunnels the request itself:
 *   HTTPS_PROXY=socks5h://127.0.0.1:9150 node scripts/generate-docs-image.mjs …
 * (socks5h = the hostname is resolved at the proxy, which also defeats DNS
 * poisoning; Tor Browser exposes 127.0.0.1:9150 when running.) Plain http://
 * proxies are not supported.
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
import net from "node:net";
import tls from "node:tls";
import http from "node:http";

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
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return ".png";
}

/** Magic-byte sniff — the worker labels flux output image/png even when it is JPEG. */
function sniffMime(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.length > 6 && bytes.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  return null;
}

/** HTTPS_PROXY / ALL_PROXY → { host, port } for socks5:// or socks5h:// only. */
function proxyFromEnv(env) {
  const raw = env.HTTPS_PROXY ?? env.https_proxy ?? env.ALL_PROXY ?? env.all_proxy;
  if (!raw) return null;
  const m = raw.match(/^socks5h?:\/\/([^/:@]+):(\d+)\/?$/);
  if (!m) {
    fail(
      `HTTPS_PROXY "${raw.slice(0, 80)}" is not supported — use socks5://host:port or socks5h://host:port ` +
        "(plain http:// proxies are not supported; Tor Browser exposes socks5h://127.0.0.1:9150 while running)",
    );
  }
  return { host: m[1], port: Number(m[2]) };
}

/**
 * SOCKS5 CONNECT tunnel to host:port through the proxy (socks5h semantics —
 * the hostname is resolved at the proxy). Resolves with a TLS socket once the
 * handshake succeeds.
 */
function socks5Tunnel(proxy, targetHost, targetPort, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host);
    socket.setTimeout(timeoutMs);
    let stage = "greeting";
    socket.on("connect", () => socket.write(Buffer.from([0x05, 0x01, 0x00])));
    socket.on("data", function onData(chunk) {
      if (stage === "greeting") {
        if (chunk.length < 2 || chunk[0] !== 0x05 || chunk[1] !== 0x00) {
          socket.destroy();
          return reject(new Error(`socks5 proxy rejected the greeting (${proxy.host}:${proxy.port})`));
        }
        stage = "connect";
        const hostBuf = Buffer.from(targetHost, "latin1");
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(targetPort);
        socket.write(
          Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]), hostBuf, portBuf]),
        );
        return;
      }
      if (chunk.length < 2 || chunk[1] !== 0x00) {
        socket.destroy();
        return reject(new Error(`socks5 CONNECT failed (reply code ${chunk[1] ?? "?"})`));
      }
      socket.removeListener("data", onData);
      socket.setTimeout(0);
      const tlsSocket = tls.connect({ socket, servername: targetHost });
      tlsSocket.once("secureConnect", () => resolve(tlsSocket));
      tlsSocket.once("error", (error) => {
        socket.destroy();
        reject(error);
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`socks5 proxy timeout (${proxy.host}:${proxy.port})`));
    });
    socket.on("error", (error) => reject(error));
  });
}

/**
 * HTTPS POST over the tunnel — plain HTTP on an already-TLS socket, so node's
 * http client handles status/headers/chunked bodies for us. No Accept-Encoding
 * is sent, so the answer arrives uncompressed.
 */
function proxiedPost({ proxy, url, headers, body }) {
  const target = new URL(url);
  if (target.protocol !== "https:") fail("HTTPS_PROXY support covers https:// URLs only");
  const port = Number(target.port) || 443;
  return socks5Tunnel(proxy, target.hostname, port).then(
    (tlsSocket) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          {
            createConnection: () => tlsSocket,
            host: target.hostname,
            path: target.pathname + target.search,
            method: "POST",
            headers,
          },
          (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                contentType: res.headers["content-type"] ?? "",
                body: Buffer.concat(chunks),
              }),
            );
          },
        );
        req.on("error", reject);
        req.end(body);
      }),
  );
}

/** fetch when no proxy is configured; a fetch-like shim over the tunnel when one is. */
async function send(url, init, proxy) {
  if (!proxy) {
    try {
      return await fetch(url, init);
    } catch (error) {
      const text = String(error?.cause?.message ?? error?.message ?? error);
      if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH|ECONNRESET|EAI_AGAIN|certificate/i.test(text)) {
        fail(
          `${text} — if your network blocks the target host (some ISPs block *.workers.dev), ` +
            "set HTTPS_PROXY=socks5h://127.0.0.1:9150 (Tor Browser) and retry",
        );
      }
      throw error;
    }
  }
  const res = await proxiedPost({ proxy, url, headers: init.headers, body: init.body });
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? res.contentType : null) },
    text: async () => res.body.toString("utf8"),
    json: async () => JSON.parse(res.body.toString("utf8")),
    arrayBuffer: async () => res.body.buffer.slice(res.body.byteOffset, res.body.byteOffset + res.body.byteLength),
  };
}

/** POST the worker; returns { bytes, mime }. The worker answers binary image data. */
async function generateCloudflare({ prompt, model, url, apiKey, proxy }) {
  const response = await send(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ prompt, model }),
    },
    proxy,
  );
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
async function generateGemini({ prompt, model, apiKey, refPath, proxy }) {
  const parts = [{ text: prompt }];
  if (refPath) {
    const mime = MIME_BY_EXT[extname(refPath).toLowerCase()];
    if (!mime) fail(`--ref must be png/jpg/jpeg/webp/gif: ${refPath}`);
    parts.push({ inlineData: { mimeType: mime, data: readFileSync(refPath).toString("base64") } });
  }
  const response = await send(
    `${PROVIDERS.gemini.apiBase}/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    },
    proxy,
  );
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
  const proxy = proxyFromEnv(env);
  if (proxy) console.log(`proxy:    socks5 via ${proxy.host}:${proxy.port} (HTTPS_PROXY)`);

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
    result = await generateCloudflare({ prompt: args.prompt, model, url, apiKey, proxy });
  } else {
    const apiKey = env.GEMINI_IMAGE_GEN_API_KEY;
    if (!apiKey) {
      fail("GEMINI_IMAGE_GEN_API_KEY is not set — add it to apps/web/.env.local (git-ignored; see docs/agents/references/14-docs-media.md)");
    }
    const refPath = args.ref ? resolve(ROOT, args.ref) : null;
    if (refPath && !existsSync(refPath)) fail(`--ref not found: ${refPath}`);
    result = await generateGemini({ prompt: args.prompt, model, apiKey, refPath, proxy });
  }

  const sniffed = sniffMime(result.bytes);
  if (sniffed && sniffed !== result.mime) {
    console.warn(`warn: the response said ${result.mime} but the bytes are ${sniffed} — trusting the bytes`);
    result = { ...result, mime: sniffed };
  }

  const providedExt = extname(outPath).toLowerCase();
  const knownExt = MIME_BY_EXT[providedExt] ? providedExt : null;
  // Prefer the requested extension when it matches the real bytes; otherwise
  // name the file by what it actually is (a .png name over JPEG bytes breaks
  // tooling that sniffs magic bytes).
  const finalPath =
    !knownExt || MIME_BY_EXT[knownExt] !== result.mime
      ? outPath.replace(/\.(png|jpg|jpeg|webp|gif)$/i, "") + extForMime(result.mime)
      : outPath;
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
