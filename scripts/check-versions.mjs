// T-013: workspace version parity + CHANGELOG gate.
//
// Part 1 (always): the five package.json manifests and the Expo mirror
// apps/mobile/app.json (expo.version) must all carry the same version.
// release.yml tags desktop builds from apps/desktop/package.json and the
// Supabase client-info header reads the web version, so drift between
// manifests ships inconsistent apps.
//
// Part 2 (CI pull_request only — CHECK_CHANGELOG=1 and PR_NUMBER set):
// PRs whose title or any commit subject is a conventional feat:/fix:
// (scoped "feat(web):" and breaking "!:" included) that change files
// under apps/ or packages/ must keep at least one entry under
// "## [Unreleased]" in CHANGELOG.md, unless the PR carries the
// "skip-changelog" label. PR metadata is fetched read-only via gh.
//
// Exit codes: 0 = pass / gate not applicable, 1 = failure.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MANIFESTS = [
  "package.json",
  "apps/web/package.json",
  "apps/desktop/package.json",
  "apps/mobile/package.json",
  "packages/shared/package.json",
  "apps/mobile/app.json",
];

const FEAT_OR_FIX = /^(feat|fix)(\([^)]*\))?!?:/;

function readManifestVersions(root) {
  return MANIFESTS.map((rel) => {
    const data = JSON.parse(readFileSync(path.join(root, rel), "utf8"));
    return {
      file: rel,
      version: rel.endsWith("app.json") ? data.expo?.version : data.version,
    };
  });
}

export function checkVersionParity(root = repoRoot) {
  const versions = readManifestVersions(root);
  const anchor = versions[0];
  const drifted = versions.filter((m) => m.version !== anchor.version);
  if (drifted.length > 0) {
    console.error(`::error::version mismatch — ${anchor.file} is ${anchor.version}, but:`);
    for (const m of drifted) console.error(`  ${m.file}: ${m.version}`);
    console.error("All five package.json manifests and apps/mobile/app.json must share one version.");
    return false;
  }
  console.log(`versions aligned: ${versions.map((m) => `${m.file}=${m.version}`).join(", ")}`);
  return true;
}

export function prRequiresChangelog({ title, labels, files, commitSubjects }) {
  if (labels?.includes("skip-changelog")) return false;
  const subjects = [title ?? "", ...(commitSubjects ?? [])];
  if (!subjects.some((s) => FEAT_OR_FIX.test(s.trim()))) return false;
  return (files ?? []).some((f) => f.startsWith("apps/") || f.startsWith("packages/"));
}

export function changelogHasUnreleasedEntry(changelogText) {
  const lines = changelogText.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## \[Unreleased\]/.test(line));
  if (start === -1) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).some((line) => /^- /.test(line));
}

function ghJson(args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
}

async function runChangelogGate(prNumber) {
  const view = ghJson(["pr", "view", prNumber, "--json", "title,labels,commits"]);
  const files = execFileSync("gh", ["pr", "diff", prNumber, "--name-only"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  const input = {
    title: view.title,
    labels: view.labels.map((label) => label.name),
    files,
    commitSubjects: view.commits.map((commit) => commit.messageHeadline),
  };
  if (!prRequiresChangelog(input)) {
    console.log(
      `changelog gate: not required for PR #${prNumber} (title/commits not feat|fix, diff leaves apps/ and packages/ untouched, or skip-changelog label)`,
    );
    return true;
  }
  const changelog = readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf8");
  if (!changelogHasUnreleasedEntry(changelog)) {
    console.error(
      `::error::PR #${prNumber} is a feat/fix touching apps/ or packages/ but CHANGELOG.md has no entry under "## [Unreleased]". Add a bullet under ## [Unreleased] (### Added / Changed / Fixed / Removed), or apply the skip-changelog label.`,
    );
    return false;
  }
  console.log(`changelog gate: PR #${prNumber} keeps an entry under ## [Unreleased]`);
  return true;
}

async function main() {
  const parityOk = checkVersionParity();
  const gateEnabled =
    ["1", "true"].includes(process.env.CHECK_CHANGELOG) && Boolean(process.env.PR_NUMBER);
  if (!gateEnabled) {
    console.log(
      "changelog gate: skipped (set CHECK_CHANGELOG=1 + PR_NUMBER to enable, as the CI workspaces job does on pull_request)",
    );
  }
  const gateOk = gateEnabled ? await runChangelogGate(process.env.PR_NUMBER) : true;
  process.exitCode = parityOk && gateOk ? 0 : 1;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
