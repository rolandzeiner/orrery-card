# Contributing

Thanks for considering a patch. Bug fixes, new options and language packs are all welcome. The verification gate below has to pass.

## Dev setup

```bash
git clone https://github.com/rolandzeiner/orrery-card.git
cd orrery-card
npm ci           # Node ^24.11 or 26+, npm 11+
```

Day-to-day:

```bash
npm run dev      # vp build --watch — rebuilds dist/orrery-card.js on save (unminified, with a sourcemap)
npm run build    # = vp build; one-shot production build (minified)
npm test         # = vp test run, the unit suite
npm run check    # = vp check; format, lint and strict type-check
```

For live testing in Home Assistant, install the card through HACS once so the Lovelace resource exists, then copy each rebuilt `dist/orrery-card.js` over the installed file and hard-refresh the browser (⌘⇧R / Ctrl⇧R).

## Verification gate (must pass before a PR)

```bash
npm test                         # = vp test run, the unit suite
npx vp check                     # format, lint and strict type-check
npm run build                    # vp build must succeed clean
git diff --exit-code -- dist/    # committed bundle must match that build
node -c dist/orrery-card.js      # syntax sanity-check
```

Commit `dist/` together with your `src/` change. HACS serves the committed bundle directly, so a `src/` edit without a rebuild ships code that no longer matches the source. CI fails on the same check.

CI runs these five plus `npm audit --omit=dev --audit-level=high`, HACS plugin validation and CodeQL.

## Coverage

The coverage provider is not a dependency. To measure coverage, install it at the Vitest version Vite+ bundles (`npx vp toolchain` names it) without saving it, then run:

```bash
npm i --no-save @vitest/coverage-v8@<that version>
npx vp test run --coverage --coverage.provider=v8 \
  --coverage.reporter=json --coverage.reporter=text-summary '--coverage.include=src/**'
```

That prints a summary and writes `coverage/coverage-final.json` (gitignored). The next `npm ci` removes the provider again. For a code-health check, run `fallow audit` afterwards: it reads that file from its default location, so its untested-complexity (CRAP) scores come from real coverage instead of an estimate.

## Branching

- All work happens on `dev`. PRs target `dev`.
- Releases are cut from `main` after a `dev → main` PR.
- `package.json` `version` and `CARD_VERSION` in `src/const.ts` must match (a test checks this); the release workflow refuses a tag that disagrees with `package.json`.

## Layout

| Path | What's there |
| --- | --- |
| `src/orrery-card.ts` | The Lit element: config, lifecycle, controls, pointer and keyboard input |
| `src/render/` | Canvas renderer, camera projection, distance scales, label placement, palette |
| `src/astro/` | Planet table and the astronomy-engine wrappers (orbits, ticks, readouts) |
| `src/format.ts` | Everything localised: dates, numbers, readout text |
| `src/interaction.ts` | Keyboard map, pointer gestures, playback and date stepping — no DOM, so it's unit-tested directly |
| `src/config.ts` | YAML validation, defaults, and the editor's fill-in / tidy-up of defaults |
| `src/editor.ts`, `src/editor-schema.ts` | Visual editor: `ha-form` with the defaults filled in, saving only what changed |
| `tests/` | Vitest suites, run by `vp test`. Most run in plain node; `card.test.ts` opts into happy-dom and drives the real element, with the canvas replaced by `tests/fake-canvas.ts`. `toolchain.test.ts` guards the `vite` override (see *Card build*) |

The card only redraws when something changes. Keep it that way: a new animation must stop when the card is off screen, when the tab is hidden, and under `prefers-reduced-motion`.

## Translations

1. Copy `src/localize/languages/en.json` to `<code>.json` and translate every value. Keep the `{placeholders}`.
2. Import it in `src/localize/localize.ts` and add it to `LANGUAGE_REGISTRY`.
3. Run `npm test`. It checks that every language has the same keys and placeholders as English.

Month, weekday and number formats come from the browser's `Intl`, so they don't need translating. Constellation names stay in Latin, as the IAU names them.

## Card build

`vite.config.ts` holds the whole card toolchain, run through [Vite+](https://viteplus.dev/) (`vp`): `vp build` (Vite library mode on Rolldown), `vp test` (Vitest), and `vp check` (Oxfmt + Oxlint + type-check). The only `devDependencies` are `vite-plus` and `happy-dom`. Vitest, Rolldown and the type-checker all ship inside `vite-plus`, and `typescript` is not installed.

Five things in that config fail silently if changed:

- The banner must be a **legal** comment, `/*! ... */`, with `comments: { legal: true }`. A `//` banner is stripped by the minifier without warning.
- **`minify` lives on `rolldownOptions.output`, with `dropConsole: false`.** Vite's library mode skips whitespace minification for ES output, so `build.minify` alone ships a larger bundle. `dropConsole` is all-or-nothing, and the version banner in the console is how you check which bundle the browser loaded.
- **Dev vs prod comes from `--mode development`** (`npm run dev`). A plain `vp build` is production: minified, no sourcemap.
- **`fmt.embeddedLanguageFormatting` stays `"off"`.** Otherwise Oxfmt reformats Lit `html`/`css` templates and changes the whitespace inside rendered elements.
- **Decorators are not configured.** Rolldown reads `tsconfig.json` and enables Lit's legacy decorators from it.

**The `vite` override in `package.json` must name the same version as `vite-plus`.** It keeps npm from installing upstream Vite next to Vite+'s core. Dependabot bumps `vite-plus` but not the override, and `tests/toolchain.test.ts` fails until you bump both.

The build does not type-check. `vp check` is the only thing between a type error and a green build.

## Third-party licenses

Both runtime dependencies are bundled into `dist/orrery-card.js`, so their notices have to ship with it.

| Package | License | Notice in the bundle |
| --- | --- | --- |
| `astronomy-engine` (Don Cross) | MIT | `@preserve` block with the full license text |
| `lit` and its `@lit/*` packages (Google) | BSD-3-Clause | `@license` / `SPDX-License-Identifier` comments |

Both are compatible with this repo's MIT license. `comments: { legal: true }` in `vite.config.ts` is what keeps those comments in the minified bundle, so don't remove it. After a dependency change, check that they're still there:

```bash
grep -c "Don Cross" dist/orrery-card.js
grep -c "BSD-3-Clause" dist/orrery-card.js
```

A new dependency must have a license compatible with MIT, and its notice has to survive the build.

## Style

- TypeScript strict. The `tsconfig.json` flags are not negotiable.
- Runtime dependencies are `lit` and `astronomy-engine`. Add another only after discussion.
- Comments explain why, not what.
