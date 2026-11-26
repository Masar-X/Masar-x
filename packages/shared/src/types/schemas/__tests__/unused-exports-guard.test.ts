/**
 * Lightweight guard against re-introducing dead exports.
 *
 * Asserts that every `export const` / `export type` / `export interface`
 * declared in `schemas/index.ts` is referenced at least once across the
 * monorepo. Catches the kind of drift that spec 015 US3 fixed (5
 * `Validated*` types + 3 `Waitlist*` row types declared but never
 * imported) before it can land again.
 *
 * This is a coarse lexical check — it matches identifier names with
 * `RegExp(`\\b${symbol}\\b`)` over every `.ts`/`.tsx` file under apps/
 * and packages/ rather than building a real import graph. False positives
 * are possible if an identifier name happens to match a comment or a
 * string literal elsewhere; that's acceptable for the cost.
 *
 * The scan is a pure-Node recursive walk (`node:fs`) instead of a `grep`
 * shell-out: `grep` is absent from a default Windows PATH, which made
 * this guard fail on every Windows machine (execSync threw, every symbol
 * looked unreferenced, and the first one aborted the test).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMAS_FILE = path.resolve(
  __dirname,
  '..',
  'index.ts',
);

/**
 * Recursively collect `.ts`/`.tsx` files under `dir`, skipping
 * `node_modules` (the `grep -r` baseline skipped the symlinked
 * dependency installs; source references never live in dependencies).
 */
function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

describe('schemas/index.ts — no dead exports', () => {
  it('every exported symbol is referenced somewhere in the monorepo', () => {
    const src = readFileSync(SCHEMAS_FILE, 'utf8');
    // Match "export const|let|var|function|class|type|interface NAME"
    const exports = [
      ...src.matchAll(/^export\s+(?:const|let|var|function|class|type|interface)\s+(\w+)/gm),
    ].map((m) => m[1]);
    expect(exports.length).toBeGreaterThan(0);

    // __dirname = packages/shared/src/types/schemas/__tests__
    // To reach repo root we climb: __tests__ → schemas → types → shared → packages → repo root = 6 levels.
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');

    // The schemas file itself is always a reference, plus this test file.
    // (The former path built from `__dirname + '/__tests__-guard.test.ts'`
    // doubled the __tests__ segment, so the allowlist entry never matched.)
    const schemasRel = path.relative(repoRoot, SCHEMAS_FILE).replace(/\\/g, '/');
    const testRel = path.relative(repoRoot, __filename).replace(/\\/g, '/');
    const allowedNonConsuming = new Set([schemasRel, testRel]);

    // One read pass over both source trees; every symbol is then matched
    // against the cached contents (the per-symbol shell-out also ran grep
    // once per symbol, making it the dominant cost as well as the
    // Windows break).
    const sourceFiles = ['apps', 'packages'].flatMap((root) =>
      collectSourceFiles(path.join(repoRoot, root)),
    );
    const contents = sourceFiles.map((file) => ({
      rel: path.relative(repoRoot, file).replace(/\\/g, '/'),
      src: readFileSync(file, 'utf8'),
    }));

    for (const symbol of exports) {
      // Per-symbol, word-bounded scan. The previous single grep over the
      // union of ALL export names was vacuous: any file referencing one
      // symbol made every symbol "referenced".
      const pattern = new RegExp(`\\b${symbol}\\b`);
      const referencingFiles = contents
        .filter((f) => pattern.test(f.src))
        .map((f) => f.rel);

      // Find at least one referencing file outside the allowed set.
      const hasExternalConsumer = referencingFiles.some((f) => {
        return !allowedNonConsuming.has(f);
      });
      if (!hasExternalConsumer) {
        throw new Error(
          `schemas/index.ts exports \`${symbol}\` but no file outside the schema module references it. Delete it or add a consumer.`,
        );
      }
    }
  }, 30_000);
});
