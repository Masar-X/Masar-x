#!/usr/bin/env node
/**
 * Masar X Task System CLI (`scripts/tasks.mjs`)
 *
 * Zero-dependency Node 24 ESM coordinator for `docs/tasks/T-*.md` cards.
 * Subcommands:
 *   status
 *   next [--dry-run] [--force]
 *   release <T-XXX> [--force]
 *   sync-issues [--apply]
 *   lint
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_WIP_LIMIT = 3;
export const DEFAULT_REPO = "Masar-X/Masar-x";
export const HOURS_24_MS = 24 * 60 * 60 * 1000;

export const PRIORITY_ORDER = Object.freeze({ P0: 0, P1: 1, P2: 2 });
export const VALID_PRIORITIES = Object.freeze(["P0", "P1", "P2"]);
export const VALID_STATUSES = Object.freeze(["todo", "done"]);
export const REQUIRED_FRONTMATTER_KEYS = Object.freeze([
  "id",
  "title",
  "priority",
  "status",
  "depends_on",
  "touches",
  "owner_action",
  "area",
  "estimate",
]);
export const REQUIRED_SECTIONS = Object.freeze([
  "Context",
  "Goal",
  "Non-goals",
  "Steps",
  "Acceptance criteria",
  "Evidence",
  "Rollback",
  "Open questions",
]);

const TASK_ID_RE = /^T-\d{3,}[a-z]?$/;
const CHECKED_ITEM_RE = /^\s*-\s*\[[xX]\]/;
const EVIDENCE_LINE_RE = /^\s*evidence:\s*\S+/;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * Normalize a file or glob path to POSIX `/` separators, collapsing duplicates
 * and stripping leading `./` or `/`.
 */
export function normalizePosixPath(input) {
  let s = String(input ?? "").trim().replace(/\\/g, "/");
  s = s.replace(/\/+/g, "/");
  while (s.startsWith("./")) s = s.slice(2);
  s = s.replace(/^\/+/, "");
  return s;
}

/**
 * Strip `#` comments from a YAML line outside single/double quotes.
 */
export function stripYamlComment(line) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      if (quote === ch) {
        quote = null;
      } else if (quote === null) {
        quote = ch;
      }
      continue;
    }
    if (ch === "#" && quote === null) {
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

/**
 * Parse a single YAML scalar token into boolean or string.
 */
export function parseYamlScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    const inner = trimmed.slice(1, -1);
    if (trimmed.startsWith('"')) {
      return inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return inner.replace(/''/g, "'");
  }
  return trimmed;
}

/**
 * Parse a YAML inline array like `[a, "b", c]`.
 */
export function parseInlineArray(raw) {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  const items = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (quote === '"' && ch === "\\") {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      if (quote === ch) quote = null;
      else if (quote === null) quote = ch;
      current += ch;
      continue;
    }
    if (ch === "," && quote === null) {
      if (current.trim() !== "") items.push(parseYamlScalar(current));
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") {
    items.push(parseYamlScalar(current));
  }
  return items;
}

/**
 * Parse YAML frontmatter from a markdown task card.
 * Supports strings, booleans, inline arrays `[a, b]`, multiline `- item` arrays, and `#` comments.
 */
export function parseFrontmatter(markdown, filePath = "<memory>") {
  const normalized = String(markdown ?? "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const errors = [];

  if (lines[0]?.trim() !== "---") {
    return {
      data: {},
      body: normalized,
      bodyStartLine: 1,
      keyLines: {},
      errors: [`${filePath}:1: missing opening YAML frontmatter delimiter '---'`],
    };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return {
      data: {},
      body: normalized,
      bodyStartLine: 1,
      keyLines: {},
      errors: [`${filePath}:1: missing closing YAML frontmatter delimiter '---'`],
    };
  }

  const data = {};
  const keyLines = {};
  let currentArrayKey = null;

  for (let i = 1; i < endIdx; i++) {
    const lineNo = i + 1;
    const stripped = stripYamlComment(lines[i]).trimEnd();
    if (!stripped.trim()) continue;

    const listMatch = stripped.match(/^\s*-\s+(.*)$/);
    if (listMatch) {
      if (!currentArrayKey) {
        errors.push(`${filePath}:${lineNo}: unexpected list item outside array key`);
        continue;
      }
      if (!Array.isArray(data[currentArrayKey])) {
        data[currentArrayKey] = [];
      }
      data[currentArrayKey].push(parseYamlScalar(listMatch[1]));
      continue;
    }

    const kvMatch = stripped.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kvMatch) {
      errors.push(`${filePath}:${lineNo}: invalid frontmatter line: ${lines[i].trim()}`);
      currentArrayKey = null;
      continue;
    }

    const key = kvMatch[1];
    const rawVal = kvMatch[2].trim();
    keyLines[key] = lineNo;

    if (rawVal === "") {
      data[key] = [];
      currentArrayKey = key;
    } else if (rawVal.startsWith("[")) {
      if (!rawVal.endsWith("]")) {
        errors.push(`${filePath}:${lineNo}: unclosed inline array for '${key}'`);
        data[key] = [];
      } else {
        data[key] = parseInlineArray(rawVal);
      }
      currentArrayKey = null;
    } else {
      data[key] = parseYamlScalar(rawVal);
      currentArrayKey = null;
    }
  }

  const body = lines.slice(endIdx + 1).join("\n");
  return {
    data,
    body,
    bodyStartLine: endIdx + 2,
    keyLines,
    errors,
  };
}

/**
 * Load and parse all `T-*.md` cards from `tasksDir`.
 */
export function loadTaskCards(tasksDir) {
  if (!existsSync(tasksDir)) {
    return {
      cards: [],
      errors: [`Tasks directory not found: ${normalizePosixPath(tasksDir)}`],
    };
  }

  const fileNames = readdirSync(tasksDir)
    .filter((name) => /^T-.*\.md$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const cards = [];
  const errors = [];

  for (const fileName of fileNames) {
    const fullPath = path.join(tasksDir, fileName);
    const relPath = `docs/tasks/${fileName}`;
    const raw = readFileSync(fullPath, "utf8");
    const parsed = parseFrontmatter(raw, relPath);
    errors.push(...parsed.errors);

    const d = parsed.data;
    cards.push({
      fileName,
      filePath: fullPath,
      relPath,
      raw,
      body: parsed.body,
      bodyStartLine: parsed.bodyStartLine,
      keyLines: parsed.keyLines,
      frontmatterErrors: parsed.errors,
      rawFrontmatter: d,
      id: typeof d.id === "string" ? d.id : String(d.id ?? ""),
      title: typeof d.title === "string" ? d.title : String(d.title ?? ""),
      priority: d.priority,
      status: d.status,
      depends_on: Array.isArray(d.depends_on) ? d.depends_on.map(String) : d.depends_on,
      touches: Array.isArray(d.touches) ? d.touches.map((t) => normalizePosixPath(t)) : d.touches,
      owner_action: d.owner_action,
      area: typeof d.area === "string" ? d.area : String(d.area ?? ""),
      estimate: typeof d.estimate === "string" ? d.estimate : String(d.estimate ?? ""),
    });
  }

  return { cards, errors };
}

/**
 * Extract `owner/repo` slug from a git remote URL.
 */
export function parseRepoSlug(remoteUrl, fallback = DEFAULT_REPO) {
  const s = String(remoteUrl ?? "").trim();
  if (!s) return fallback;
  const sshMatch = s.match(/^[^@]+@[^:]+:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  const urlMatch = s.match(/^[a-z+]+:\/\/[^/]+\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  if (urlMatch) return urlMatch[1];
  return fallback;
}

/**
 * Parse `git ls-remote --heads origin "refs/heads/task/*"` stdout into a Set of task IDs.
 */
export function parseLsRemoteBranches(stdout) {
  const branches = new Set();
  for (const line of String(stdout ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/refs\/heads\/task\/([^\s/]+)$/);
    if (match) {
      branches.add(match[1]);
    }
  }
  return branches;
}

/**
 * Parse `gh pr list --state open --json ...` JSON output into a Map keyed by task ID.
 */
export function parseOpenPrs(jsonText) {
  const list = typeof jsonText === "string" ? JSON.parse(jsonText || "[]") : (jsonText ?? []);
  const byTaskId = new Map();
  for (const pr of list) {
    const head = String(pr?.headRefName ?? "");
    const match = head.match(/^task\/([^/]+)$/);
    if (!match) continue;
    const taskId = match[1];
    const labels = Array.isArray(pr.labels)
      ? pr.labels.map((l) => (typeof l === "string" ? l : String(l?.name ?? ""))).filter(Boolean)
      : [];
    const normalizedPr = {
      number: pr.number,
      url: pr.url ?? "",
      headRefName: head,
      labels,
      author: typeof pr.author === "string" ? pr.author : (pr.author?.login ?? ""),
    };
    const arr = byTaskId.get(taskId) ?? [];
    arr.push(normalizedPr);
    byTaskId.set(taskId, arr);
  }
  return byTaskId;
}

/**
 * Derive runtime task status from frontmatter + git/PR state.
 */
export function deriveCardStatus(card, { cardsById, remoteBranches, openPrsByTaskId }) {
  if (card.status === "done") return "done";

  const prs = openPrsByTaskId.get(card.id) ?? [];
  if (prs.length > 0) {
    const hasBlockedLabel = prs.some((pr) =>
      pr.labels.some((lbl) => {
        const lower = lbl.toLowerCase();
        return lower === "blocked" || lower === "owner-action";
      })
    );
    return hasBlockedLabel ? "blocked" : "review";
  }

  if (remoteBranches.has(card.id)) {
    return "doing";
  }

  const deps = Array.isArray(card.depends_on) ? card.depends_on : [];
  const hasUnmetDep = deps.some((depId) => {
    const dep = cardsById.get(depId);
    return !dep || dep.status !== "done";
  });
  if (hasUnmetDep) {
    return "waiting-deps";
  }

  return "todo";
}

/**
 * Sort comparator: P0 -> P1 -> P2, then ID ascending.
 */
export function compareCards(a, b) {
  const pa = PRIORITY_ORDER[a.priority] ?? 99;
  const pb = PRIORITY_ORDER[b.priority] ?? 99;
  if (pa !== pb) return pa - pb;
  return String(a.id).localeCompare(String(b.id), "en", { numeric: true });
}

/**
 * Single-segment glob intersection (handles `*`, `?`, and literals; treats `**` inside a segment as `*`).
 */
export function segmentPatternsOverlap(rawA, rawB) {
  const p1 = rawA.replace(/\*{2,}/g, "*");
  const p2 = rawB.replace(/\*{2,}/g, "*");
  const m = p1.length;
  const n = p2.length;
  const memo = new Map();

  function dp(i, j) {
    const key = i * (n + 1) + j;
    if (memo.has(key)) return memo.get(key);

    let res = false;
    if (i === m && j === n) {
      res = true;
    } else if (p1[i] === "*") {
      res = dp(i + 1, j) || (j < n && dp(i, j + 1));
    } else if (p2[j] === "*") {
      res = dp(i, j + 1) || (i < m && dp(i + 1, j));
    } else if (i < m && j < n && (p1[i] === "?" || p2[j] === "?" || p1[i] === p2[j])) {
      res = dp(i + 1, j + 1);
    }

    memo.set(key, res);
    return res;
  }

  return dp(0, 0);
}

/**
 * Multi-segment glob intersection (supports `**` matching 0+ segments).
 */
export function segmentsOverlap(segsA, segsB) {
  const m = segsA.length;
  const n = segsB.length;
  const memo = new Map();

  function dp(i, j) {
    const key = i * (n + 1) + j;
    if (memo.has(key)) return memo.get(key);

    let res = false;
    if (i === m && j === n) {
      res = true;
    } else if (i < m && segsA[i] === "**") {
      res = dp(i + 1, j) || (j < n && dp(i, j + 1));
    } else if (j < n && segsB[j] === "**") {
      res = dp(i, j + 1) || (i < m && dp(i + 1, j));
    } else if (i < m && j < n && segmentPatternsOverlap(segsA[i], segsB[j])) {
      res = dp(i + 1, j + 1);
    }

    memo.set(key, res);
    return res;
  }

  return dp(0, 0);
}

function expandPatternVariants(pattern) {
  const norm = normalizePosixPath(pattern);
  if (!norm) return [];
  if (norm.endsWith("/")) {
    const base = norm.slice(0, -1);
    if (!base) return [["**"]];
    return [[...base.split("/"), "**"]];
  }
  const segs = norm.split("/");
  const hasGlob = /[*?]/.test(norm);
  if (!hasGlob) {
    // Literal paths may denote either an exact file or a directory prefix without trailing slash.
    return [segs, [...segs, "**"]];
  }
  return [segs];
}

/**
 * Return true if two POSIX/Windows file or glob patterns can match any common path.
 */
export function globsOverlap(patternA, patternB) {
  const variantsA = expandPatternVariants(patternA);
  const variantsB = expandPatternVariants(patternB);
  for (const a of variantsA) {
    for (const b of variantsB) {
      if (segmentsOverlap(a, b)) return true;
    }
  }
  return false;
}

/**
 * Return true if any glob in `touchesA` overlaps any glob in `touchesB`.
 */
export function touchesOverlap(touchesA, touchesB) {
  if (!Array.isArray(touchesA) || !Array.isArray(touchesB)) return false;
  for (const a of touchesA) {
    for (const b of touchesB) {
      if (globsOverlap(a, b)) return true;
    }
  }
  return false;
}

/**
 * Validate all loaded task cards against schema, dependencies, required sections, and Evidence rules.
 */
export function lintCards(cards) {
  const errors = [];

  if (!cards || cards.length === 0) {
    errors.push("docs/tasks: no T-*.md card files found");
    return { ok: false, errors };
  }

  const seenIds = new Map();
  const cardsById = new Map();

  for (const card of cards) {
    errors.push(...card.frontmatterErrors);
    const d = card.rawFrontmatter;

    for (const key of REQUIRED_FRONTMATTER_KEYS) {
      if (!(key in d)) {
        errors.push(`${card.relPath}:1: missing required frontmatter key '${key}'`);
      }
    }

    const idLine = card.keyLines.id ?? 1;
    if ("id" in d) {
      if (typeof d.id !== "string" || !TASK_ID_RE.test(d.id)) {
        errors.push(`${card.relPath}:${idLine}: invalid id '${String(d.id)}' (expected T-NNN)`);
      } else if (seenIds.has(d.id)) {
        errors.push(`${card.relPath}:${idLine}: duplicate card id '${d.id}' (already in ${seenIds.get(d.id)})`);
      } else {
        seenIds.set(d.id, card.relPath);
        cardsById.set(d.id, card);
      }
    }

    if ("title" in d && (typeof d.title !== "string" || d.title.trim() === "")) {
      errors.push(`${card.relPath}:${card.keyLines.title ?? 1}: 'title' must be a non-empty string`);
    }

    if ("priority" in d && !VALID_PRIORITIES.includes(d.priority)) {
      errors.push(
        `${card.relPath}:${card.keyLines.priority ?? 1}: invalid priority '${String(d.priority)}' (expected P0|P1|P2)`
      );
    }

    if ("status" in d && !VALID_STATUSES.includes(d.status)) {
      errors.push(
        `${card.relPath}:${card.keyLines.status ?? 1}: invalid status '${String(d.status)}' (expected todo|done)`
      );
    }

    if ("depends_on" in d) {
      if (!Array.isArray(d.depends_on)) {
        errors.push(`${card.relPath}:${card.keyLines.depends_on ?? 1}: 'depends_on' must be an array`);
      } else {
        for (const dep of d.depends_on) {
          if (typeof dep !== "string" || !TASK_ID_RE.test(dep)) {
            errors.push(
              `${card.relPath}:${card.keyLines.depends_on ?? 1}: invalid depends_on entry '${String(dep)}'`
            );
          }
        }
      }
    }

    if ("touches" in d) {
      if (!Array.isArray(d.touches) || d.touches.length === 0) {
        errors.push(`${card.relPath}:${card.keyLines.touches ?? 1}: 'touches' must be a non-empty array`);
      } else if (d.touches.some((t) => typeof t !== "string" || t.trim() === "")) {
        errors.push(`${card.relPath}:${card.keyLines.touches ?? 1}: 'touches' entries must be non-empty strings`);
      }
    }

    if ("owner_action" in d && typeof d.owner_action !== "boolean") {
      errors.push(
        `${card.relPath}:${card.keyLines.owner_action ?? 1}: 'owner_action' must be boolean (true|false)`
      );
    }

    if ("area" in d && (typeof d.area !== "string" || d.area.trim() === "")) {
      errors.push(`${card.relPath}:${card.keyLines.area ?? 1}: 'area' must be a non-empty string`);
    }

    if ("estimate" in d && (typeof d.estimate !== "string" || d.estimate.trim() === "")) {
      errors.push(`${card.relPath}:${card.keyLines.estimate ?? 1}: 'estimate' must be a non-empty string`);
    }

    // Section order + Evidence rule checks
    const bodyLines = card.body.split("\n");
    const foundSections = [];
    let inFence = false;

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const absLineNo = card.bodyStartLine + i;

      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const headingMatch = line.match(/^##\s+(.+?)\s*$/);
      if (headingMatch) {
        foundSections.push({ name: headingMatch[1].trim(), line: absLineNo });
      }

      if (CHECKED_ITEM_RE.test(line)) {
        const nextLine = bodyLines[i + 1] ?? "";
        if (!EVIDENCE_LINE_RE.test(nextLine)) {
          errors.push(
            `${card.relPath}:${absLineNo}: checked item '- [x]' must be immediately followed by 'evidence: <command + output>'`
          );
        }
      }
    }

    const foundLower = foundSections.map((s) => s.name.toLowerCase());
    let lastIndex = -1;
    for (const required of REQUIRED_SECTIONS) {
      const idx = foundLower.indexOf(required.toLowerCase());
      if (idx === -1) {
        errors.push(`${card.relPath}:1: missing required section '## ${required}'`);
      } else {
        if (idx < lastIndex) {
          errors.push(
            `${card.relPath}:${foundSections[idx].line}: section '## ${required}' is out of order`
          );
        }
        lastIndex = idx;
      }
    }
  }

  // Unknown depends_on IDs + cycle detection
  for (const card of cards) {
    if (!Array.isArray(card.depends_on)) continue;
    for (const depId of card.depends_on) {
      if (!cardsById.has(depId)) {
        errors.push(
          `${card.relPath}:${card.keyLines.depends_on ?? 1}: unknown dependency '${depId}'`
        );
      }
    }
  }

  const state = new Map(); // 0/undefined = unvisited, 1 = visiting, 2 = done
  const reportedCycles = new Set();

  function dfs(id, trail) {
    state.set(id, 1);
    const card = cardsById.get(id);
    const deps = Array.isArray(card?.depends_on) ? card.depends_on : [];
    for (const depId of deps) {
      if (!cardsById.has(depId)) continue;
      const st = state.get(depId);
      if (st === 1) {
        const cycleStart = trail.indexOf(depId);
        const cycle = [...trail.slice(cycleStart), depId].join(" -> ");
        if (!reportedCycles.has(cycle)) {
          reportedCycles.add(cycle);
          errors.push(`${card.relPath}:${card.keyLines.depends_on ?? 1}: dependency cycle detected: ${cycle}`);
        }
      } else if (!st) {
        dfs(depId, [...trail, depId]);
      }
    }
    state.set(id, 2);
  }

  for (const id of cardsById.keys()) {
    if (!state.get(id)) {
      dfs(id, [id]);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Compute sorted status rows and WIP slot occupancy.
 */
export function computeStatusRows(cards, { remoteBranches, openPrsByTaskId }) {
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const rows = cards
    .map((card) => {
      const derivedStatus = deriveCardStatus(card, { cardsById, remoteBranches, openPrsByTaskId });
      const prs = openPrsByTaskId.get(card.id) ?? [];
      let refPr = "-";
      if (prs.length > 0) {
        refPr = prs.map((pr) => `#${pr.number}${pr.url ? ` ${pr.url}` : ""}`).join(", ");
      } else if (remoteBranches.has(card.id)) {
        refPr = `task/${card.id}`;
      }
      return {
        card,
        id: card.id,
        priority: card.priority,
        status: derivedStatus,
        dependsOn: card.depends_on,
        ownerAction: Boolean(card.owner_action),
        area: card.area,
        refPr,
        prs,
      };
    })
    .sort((a, b) => compareCards(a.card, b.card));

  const wipCards = rows.filter((r) => r.status === "doing" || r.status === "review");
  return {
    rows,
    wipCount: wipCards.length,
    wipCards,
  };
}

/**
 * Format the status table as aligned text.
 */
export function formatStatusTable(rows, wipCount, wipLimit = DEFAULT_WIP_LIMIT) {
  const headers = ["ID", "PRI", "STATUS", "DEPENDS_ON", "OWNER_ACTION", "AREA", "REF/PR"];
  const matrix = [
    headers,
    ...rows.map((r) => [
      r.id,
      r.priority,
      r.status,
      Array.isArray(r.dependsOn) && r.dependsOn.length ? r.dependsOn.join(",") : "-",
      r.ownerAction ? "true" : "false",
      r.area,
      r.refPr,
    ]),
  ];

  const widths = headers.map((_, col) =>
    Math.max(...matrix.map((row) => String(row[col] ?? "").length))
  );

  const formatRow = (row) =>
    row.map((cell, col) => String(cell ?? "").padEnd(widths[col])).join("  ").trimEnd();

  const lines = [
    formatRow(matrix[0]),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...matrix.slice(1).map(formatRow),
    "",
    `WIP (doing + review): ${wipCount}/${wipLimit}`,
  ];
  return lines.join("\n");
}

/**
 * Select ordered eligible `todo` candidates that do not overlap active `doing`/`review`/`blocked` cards.
 */
export function selectNextCandidates(
  cards,
  gitState,
  { wipLimit = DEFAULT_WIP_LIMIT, force = false } = {}
) {
  const { rows, wipCount, wipCards } = computeStatusRows(cards, gitState);

  if (wipCount >= wipLimit && !force) {
    return {
      ok: false,
      reason: "wip-limit",
      wipCount,
      wipLimit,
      wipCards,
      candidates: [],
      skipped: [],
    };
  }

  const activeRows = rows.filter(
    (r) => r.status === "doing" || r.status === "review" || r.status === "blocked"
  );
  const candidates = [];
  const skipped = [];

  for (const row of rows) {
    if (row.status !== "todo") {
      skipped.push({ id: row.id, reason: `status=${row.status}` });
      continue;
    }

    const overlapping = activeRows.filter((active) =>
      touchesOverlap(row.card.touches, active.card.touches)
    );
    if (overlapping.length > 0) {
      const names = overlapping.map((o) => `${o.id} (${o.status})`).join(", ");
      skipped.push({ id: row.id, reason: `touches overlap with ${names}` });
      continue;
    }

    candidates.push(row.card);
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "no-eligible",
      wipCount,
      wipLimit,
      wipCards,
      candidates: [],
      skipped,
    };
  }

  return {
    ok: true,
    reason: null,
    wipCount,
    wipLimit,
    wipCards,
    candidates,
    skipped,
  };
}

/**
 * Build `gh issue create` CLI args for a task card.
 */
export function buildIssueCreateArgs(card, { repo = DEFAULT_REPO } = {}) {
  const title = `${card.id} ${card.title}`;
  const deps = Array.isArray(card.depends_on) ? card.depends_on : [];
  const body = [
    `Task card: [\`${card.relPath}\`](https://github.com/${repo}/blob/main/${card.relPath})`,
    "",
    `- **Priority:** ${card.priority}`,
    `- **Area:** ${card.area}`,
    `- **Estimate:** ${card.estimate}`,
    `- **Depends on:** ${deps.length ? deps.join(", ") : "none"}`,
    `- **Owner action:** ${card.owner_action ? "yes" : "no"}`,
  ].join("\n");

  const labels = [
    ...new Set([card.priority, card.area, ...(card.owner_action ? ["owner-action"] : [])].filter(Boolean)),
  ];

  const args = ["issue", "create", "--repo", repo, "--title", title, "--body", body];
  for (const label of labels) {
    args.push("--label", label);
  }
  return args;
}

function formatShellArg(arg) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) return arg;
  return `"${String(arg).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function defaultExec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd: opts.cwd ?? DEFAULT_REPO_ROOT,
  });
}

export function isHttp422Error(err) {
  if (!err) return false;
  if (err.status === 422 || err.statusCode === 422) return true;
  const text = `${err.message ?? ""}\n${err.stderr ?? ""}\n${err.stdout ?? ""}`;
  return /\b422\b|Reference already exists/i.test(text);
}

function resolveRepoSlug(exec, cwd) {
  try {
    const remoteUrl = exec("git", ["remote", "get-url", "origin"], { cwd });
    return parseRepoSlug(remoteUrl, DEFAULT_REPO);
  } catch {
    return DEFAULT_REPO;
  }
}

function fetchGitState(exec, cwd, repo) {
  const lsRemoteOut = exec(
    "git",
    ["ls-remote", "--heads", "origin", "refs/heads/task/*"],
    { cwd }
  );
  const prJsonOut = exec(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--json",
      "headRefName,number,url,labels,author",
    ],
    { cwd }
  );
  return {
    remoteBranches: parseLsRemoteBranches(lsRemoteOut),
    openPrsByTaskId: parseOpenPrs(prJsonOut),
  };
}

function makeIo(opts = {}) {
  return {
    cwd: opts.cwd ?? DEFAULT_REPO_ROOT,
    tasksDir: opts.tasksDir ?? path.join(opts.cwd ?? DEFAULT_REPO_ROOT, "docs", "tasks"),
    exec: opts.exec ?? defaultExec,
    now: opts.now ?? (() => Date.now()),
    out: opts.out ?? ((msg) => console.log(msg)),
    err: opts.err ?? ((msg) => console.error(msg)),
  };
}

/**
 * `status` subcommand.
 */
export function runStatus(opts = {}) {
  const io = makeIo(opts);
  const { cards, errors } = loadTaskCards(io.tasksDir);
  if (errors.length > 0) {
    for (const e of errors) io.err(e);
    return { exitCode: 1, errors };
  }
  const repo = resolveRepoSlug(io.exec, io.cwd);
  const gitState = fetchGitState(io.exec, io.cwd, repo);
  const { rows, wipCount, wipCards } = computeStatusRows(cards, gitState);
  io.out(formatStatusTable(rows, wipCount, opts.wipLimit ?? DEFAULT_WIP_LIMIT));
  return { exitCode: 0, rows, wipCount, wipCards, repo };
}

/**
 * `next [--dry-run] [--force]` subcommand.
 */
export function runNext(args = [], opts = {}) {
  const io = makeIo(opts);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const wipLimit = opts.wipLimit ?? DEFAULT_WIP_LIMIT;

  const { cards, errors } = loadTaskCards(io.tasksDir);
  if (errors.length > 0) {
    for (const e of errors) io.err(e);
    return { exitCode: 1, errors };
  }

  const repo = resolveRepoSlug(io.exec, io.cwd);
  const gitState = fetchGitState(io.exec, io.cwd, repo);
  const selection = selectNextCandidates(cards, gitState, { wipLimit, force });

  if (!selection.ok && selection.reason === "wip-limit") {
    io.err(
      `WIP limit reached (${selection.wipCount}/${selection.wipLimit}). Slots occupied by:`
    );
    for (const slot of selection.wipCards) {
      io.err(`  - ${slot.id} (${slot.status}) — ${slot.refPr}`);
    }
    io.err("Use --force (owner-only) to override.");
    return { exitCode: 1, ...selection };
  }

  if (!selection.ok) {
    io.err(`No eligible 'todo' card found (WIP: ${selection.wipCount}/${selection.wipLimit}).`);
    for (const s of selection.skipped) {
      io.err(`  skipped ${s.id}: ${s.reason}`);
    }
    return { exitCode: 1, ...selection };
  }

  if (dryRun) {
    const selected = selection.candidates[0];
    const branch = `task/${selected.id}`;
    const worktreePath = `../masarx-wt/task-${selected.id}`;
    io.out(`WIP: ${selection.wipCount}/${selection.wipLimit}`);
    io.out(`Selected: ${selected.id} (${selected.priority}) — ${selected.title}`);
    io.out(`Branch: ${branch}`);
    io.out(`Worktree: ${worktreePath}`);
    io.out(`Card: ${selected.relPath}`);
    if (selection.skipped.length > 0) {
      io.out("Skipped:");
      for (const s of selection.skipped) {
        io.out(`  - ${s.id}: ${s.reason}`);
      }
    }
    return {
      exitCode: 0,
      dryRun: true,
      selected,
      branch,
      worktreePath,
      cardPath: selected.relPath,
      skipped: selection.skipped,
      wipCount: selection.wipCount,
    };
  }

  io.exec("git", ["fetch", "origin", "main"], { cwd: io.cwd });
  const sha = io.exec("git", ["rev-parse", "origin/main"], { cwd: io.cwd }).trim();

  const collidedCards = [];
  let claimed = null;

  for (const candidate of selection.candidates) {
    if (collidedCards.some((c) => touchesOverlap(candidate.touches, c.touches))) {
      io.out(`Skipping ${candidate.id}: overlaps newly collided card`);
      continue;
    }

    const ref = `refs/heads/task/${candidate.id}`;
    try {
      io.exec(
        "gh",
        ["api", `repos/${repo}/git/refs`, "-f", `ref=${ref}`, "-f", `sha=${sha}`],
        { cwd: io.cwd }
      );
      claimed = candidate;
      break;
    } catch (e) {
      if (isHttp422Error(e)) {
        io.err(
          `Collision (422) creating ${ref} for ${candidate.id}; trying next candidate...`
        );
        collidedCards.push(candidate);
        continue;
      }
      throw e;
    }
  }

  if (!claimed) {
    io.err("All eligible candidates collided (422) when creating remote refs.");
    return { exitCode: 1, reason: "all-collided", collidedCards };
  }

  const branch = `task/${claimed.id}`;
  const worktreePath = `../masarx-wt/task-${claimed.id}`;
  io.exec("git", ["fetch", "origin", branch], { cwd: io.cwd });
  io.exec(
    "git",
    ["worktree", "add", worktreePath, "-b", branch, `origin/${branch}`],
    { cwd: io.cwd }
  );

  io.out(`Claimed: ${claimed.id} (${claimed.priority}) — ${claimed.title}`);
  io.out(`Branch: ${branch}`);
  io.out(`Worktree: ${worktreePath}`);
  io.out(`Card: ${claimed.relPath}`);

  return {
    exitCode: 0,
    dryRun: false,
    selected: claimed,
    branch,
    worktreePath,
    cardPath: claimed.relPath,
    collidedCards,
    wipCount: selection.wipCount,
  };
}

/**
 * `release <T-XXX> [--force]` subcommand.
 */
export function runRelease(args = [], opts = {}) {
  const io = makeIo(opts);
  const force = args.includes("--force");
  const positional = args.filter((a) => !a.startsWith("-"));
  const taskId = positional[0];

  if (!taskId || !TASK_ID_RE.test(taskId)) {
    io.err(`Invalid or missing task ID '${taskId ?? ""}'. Expected format: T-NNN (e.g. T-001).`);
    return { exitCode: 1, reason: "invalid-id" };
  }

  const repo = resolveRepoSlug(io.exec, io.cwd);
  const ref = `refs/heads/task/${taskId}`;

  const lsOut = io.exec("git", ["ls-remote", "--heads", "origin", ref], { cwd: io.cwd }).trim();
  if (!lsOut) {
    io.err(`Remote branch ${ref} does not exist on origin.`);
    return { exitCode: 1, reason: "missing-branch" };
  }

  const prJson = io.exec(
    "gh",
    ["pr", "list", "--repo", repo, "--head", `task/${taskId}`, "--state", "open", "--json", "number,url"],
    { cwd: io.cwd }
  );
  const openPrs = JSON.parse(prJson || "[]");
  if (openPrs.length > 0 && !force) {
    io.err(
      `Refusing to release ${taskId}: open PR(s) exist (${openPrs.map((p) => `#${p.number} ${p.url ?? ""}`.trim()).join(", ")}). Use --force to override.`
    );
    return { exitCode: 1, reason: "open-pr", openPrs };
  }

  const rawDate = io
    .exec(
      "gh",
      ["api", `repos/${repo}/commits/task/${taskId}`, "--jq", ".commit.committer.date"],
      { cwd: io.cwd }
    )
    .replace(/^"|"$/g, "")
    .trim();

  const commitMs = Date.parse(rawDate);
  if (Number.isNaN(commitMs)) {
    if (!force) {
      io.err(`Refusing to release ${taskId}: could not parse last commit date '${rawDate}'.`);
      return { exitCode: 1, reason: "invalid-date" };
    }
  } else {
    const ageMs = io.now() - commitMs;
    if (ageMs < HOURS_24_MS && !force) {
      const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);
      io.err(
        `Refusing to release ${taskId}: last commit on task/${taskId} is ${ageHours}h old (< 24h, committed ${rawDate}). Use --force to override.`
      );
      return { exitCode: 1, reason: "recent-commit", ageHours: Number(ageHours), commitDate: rawDate };
    }
  }

  io.exec("gh", ["api", "-X", "DELETE", `repos/${repo}/git/refs/heads/task/${taskId}`], {
    cwd: io.cwd,
  });
  io.out(`Deleted remote branch ${ref} (${taskId}) from ${repo}.`);

  return { exitCode: 0, deletedRef: ref, taskId, repo };
}

/**
 * `sync-issues [--apply]` subcommand.
 */
export function runSyncIssues(args = [], opts = {}) {
  const io = makeIo(opts);
  const apply = args.includes("--apply");

  const { cards, errors } = loadTaskCards(io.tasksDir);
  if (errors.length > 0) {
    for (const e of errors) io.err(e);
    return { exitCode: 1, errors };
  }

  const repo = resolveRepoSlug(io.exec, io.cwd);
  const sorted = [...cards].sort(compareCards);
  const commands = [];

  for (const card of sorted) {
    if (card.status === "done") {
      io.out(`# Skipping ${card.id} (status: done)`);
      continue;
    }
    const ghArgs = buildIssueCreateArgs(card, { repo });
    commands.push({ card, args: ghArgs, command: `gh ${ghArgs.map(formatShellArg).join(" ")}` });
  }

  if (!apply) {
    io.out(`# Dry-run (${commands.length} issue command(s)). Pass --apply to execute.`);
    for (const entry of commands) {
      io.out(entry.command);
    }
    return { exitCode: 0, applied: false, commands };
  }

  const existingJson = io.exec(
    "gh",
    ["issue", "list", "--repo", repo, "--state", "all", "--limit", "500", "--json", "title"],
    { cwd: io.cwd }
  );
  const existingTitles = new Set(
    JSON.parse(existingJson || "[]").map((item) => String(item.title ?? ""))
  );

  const created = [];
  const skippedExisting = [];

  for (const entry of commands) {
    const prefix = `${entry.card.id} `;
    const alreadyExists = [...existingTitles].some((t) => t === entry.card.id || t.startsWith(prefix));
    if (alreadyExists) {
      io.out(`Skipping ${entry.card.id}: issue already exists`);
      skippedExisting.push(entry.card.id);
      continue;
    }
    const result = io.exec("gh", entry.args, { cwd: io.cwd }).trim();
    io.out(`Created issue for ${entry.card.id}: ${result}`);
    created.push({ id: entry.card.id, output: result });
  }

  return { exitCode: 0, applied: true, commands, created, skippedExisting };
}

/**
 * `lint` subcommand.
 */
export function runLint(opts = {}) {
  const io = makeIo(opts);
  const { cards, errors: loadErrors } = loadTaskCards(io.tasksDir);
  const allErrors =
    cards.length > 0 ? lintCards(cards).errors : loadErrors.length > 0 ? loadErrors : lintCards(cards).errors;

  if (allErrors.length > 0) {
    for (const e of allErrors) io.err(e);
    return { exitCode: 1, errors: allErrors, cardCount: cards.length };
  }

  io.out(`tasks:lint OK (${cards.length} card(s) checked)`);
  return { exitCode: 0, errors: [], cardCount: cards.length };
}

/**
 * CLI dispatcher.
 */
export function main(argv = process.argv.slice(2), opts = {}) {
  const io = makeIo(opts);
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case "status":
      return runStatus(opts).exitCode;
    case "next":
      return runNext(rest, opts).exitCode;
    case "release":
      return runRelease(rest, opts).exitCode;
    case "sync-issues":
      return runSyncIssues(rest, opts).exitCode;
    case "lint":
      return runLint(opts).exitCode;
    default:
      io.err(
        [
          "Usage: node scripts/tasks.mjs <command> [options]",
          "Commands:",
          "  status                   Show derived task status table",
          "  next [--dry-run] [--force]  Claim next eligible todo card",
          "  release <T-XXX> [--force]   Delete stale remote branch",
          "  sync-issues [--apply]       Print (or create) GitHub issues",
          "  lint                     Validate docs/tasks/T-*.md cards",
        ].join("\n")
      );
      return 1;
  }
}

function isCliEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
  }
}

if (isCliEntrypoint()) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(err?.stderr || err?.message || String(err));
    process.exitCode = 1;
  }
}
