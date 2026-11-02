import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // data/ is gitignored scratch; prettier and markdownlint already skip
    // gitignored paths, ESLint does not. Vendored skills aren't ours to lint.
    // The old scrapers are read-only references, not part of the gate.
    ignores: [
      "node_modules/",
      "data/",
      ".agents/",
      ".claude/skills/",
      "apps/scrape-deno/",
      "apps/scrape-ng/",
      "apps/scrape-browser/",
    ],
  },
);
