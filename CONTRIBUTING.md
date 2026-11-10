# Contributing to Orrery Card

Thanks for taking a look. This repo is a Lovelace card for Home Assistant. Everything you need to work on it is on this page, and the gate in *Verification gate* has to pass before a change lands.

## Quick start

```bash
git clone https://github.com/rolandzeiner/orrery-card.git
cd orrery-card
npm ci && npm run build
```

Before a PR, run the gate in *Verification gate*. It is what CI runs, so failing locally only costs you a push.

## Branching and releases

- Work on `dev`; PRs target `dev`. Nothing is committed or force-pushed to `main`.
- For anything bigger than a fix, open an issue first so the shape is agreed before the code is written.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. A subject line, then bullets that say what changed and why.
- The built bundle is committed and travels with the `src/` change that produced it: users install through the Marketplace and never run `npm`, and CI fails when the committed bundle differs from a fresh build by a byte.
- Releases are the maintainer's: a `dev → main` PR, squash-merged, then a tag from `main`. Publishing the release runs `release.yml`, which attaches every `dist/*.js`. If the job fails, `gh workflow run release.yml -f tag=vX.Y.Z` re-runs it against the existing tag. The workflow refuses a tag that disagrees with `package.json`.
- Contributions are accepted under the repo's MIT licence.

## Card toolchain

The card lives in `src/` and builds to `dist/orrery-card.js`. Its whole toolchain runs through [Vite+](https://viteplus.dev/) (`vp`), configured in `vite.config.ts`: `vp build` (Vite library mode on Rolldown), `vp test` (Vitest) and `vp check` (Oxfmt, Oxlint and the type-check). The only card `devDependencies` are `vite-plus` and `happy-dom`; Vitest, Rolldown and the type-checker ship inside `vite-plus`, and `typescript` is not installed. `npx vp` runs the copy in `node_modules`; a global `vp` works too.

| Command | What it does |
|---|---|
| `npm run dev` | `vp build --watch --mode development`: rebuilds `dist/orrery-card.js` on save, unminified, with a sourcemap |
| `npm run build` | `vp build`: one-shot production build, minified, no sourcemap |
| `npm test` | `vp test run`: the unit suite |
| `npm run check` | `vp check`: format, lint and the type-check |
| `npx vp check --fix` | the same, applying the formatter and the safe lint fixes |

Node 24.11 or newer (26 works too) and npm 11.

Commit the built bundle. End users install through the Marketplace and never run `npm`, so `dist/orrery-card.js` is tracked. CI asserts the committed bundle matches a fresh build byte for byte; a stale bundle is the infinite reload-banner bug. A dev build writes a `.map` file next to it; it is gitignored.

Things in `vite.config.ts` that fail silently if you change them:

- The banner must be a **legal** comment, `/*! ... */`, with `comments: { legal: true }`. The minifier strips a `//` banner without a word; only the built file's first bytes show it.
- **`minify` lives on `rolldownOptions.output`, with `dropConsole: false`.** Vite's library mode skips whitespace minification for ES output, so `build.minify` alone ships the bundle with its whitespace left in. `dropConsole` is all-or-nothing, and the card's one console call, the `console.info` version banner, is how you check which bundle the browser loaded.
- **Dev vs prod comes from `--mode development`** (`npm run dev`). A plain `vp build` is production: minified, no sourcemap.
- **`fmt.embeddedLanguageFormatting` stays `"off"`.** Otherwise Oxfmt reformats Lit `html` and `css` templates and changes the whitespace inside rendered elements, which is a DOM change, not a style change.
- **Decorators are not configured.** Rolldown reads `tsconfig.json` itself and enables Lit's legacy decorators from it. If that ever regresses, class fields overwrite Lit's accessors and reactivity dies while the build stays green; the suites that mount the real card catch it.
- **`lint.plugins` replaces Oxlint's defaults.** It names `typescript`, `unicorn` and `oxc` next to `vitest`; drop one and its rules stop running without a word. The `vitest/*` rules fail a committed `.only` or `.skip`, a test without an assertion, a duplicate title, an `expect` inside an `if` and a bare `toThrow()`, and `reportUnusedDisableDirectives` fails a disable comment that no longer suppresses anything.
- **`lint.options.denyWarnings: true`.** Without it `vp check` exits 0 on warnings, and CI lets them through.
- **`codeSplitting: false`.** The card is one file; a dashboard resource can't load a second chunk the bundler decided on.

**The `vite` override in `package.json` must name the same version as `vite-plus`.** It keeps npm from installing upstream Vite next to Vite+'s core. Dependabot bumps `vite-plus` but not the override, and `tests/toolchain.test.ts` fails until both match. Bump with `npx --package=vite-plus@<new> vp migrate --no-interactive`, which moves both; `npm install vite-plus@<new>` fails with ERESOLVE.

The build does not type-check. `vp check` is the only thing between a type error and a green build, which is why the gate runs it as its own step. It also catches a backtick inside a Lit `css` or `html` template, comments included, which ends the template early and fails the card at load while the build stays green.

`tsconfig.json`'s `lib` is the card's browser floor: `es2022`. That rules out ES2023 built-ins such as `toSorted()`, which the bundle doesn't polyfill; use `sorted()` from `src/sorted.ts`. `build.target` in `vite.config.ts` names the same level. Raising the floor raises the browser requirement for the card; change both together.

### Trying it in Home Assistant

Install the card through the Marketplace once so the Lovelace resource exists. Then copy each rebuilt `dist/orrery-card.js` over the installed file in `<config>/www/community/orrery-card/`, delete the `orrery-card.js.gz` beside it, and hard-refresh the browser (⌘⇧R / Ctrl⇧R). The Marketplace writes that gzipped copy on install and Home Assistant serves it first, so without the delete the browser keeps getting the old card.

## Verification gate

```bash
npx vp check                     # format, lint and the only type-check
npm test                         # vp test run
npm run build                    # must succeed clean
git diff --exit-code -- dist/    # the committed bundle matches that build
node -c dist/orrery-card.js
```

CI runs the same plus `npm audit --omit=dev --audit-level=high`, HACS validation and CodeQL. Failing locally only costs you a push.

`npx vp check` is the only type-check anywhere. The build strips types without checking them, so a type error builds cleanly all the way to a shipped bundle.

## Tests

The suites are in `tests/` and import from `vite-plus/test`. Most run in plain Node; `card.test.ts`, `editor.test.ts` and `palette.test.ts` opt into happy-dom with an `@vitest-environment happy-dom` docblock and drive the real elements, with the canvas replaced by `tests/fake-canvas.ts`. happy-dom has no layout and no canvas, so anything that depends on either is tested as data (`geometry.test.ts`, `renderer.test.ts`, `labels.test.ts`). HA's own elements are never defined in tests, on purpose.

| Suite | Covers |
|---|---|
| `ephemeris.test.ts` | planet positions, orbits, ticks and readouts, the home zenith and Jupiter's moons |
| `eclipses.test.ts` | stepping through eclipses, how they look from home, and their wording |
| `geometry.test.ts`, `renderer.test.ts`, `labels.test.ts` | projection, drawing and label placement |
| `interaction.test.ts` | keyboard map, pointer gestures, playback and date stepping |
| `config.test.ts`, `editor-fields.test.ts`, `editor.test.ts` | config validation and defaults, the editor's fields and summaries |
| `format.test.ts`, `i18n.test.ts` | localised text, language key and placeholder parity, the version pair |
| `card.test.ts`, `grid-cell.test.ts` | the card contract and the grid-cell fill |
| `palette.test.ts` | reading the theme's colours into the canvas palette, and failing a read that came back unresolved or all one colour |
| `toolchain.test.ts` | the `vite` override |

A change to what the card does comes with a test that fails without it.

### Coverage

There is no coverage gate, and the provider is not a dependency. To measure it once:

```bash
V=$(npx vp toolchain vitest | grep -oE 'vitest@[0-9.]+' | head -1 | cut -d@ -f2)
npm i --no-save @vitest/coverage-v8@"$V"
npx vp test run --coverage --coverage.provider=v8 --coverage.reporter=text \
  '--coverage.include=src/**/*.ts' '--coverage.exclude=src/**/*.test.ts'
```

`--no-save` leaves `package.json` and the lockfile alone; the next `npm ci` removes the provider. Use `--coverage.reporter=json` to write `coverage/coverage-final.json` (gitignored) for tools that read it.

## Version sync

`package.json` `version` and `CARD_VERSION` in `src/const.ts` must match; `tests/i18n.test.ts` checks it and the release workflow refuses a tag that disagrees with `package.json`. A bump edits both, rebuilds the bundle and commits all three together. Neither carries a `-beta` suffix: a pre-release has the final release's number and GitHub's pre-release flag.

## Dependencies

| Package | Pin | Why |
|---|---|---|
| `vite-plus` | exact, `package.json` | it decides what the committed bundle looks like; the `vite` override names the same version |
| `happy-dom` | exact | it decides what the DOM suites see; the sibling cards keep one version |
| `lit` | caret | maintained, keeps semver |
| `astronomy-engine` | caret | maintained, keeps semver; its notice must survive the build |

- **Dependabot's blind spot.** It bumps `vite-plus` and leaves the override alone. The toolchain test catches that.
- **Runtime vs dev.** What the build inlines into the bundle is a `dependency`; a build-time tool is a `devDependency` even though the build needs it. CI's `npm audit --omit=dev` only means something because of that split.
- **Adding a dependency.** The bundle loads on every dashboard, so a new runtime dependency is discussed in an issue first; today the card has `lit` and `astronomy-engine`. Its licence must be compatible with MIT and its notice must survive the build.

Both runtime dependencies are bundled into `dist/orrery-card.js`, so their notices ship with it:

| Package | Licence | Notice in the bundle |
|---|---|---|
| `astronomy-engine` (Don Cross) | MIT | `@preserve` block with the full licence text |
| `lit` and its `@lit/*` packages (Google) | BSD-3-Clause | `@license` / `SPDX-License-Identifier` comments |

`comments: { legal: true }` in `vite.config.ts` is what keeps those comments in the minified bundle, so don't remove it. After a dependency change, check that they are still there:

```bash
grep -c "Don Cross" dist/orrery-card.js
grep -c "BSD-3-Clause" dist/orrery-card.js
```

## Translations

1. Copy `src/localize/languages/en.json` to `<code>.json` and translate every value. Keep the `{placeholders}`.
2. Import it in `src/localize/localize.ts` the way the others are imported (`import * as pl from "./languages/pl.json"`) and add it to `LANGUAGE_REGISTRY`. A code that should read another language instead of English goes in `ALIASES` (Nynorsk reads Bokmål).
3. Run `npm test`. It checks that every file in `languages/` is registered and has the same keys and placeholders as English.

Missing keys fall back to English, so a partial translation is still a useful PR. German uses du, never Sie. Month, weekday and number formats come from the browser's `Intl`, so they don't need translating. A language that writes the date year first, like Chinese and Japanese, goes in `YEAR_FIRST` in `src/format.ts`. Constellation names stay in Latin, as the IAU names them.

## Where things are

| Path | What's there |
|---|---|
| `src/orrery-card.ts` | The Lit element: config, lifecycle, controls, pointer and keyboard input |
| `src/render/` | Canvas renderer, camera projection, distance scales, label placement, palette |
| `src/astro/` | Planet table and the astronomy-engine wrappers (orbits, ticks, readouts, the home location, Jupiter's moons, eclipses) |
| `src/format.ts` | Everything localised: dates, numbers, readout text |
| `src/interaction.ts` | Keyboard map, pointer gestures, playback and date stepping; no DOM, so it is unit-tested directly |
| `src/config.ts` | YAML validation, defaults, and the editor's fill-in and tidy-up of defaults |
| `src/editor.ts` | Visual editor: the title and colour tiles on top, then collapsed groups with a summary line; defaults shown, only changes saved |
| `src/editor-fields.ts`, `src/editor-art.ts` | What the editor shows, as plain data: the fields per group, the summary lines, and the SVG pictures on the colour-theme and background tiles |
| `src/styles.ts` | The card's CSS: its `--orr-*` tokens and the three `--orrery-*` overrides a theme or card-mod can set |
| `src/localize/` | The language packs and the lookup |

The card only redraws when something changes. Keep it that way: a new animation must stop when the card is off screen, when the tab is hidden, and under `prefers-reduced-motion`.

## Style

- TypeScript strict; the `tsconfig.json` flags are not negotiable, and `vp check` reports no warnings (`denyWarnings`).
- Comments say why, not what; identifiers carry the what.
- The browser floor is ES2022: `sorted()` from `src/sorted.ts` instead of `toSorted()`.
- Runtime dependencies are `lit` and `astronomy-engine`; adding one goes through *Dependencies*.
- German copy uses du.

## Reporting issues

Open an issue with:

- your Home Assistant version and the card version (the console banner, or the `?v=` on the resource)
- your browser
- the card's YAML and a screenshot

A security problem goes through **Report a vulnerability** under the repository's **Security** tab, not a public issue.
