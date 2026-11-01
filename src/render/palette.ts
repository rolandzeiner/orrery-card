/** Colours the canvas draws with, resolved from the card's CSS tokens.
 *
 *  Canvas can't read `var(--x)`, and a custom property's computed value is
 *  whatever the theme wrote — a hex, a `color-mix()`, a `light-dark()`.
 *  Giving each token its own probe element with `color: var(--token)` and
 *  reading the computed colour back lets the browser resolve all of those
 *  into an rgb() string.
 *
 *  One element per token, never one element restyled per token: WebKit
 *  (seen on iPadOS 17, issue #10) can keep serving the first computed
 *  colour of an element whose inline colour is rewritten and read back in
 *  a loop during page load, so every token came back as the accent. An
 *  element whose colour never changes has nothing to go stale. */
export interface Palette {
  /** Sky gradient stops; null in `theme` appearance (the card shows through). */
  skyInner: string | null;
  skyOuter: string | null;
  star: string | null;
  orbit: string;
  label: string;
  ink: string;
  accent: string;
  accent2: string;
  /** The accents at zero alpha — gradient end stops. Fading to the keyword
   *  `transparent` (black at zero alpha) would darken the glow's middle. */
  accentClear: string;
  accent2Clear: string;
  earthCore: string;
  moon: string;
  /** Wash behind the date, and the same at zero alpha for the fade. */
  plate: string;
  plateClear: string;
  font: string;
}

const TOKENS = {
  skyInner: "--orr-sky-inner",
  skyOuter: "--orr-sky-outer",
  star: "--orr-star",
  orbit: "--orr-orbit",
  label: "--orr-label",
  ink: "--orr-ink",
  accent: "--orr-accent",
  accent2: "--orr-accent-2",
  earthCore: "--orr-earth",
  moon: "--orr-moon",
  plate: "--orr-plate",
} as const;

type TokenKey = keyof typeof TOKENS;

/** The probe children the card renders: one per token, in a fixed order.
 *  Each carries an inline `transition: none !important`. Under
 *  prefers-reduced-motion the card's catch-all gives every element a
 *  0.01ms `transition: all`, and a read taken mid-transition after a theme
 *  change returns the colour it is leaving. Inline !important beats any
 *  stylesheet rule, including a theme's or card-mod's. */
export const PROBE_TOKENS = Object.entries(TOKENS) as ReadonlyArray<[TokenKey, string]>;

const TRANSPARENT = /^(transparent|rgba\([^)]*,\s*0\))$/;

/** Reads the palette from the probe's children, or returns null when the
 *  styles aren't available yet. Callers retry later.
 *
 *  A card that isn't in the document has no computed style: every colour
 *  comes back as "". HA does this routinely — it connects a card and moves
 *  it before Lit's first update runs — and an empty colour is silently
 *  ignored by strokeStyle (so everything draws black) and throws in
 *  addColorStop (so the frame stops halfway).
 *
 *  A read where every required token resolved to the same colour is a
 *  failed read too: no theme draws orbits, labels, planets and the date
 *  plate in one colour, but a browser that hasn't resolved the tokens yet
 *  returns the inherited colour for all of them, and a stored palette is
 *  never re-read, so the whole canvas would stay one flat colour. */
export function readPalette(probe: HTMLElement): Palette | null {
  if (!probe.isConnected) return null;
  const resolve = (key: TokenKey): string => {
    const el = probe.querySelector<HTMLElement>(`[data-token="${key}"]`);
    return el ? getComputedStyle(el).color : "";
  };
  const optional = (key: TokenKey): string | null => {
    const value = resolve(key);
    return TRANSPARENT.test(value) ? null : value;
  };
  const accent = resolve("accent");
  const accent2 = resolve("accent2");
  const plate = resolve("plate");
  const palette: Palette = {
    skyInner: optional("skyInner"),
    skyOuter: optional("skyOuter"),
    star: optional("star"),
    orbit: resolve("orbit"),
    label: resolve("label"),
    ink: resolve("ink"),
    accent,
    accent2,
    accentClear: fade(accent, 0),
    accent2Clear: fade(accent2, 0),
    earthCore: resolve("earthCore"),
    moon: resolve("moon"),
    plate,
    plateClear: fade(plate, 0),
    font: getComputedStyle(probe).fontFamily || "sans-serif",
  };
  const required = [
    palette.orbit,
    palette.label,
    palette.ink,
    palette.accent,
    palette.accent2,
    palette.earthCore,
    palette.moon,
    palette.plate,
  ];
  if (!required.every(Boolean)) return null;
  if (new Set(required).size === 1) return null;
  return palette;
}

/** A computed colour at a new alpha. Handles the two shapes
 *  getComputedStyle returns — `rgb(r, g, b)` / `rgba(r, g, b, a)` and
 *  `color(srgb r g b)` — and falls back to `transparent` otherwise. */
function fade(color: string, alpha: number): string {
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color);
  if (srgb) return `color(srgb ${srgb[1]} ${srgb[2]} ${srgb[3]} / ${alpha})`;
  return "transparent";
}
