/**
 * The pictures on the editor's colour-theme and background tiles: a small
 * orrery in the theme's own colours, on the background the card will
 * draw it on. Plain data (SVG as data: URIs), so a node test can read it.
 *
 * The colours are copied from styles.ts, where the card defines them. A
 * tile is a preview, not the card itself, so it takes each theme's
 * fallback values: the HA theme tile shows Home Assistant's default
 * primary and accent colours, not the user's.
 */
import type { Appearance, ColorTheme } from "./types";

interface Art {
  /** Tile background: the sky gradient in space, the card colour in theme. */
  inner: string;
  outer: string;
  /** Null draws no stars (the theme appearance has none). */
  star: string | null;
  orbit: string;
  /** Planets. */
  accent: string;
  /** The Sun. */
  accent2: string;
  earth: string;
  /** A hairline round the tile, so a white tile shows on a white dialog. */
  edge: string | null;
}

/** The space appearance, per colour theme (styles.ts, ha-card.space and ct-*). */
const SPACE: Record<ColorTheme, Art> = {
  vibe: {
    inner: "#11172a",
    outer: "#070a12",
    star: "#c8d2ee",
    orbit: "#94a0be",
    accent: "#48c9e6",
    accent2: "#a878f0",
    earth: "#e9fbff",
    edge: null,
  },
  ha: {
    inner: "#11172a",
    outer: "#070a12",
    star: "#c8d2ee",
    orbit: "#94a0be",
    accent: "#009ac7",
    accent2: "#ff9800",
    earth: "#e9fbff",
    edge: null,
  },
  kenobi: {
    inner: "#0c0c0e",
    outer: "#000000",
    star: "#ffffff",
    orbit: "#8f8e96",
    accent: "#ffe81f",
    accent2: "#ff4b3a",
    earth: "#fff8cc",
    edge: null,
  },
  spock: {
    inner: "#080a1c",
    outer: "#000000",
    star: "#e4e2ff",
    orbit: "#8b86b8",
    accent: "#ff9900",
    accent2: "#9999ff",
    earth: "#ffe3c2",
    edge: null,
  },
};

/** The theme appearance's accents on a light and on a dark card. */
const THEME_ACCENTS: Record<ColorTheme, { light: [string, string]; dark: [string, string] }> = {
  vibe: { light: ["#0b7fa0", "#7a45d6"], dark: ["#48c9e6", "#a878f0"] },
  ha: { light: ["#009ac7", "#ff9800"], dark: ["#009ac7", "#ff9800"] },
  kenobi: { light: ["#8a6a00", "#c0392b"], dark: ["#ffe81f", "#ff5a4a"] },
  spock: { light: ["#b35900", "#5252c7"], dark: ["#ff9900", "#9999ff"] },
};

function themeArt(theme: ColorTheme, dark: boolean): Art {
  const [accent, accent2] = THEME_ACCENTS[theme][dark ? "dark" : "light"];
  const card = dark ? "#1c1c1c" : "#ffffff";
  return {
    inner: card,
    outer: card,
    star: null,
    orbit: dark ? "#9b9b9b" : "#727272",
    accent,
    accent2,
    // In the theme appearance Earth is drawn in the accent.
    earth: accent,
    edge: dark ? "#3a3a3a" : "#e0e0e0",
  };
}

/** Stars at fixed spots, clear of the orbits' middle. */
const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [9, 9, 0.7],
  [22, 54, 0.5],
  [31, 6, 0.5],
  [70, 7, 0.6],
  [86, 15, 0.5],
  [80, 55, 0.7],
  [57, 59, 0.5],
  [6, 36, 0.5],
  [91, 40, 0.5],
];

/** Three orbits, each [rx, ry, planet angle in degrees, planet radius]. */
const ORBITS: ReadonlyArray<readonly [number, number, number, number]> = [
  [15, 6, 205, 1.5],
  [27, 11, 330, 2],
  [40, 16.5, 120, 2.6],
];

const CX = 48;
const CY = 32;

/** The Sun as the card draws it, a geodesic wireframe, reduced to the
 *  outline of a projected icosahedron: a hexagon and the triangle inside. */
const SUN_R = 4.4;
const hex = Array.from({ length: 6 }, (_, i) => {
  const r = ((60 * i - 90) * Math.PI) / 180;
  return `${(CX + SUN_R * Math.cos(r)).toFixed(2)} ${(CY + SUN_R * Math.sin(r)).toFixed(2)}`;
});
const SUN_OUTLINE = `M${hex.join("L")}Z`;
const SUN_FACES = `M${hex[0]}L${hex[2]}L${hex[4]}Z`;

function svg(a: Art): string {
  const at = (rx: number, ry: number, deg: number): [string, string] => {
    const r = (deg * Math.PI) / 180;
    return [(CX + rx * Math.cos(r)).toFixed(1), (CY + ry * Math.sin(r)).toFixed(1)];
  };
  const stars = a.star
    ? STARS.map(
        ([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${a.star}" fill-opacity=".75"/>`,
      ).join("")
    : "";
  const orbits = ORBITS.map(
    ([rx, ry]) => `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}"/>`,
  ).join("");
  const planets = ORBITS.map(([rx, ry, deg, r], i) => {
    const [x, y] = at(rx, ry, deg);
    // The middle orbit is Earth's.
    const fill = i === 1 ? a.earth : a.accent;
    return (
      `<circle cx="${x}" cy="${y}" r="${(r * 2.4).toFixed(1)}" fill="url(#g)"/>` +
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
    );
  }).join("");
  const edge = a.edge ? ` stroke="${a.edge}" stroke-width="1"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64">` +
    `<defs>` +
    `<radialGradient id="s" r="70%"><stop offset="0" stop-color="${a.inner}"/><stop offset="1" stop-color="${a.outer}"/></radialGradient>` +
    `<radialGradient id="h"><stop offset="0" stop-color="${a.accent2}" stop-opacity=".6"/><stop offset="1" stop-color="${a.accent2}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="g"><stop offset="0" stop-color="${a.accent}" stop-opacity=".45"/><stop offset="1" stop-color="${a.accent}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect x=".5" y=".5" width="95" height="63" rx="6" fill="url(#s)"${edge}/>` +
    stars +
    `<g fill="none" stroke="${a.orbit}" stroke-opacity=".6" stroke-width=".8">${orbits}</g>` +
    `<circle cx="${CX}" cy="${CY}" r="12" fill="url(#h)"/>` +
    `<g fill="none" stroke="${a.accent2}" stroke-linejoin="round">` +
    `<path d="${SUN_OUTLINE}" stroke-width="1.1"/>` +
    `<path d="${SUN_FACES}" stroke-width=".6" stroke-opacity=".8"/>` +
    `</g>` +
    planets +
    `</svg>`
  );
}

const uri = (a: Art): string => `data:image/svg+xml,${encodeURIComponent(svg(a))}`;

export type TileImage = string | { src: string; src_dark: string };

/** The card in `theme`, drawn on `appearance`'s background. The theme
 *  appearance follows the dashboard, so it gets a light and a dark image. */
export function tileImage(theme: ColorTheme, appearance: Appearance): TileImage {
  if (appearance === "space") return uri(SPACE[theme]);
  return { src: uri(themeArt(theme, false)), src_dark: uri(themeArt(theme, true)) };
}
