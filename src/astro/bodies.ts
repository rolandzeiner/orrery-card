import { Body } from "astronomy-engine";

/** How an orbit is ticked. Ticks are equal steps of time, so their spacing
 *  along the orbit shows how fast the planet moves there. */
export type TickSpec =
  | { kind: "days"; step: number }
  | { kind: "months" }
  | { kind: "years"; step: number; labelEvery: number };

export interface PlanetDef {
  body: Body;
  /** Stable key for translations and label state. */
  key: PlanetKey;
  /** Sidereal period in days. */
  period: number;
  /** Semi-major axis, AU. */
  au: number;
  /** Dot radius in CSS px at a 520 px card. */
  size: number;
  ticks: TickSpec;
  /** Which side of the orbit its tick labels go: 1 outward, -1 inward.
   *  Alternated so labels of neighbouring orbits don't share a gap. */
  labelSide: 1 | -1;
}

export type PlanetKey =
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

export const PLANETS: ReadonlyArray<PlanetDef> = [
  { body: Body.Mercury, key: "mercury", au: 0.387, period: 87.969, size: 2.3, ticks: { kind: "days", step: 10 }, labelSide: 1 },
  { body: Body.Venus, key: "venus", au: 0.723, period: 224.701, size: 3.1, ticks: { kind: "days", step: 15 }, labelSide: 1 },
  { body: Body.Earth, key: "earth", au: 1, period: 365.256, size: 3.4, ticks: { kind: "months" }, labelSide: 1 },
  { body: Body.Mars, key: "mars", au: 1.524, period: 686.98, size: 2.8, ticks: { kind: "days", step: 30 }, labelSide: 1 },
  { body: Body.Jupiter, key: "jupiter", au: 5.203, period: 4332.59, size: 5.4, ticks: { kind: "years", step: 1, labelEvery: 1 }, labelSide: -1 },
  { body: Body.Saturn, key: "saturn", au: 9.537, period: 10759.22, size: 4.7, ticks: { kind: "years", step: 1, labelEvery: 5 }, labelSide: -1 },
  { body: Body.Uranus, key: "uranus", au: 19.19, period: 30688.5, size: 3.9, ticks: { kind: "years", step: 5, labelEvery: 20 }, labelSide: -1 },
  { body: Body.Neptune, key: "neptune", au: 30.07, period: 60182, size: 3.8, ticks: { kind: "years", step: 10, labelEvery: 40 }, labelSide: 1 },
];

/** Pluto, a dwarf planet, drawn only with `show_pluto`. Its orbit is
 *  eccentric and tilted 17°: it runs from just inside Neptune's orbit
 *  (29.7 AU) out to 49.3 AU, past the edge the scales are fitted to. */
export const PLUTO: PlanetDef = {
  body: Body.Pluto,
  key: "pluto",
  au: 39.48,
  period: 90560,
  size: 2,
  ticks: { kind: "years", step: 10, labelEvery: 50 },
  labelSide: 1,
};

const WITH_PLUTO: ReadonlyArray<PlanetDef> = [...PLANETS, PLUTO];

/** The bodies the card draws, innermost first. */
export const shownBodies = (showPluto: boolean): ReadonlyArray<PlanetDef> => (showPluto ? WITH_PLUTO : PLANETS);

export const PLANET_BY_KEY: Readonly<Record<PlanetKey, PlanetDef>> = Object.fromEntries(
  WITH_PLUTO.map((p) => [p.key, p]),
) as Record<PlanetKey, PlanetDef>;

/** Aphelion of the outermost planet, in AU — the distance every scale is
 *  normalised against so Neptune's orbit sits at radius 1. */
export const OUTER_EDGE_AU = 30.5;
/** Mercury's perihelion, AU. The Sun glyph is kept inside it. */
export const MERCURY_PERIHELION_AU = 0.3075;
/** Mars' aphelion, AU. The "inner planets" view fits it. */
export const MARS_APHELION_AU = 1.67;
