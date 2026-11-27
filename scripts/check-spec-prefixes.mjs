// T-014: specs/ directory numbering guard.
//
// Every spec directory under specs/ is named NNN-slug and takes the next free
// three-digit number from disk. A few numbers were reused before that rule was
// enforced; those five are frozen historical exceptions and are never renamed:
//
//   015  015-consolidate-shared-abstractions + 015_test_coverage_critical_paths
//   023  023_mobile_sentry + 023_smart_paste_canvas
//   033  033-materials-port + 033-wave1a-perf
//   034  034-subjects-schedules + 034-wave1b-perf
//   040  040-automation-test-coverage + 040-review-remediation
//
// This check fails when any number OUTSIDE that frozen set is shared by two or
// more directories, so a new spec can only collide by reusing a live number.
// Frozen numbers keep passing, but they must not gain a third directory either
// — nothing here allows new rows under them.
//
// Exit codes: 0 = pass, 1 = failure.

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPECS_DIR = path.join(repoRoot, "specs");

const FROZEN_DUPLICATES = new Set(["015", "023", "033", "034", "040"]);

const FROZEN_DUPLICATE_LIMIT = 2; // a frozen number keeps its historical pair, never a third

export function findDuplicateSpecPrefixes(dir = SPECS_DIR) {
  const counts = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(\d{3})/);
    if (!match) continue;
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([prefix, count]) =>
      FROZEN_DUPLICATES.has(prefix) ? count > FROZEN_DUPLICATE_LIMIT : count > 1,
    )
    .map(([prefix]) => prefix)
    .sort();
}

function main() {
  const duplicates = findDuplicateSpecPrefixes();
  if (duplicates.length > 0) {
    console.error(`::error::duplicate specs/ directory numbers: ${duplicates.join(", ")}.`);
    console.error(
      "Every new spec must take the next free three-digit number from disk; " +
        `the only allowed historical duplicates are ${[...FROZEN_DUPLICATES].sort().join(", ")}.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `specs/ numbering OK (frozen historical duplicates: ${[...FROZEN_DUPLICATES].sort().join(", ")})`,
  );
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
