/** Colours the canvas draws with, resolved from the card's CSS tokens.
 *
 *  Canvas can't read `var(--x)`, and a custom property's computed value is
 *  whatever the theme wrote — a hex, a `color-mix()`, a `light-dark()`.
 *  Setting each token as a probe element's `color` and reading the computed
 *  colour back lets the browser resolve all of those into an rgb() string. */
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
} as const;

const TRANSPARENT = /^(transparent|rgba\([^)]*,\s*0\))$/;

export function readPalette(probe: HTMLElement): Palette {
  const resolve = (token: string): string => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };
  const optional = (token: string): string | null => {
    const value = resolve(token);
    return TRANSPARENT.test(value) ? null : value;
  };
  const accent = resolve(TOKENS.accent);
  const accent2 = resolve(TOKENS.accent2);
  const palette: Palette = {
    skyInner: optional(TOKENS.skyInner),
    skyOuter: optional(TOKENS.skyOuter),
    star: optional(TOKENS.star),
    orbit: resolve(TOKENS.orbit),
    label: resolve(TOKENS.label),
    ink: resolve(TOKENS.ink),
    accent,
    accent2,
    accentClear: fade(accent, 0),
    accent2Clear: fade(accent2, 0),
    earthCore: resolve(TOKENS.earthCore),
    moon: resolve(TOKENS.moon),
    font: getComputedStyle(probe).fontFamily || "sans-serif",
  };
  probe.style.color = "";
  return palette;
}

/** A computed colour at a new alpha. Handles the two shapes
 *  getComputedStyle returns — `rgb(r, g, b)` / `rgba(r, g, b, a)` and
 *  `color(srgb r g b)` — and falls back to `transparent` otherwise. */
export function fade(color: string, alpha: number): string {
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color);
  if (srgb) return `color(srgb ${srgb[1]} ${srgb[2]} ${srgb[3]} / ${alpha})`;
  return "transparent";
}
