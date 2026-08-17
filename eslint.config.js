import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
          patterns: [
            {
              group: ["**/hebrew-normalizer", "**/hebrew-normalizer.ts", "@/lib/hebrew-normalizer"],
              message:
                "Phase 16: import semantic helpers via `./semantic-engine` (SemanticEngine). Only semantic-engine.ts and its tests may import hebrew-normalizer directly.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Only the engine and its tests may reach into hebrew-normalizer internals.
    files: [
      "src/lib/semantic-engine.ts",
      "src/lib/hebrew-normalizer.ts",
      "src/lib/hebrew-normalizer.test.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  eslintPluginPrettier,
);
