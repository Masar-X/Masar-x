import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

import { browserSupabaseImportAllowlist } from "./eslint-supabase-allowlist.mjs";

// AI provider SDK imports are forbidden in any client context (T013, Spec
// 004 Phase 2): the shared AI client in `packages/shared/src/ai/` is the
// only consumer that may reference the provider SDKs, and it routes through
// the Supabase Edge Function. Kept as a const so the browser-Supabase
// ratchet block below composes it with its own patterns without changing
// severity or messages.
const aiProviderImportPaths = [
  {
    name: "openai",
    message:
      "Direct import of `openai` is forbidden in client contexts. " +
      "Use the shared AI client (`packages/shared/src/ai/`) which " +
      "routes through the Supabase Edge Function. See " +
      "specs/004-multi-platform-expansion/contracts/ai-boundary.md.",
  },
  {
    name: "@anthropic-ai/sdk",
    message:
      "Direct import of `@anthropic-ai/sdk` is forbidden in client " +
      "contexts. Use the shared AI client (`packages/shared/src/ai/`) " +
      "which routes through the Supabase Edge Function. See " +
      "specs/004-multi-platform-expansion/contracts/ai-boundary.md.",
  },
];

export default [
  {
    ignores: [
      ".next/**",
      "dist/**",
      "build/**",
      "out/**",
      "node_modules/**",
      "supabase/**",
      "sandbox/**",
      "backup/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooksPlugin,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...(nextPlugin.configs["core-web-vitals"]?.rules ?? {}),
      ...(reactHooksPlugin.configs?.recommended?.rules ?? {}),
      ...(tseslint.configs?.recommended?.rules ?? {}),

      "@typescript-eslint/no-explicit-any": "warn",
      // `_`-prefixed args/vars are the repo's intentional keep-the-signature
      // convention (React API compliance, interface-shaped params).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "prefer-const": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "no-console": "warn",

      // eslint-plugin-react-hooks v7 (from ^5.1.0-rc.0): `recommended`
      // expanded from 2 rules to 16 compiler rules, all defaulting to
      // error (88 hits: set-state-in-effect x75, purity x5, refs x3,
      // preserve-manual-memoization x3, static-components/immutability x1).
      // These flag live login + study-flow patterns (auth guards, tab sync,
      // data fetch in effects). Fixing them is a behavior-risk refactor that
      // belongs in a dedicated spec, not a dep bump under MVP Lock (I12).
      // Pinned OFF to preserve v5 behavior (rules-of-hooks:error +
      // exhaustive-deps:warn); re-enable one-by-one with code fixes.
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/immutability": "off",
      "react-hooks/globals": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/config": "off",
      "react-hooks/gating": "off",

      // T013 (Spec 004, Phase 2). The AI provider key MUST stay
      // server-side (contracts/ai-boundary.md). Direct SDK imports of
      // `openai` or `@anthropic-ai/sdk` are forbidden in any client
      // context — web, desktop renderer, mobile runtime. The AI client
      // in `packages/shared/src/ai/index.ts` is the only consumer; it
      // routes through the Supabase Edge Function, never the provider
      // directly. `supabase/functions/**` (the Edge Function itself) is
      // exempted via the top-level `ignores` block above. Severity is
      // `error` so a slip becomes a build break, not a warning.
      "no-restricted-imports": [
        "error",
        { paths: aiProviderImportPaths },
      ],
    },
  },
  {
    // Browser-Supabase import ratchet (T-009, see docs/ARCHITECTURE.md).
    // Client code must not create Supabase clients directly: reads go
    // through the server surface (`src/lib/supabase/server.ts`, Server
    // Actions in `src/actions/`, Route Handlers in `src/app/api/`), and the
    // browser client lives in the data layer (`src/lib/supabase.ts`
    // singleton, `src/lib/supabase/client.ts` per-call factory). The
    // patterns cover the alias spellings and every relative spelling
    // observed in the repo, including the bare `./supabase` form used from
    // `src/lib` itself. Exempted: the data layer, tests, and the
    // grandfathered baseline in `eslint-supabase-allowlist.mjs` (the ONLY
    // exemption list - removing an entry re-flags that file; a new
    // un-allowlisted importer fails lint immediately). This block re-states
    // the AI provider restriction because a flat-config block that sets a
    // rule replaces the earlier options wholesale for the files it covers.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/supabase/**",
      "src/**/__tests__/**",
      ...browserSupabaseImportAllowlist.map((path) =>
        // Allowlist entries are exact paths and may contain glob
        // metacharacters (`src/app/[locale]/...`) - escape them so they
        // match literally.
        path.replace(/[$()*+?[\]^{|}]/g, "\\$&"),
      ),
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: aiProviderImportPaths,
          patterns: [
            {
              // A single anchored regex for the alias spellings too. The
              // gitignore-style `group` alternative (`@/lib/supabase`) also
              // matches everything UNDER the path, which would ban the
              // sanctioned `@/lib/supabase/server` and `@/lib/supabase/admin`
              // server modules. Anchored alternatives cover the two browser
              // modules via the alias and every relative spelling observed
              // in the repo, including the bare `./supabase` form used from
              // `src/lib` itself.
              regex:
                "^@/lib/supabase(/client)?(\\.ts)?$|" +
                "^(\\.{1,2}/)+(lib/)?supabase(/client)?(\\.ts)?$",
              message:
                "Browser Supabase clients may only be created in the data " +
                "layer (src/lib/supabase). Fetch data server-side via " +
                "src/lib/supabase/server, Server Actions (src/actions) or " +
                "Route Handlers (src/app/api) instead. Grandfathered files " +
                "are listed in apps/web/eslint-supabase-allowlist.mjs - " +
                "see docs/ARCHITECTURE.md.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // One-off maintenance scripts and the hand-written service worker are
    // infrastructure, not shipped app source: console output is their
    // interface, so `no-console` does not apply. App code under src/ still
    // routes diagnostics through src/lib/logger.
    files: ["scripts/**/*.js", "public/sw.js", "public/sw.template.js"],
    rules: {
      "no-console": "off",
    },
  },
];
