// One config for the whole card toolchain under Vite+ (`vp`): build (Vite 8
// library mode on Rolldown), test (Vitest), lint + type-check (Oxlint with
// tsgolint) and format (Oxfmt).
//
// Decorators are deliberately not configured here. Rolldown reads
// tsconfig.json itself and turns on Lit's legacy (experimental) decorators
// from it.
import { defineConfig } from "vite-plus";

// MUST be a legal comment — `/*! ... */` — not `//`. The minifier strips
// ordinary comments including a `//` banner, silently. `comments: { legal:
// true }` below is the other half of the same requirement.
const banner =
  "/*! Orrery Card — bundled by Rolldown. Edit sources in src/, then `npm run build`. */";

// Dev vs prod comes from Vite's mode: `npm run dev` passes `--mode
// development`. `vp build --watch` alone still builds production.
export default defineConfig(({ mode }) => {
  const dev = mode === "development";
  return {
    build: {
      // Library mode: one ES module, no index.html, no hashed file name.
      lib: {
        entry: "src/orrery-card.ts",
        formats: ["es"],
        fileName: () => "orrery-card.js",
      },
      // dist/ holds nothing but this build's output, so Vite empties it
      // before each build (the default), and no stale dev .map is left
      // next to a production bundle.
      outDir: "dist",
      copyPublicDir: false,
      target: "es2022",
      sourcemap: dev,
      rolldownOptions: {
        output: {
          banner,
          // HACS installs one file, so the bundle never splits into chunks.
          codeSplitting: false,
          comments: { legal: true },
          // Set on the Rolldown output, not `build.minify`: Vite's library
          // mode skips whitespace minification for ES output. Keep console.*
          // (dropConsole: false) so the console.info version banner, which
          // shows which bundle the browser loaded, survives. Rolldown's
          // dropConsole is all-or-nothing.
          minify: dev ? false : { compress: { dropConsole: false }, mangle: true, codegen: true },
        },
      },
    },
    fmt: {
      // Leave Lit html/css templates alone. Formatting them rewrites the
      // whitespace inside rendered elements, which changes the DOM.
      embeddedLanguageFormatting: "off",
      // Format everything but the bundle (build output), Vitest snapshots,
      // the Markdown and the .github YAML, which keep their hand formatting.
      ignorePatterns: ["dist/**", "**/*.md", ".github/**", "**/__snapshots__/**"],
    },
    lint: {
      ignorePatterns: ["dist/**"],
      // Oxlint's default plugins plus vitest; listing plugins replaces the
      // defaults, so all four are named.
      plugins: ["typescript", "unicorn", "oxc", "vitest"],
      jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
      rules: {
        "vite-plus/prefer-vite-plus-imports": "error",
        // Opt-in rules from the `suspicious` category; the rest of that
        // category is mostly noise for Lit code (e.g. `_private` names).
        "typescript/no-unnecessary-type-assertion": "error",
        "eslint/no-shadow": "error",
        // In-place .sort() → use sorted() from src/sorted.ts. Not
        // toSorted(): it's ES2023 and the build targets es2022.
        "unicorn/no-array-sort": "error",
        // Test hygiene: a skipped, focused or assertion-free test is a
        // test that silently proves nothing.
        "vitest/no-focused-tests": "error",
        "vitest/no-disabled-tests": "error",
        "vitest/no-identical-title": "error",
        "vitest/expect-expect": "error",
        "vitest/no-standalone-expect": "error",
        "vitest/no-conditional-expect": "error",
        "vitest/no-commented-out-tests": "error",
        "vitest/valid-title": "error",
        // expect(value, message) is Vitest API; the default of one
        // argument is Jest's.
        "vitest/valid-expect": ["error", { maxArgs: 2 }],
        // An untyped vi.fn() hides no bug, so requiring a type parameter
        // is noise.
        "vitest/require-mock-type-parameters": "off",
      },
      // typeCheck: `vp check` also reports TypeScript's own diagnostics,
      // which makes it the pipeline's only type-check.
      // denyWarnings: a warning fails `vp check` (and CI) instead of
      // scrolling past with exit 0.
      // reportUnusedDisableDirectives: a stale oxlint-disable comment fails.
      options: {
        typeAware: true,
        typeCheck: true,
        denyWarnings: true,
        reportUnusedDisableDirectives: "error",
      },
    },
  };
});
