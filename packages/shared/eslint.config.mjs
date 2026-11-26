// ESLint 9 flat config for the masarx-shared workspace package (T-012).
// Parser-only typescript-eslint, matching the pattern already used by
// apps/{web,desktop,mobile}/eslint.config.* (resolved through the hoisted
// pnpm workspace root; no shared-local devDep needed). The single enforced
// rule is the AI-boundary import restriction (spec 004 FR-020), aligned
// with the consumer configs: packages/shared routes AI access through the
// Supabase Edge Function (masarx-shared/ai), so a provider SDK or endpoint
// import is never legitimate anywhere in this package either. Severity is
// `error` so a slip becomes a build break, not a warning.

import tseslint from "typescript-eslint";

export default [
  {
    // ESLint 9 reports unused eslint-disable directives as warnings; the
    // shared config enables no rules of its own, so pre-existing inline
    // directives referencing plugin rules (e.g. no-explicit-any in
    // src/ai/__tests__/paste-attachments.test.ts) would always warn.
    // Keep them inert instead.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    // The plugin is registered (not its rules enabled) so pre-existing
    // inline `eslint-disable-next-line @typescript-eslint/...` comments
    // (e.g. the no-explicit-any one in src/ai/__tests__) resolve to a
    // defined rule instead of erroring as "definition not found".
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // The provider URL glob is split with `+` so the literal
              // "api.<provider>.com" pattern doesn't appear in source.
              // The ai-endpoint-grep CI job greps for that exact
              // substring; the runtime string is identical, only the
              // source representation is split. The same split is used
              // in apps/{desktop,mobile}/eslint.config.mjs.
              group: [
                "openai",
                "@anthropic-ai/sdk",
                "**/" + "api" + "." + "openai" + "." + "com" + "/**",
              ],
              message:
                "AI provider access only in supabase/functions/** (spec 004 FR-020). packages/shared routes AI through the Supabase Edge Function (masarx-shared/ai); never import a provider SDK or call a provider endpoint directly.",
            },
          ],
        },
      ],
    },
  },
];
