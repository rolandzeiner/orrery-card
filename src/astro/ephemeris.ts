import {
  Body,
  Constellation,
  EquatorFromVector,
  GeoMoon,
  GeoVector,
  HelioVector,
  Illumination,
  JupiterMoons,
  MakeTime,
  MoonPhase,
  ObserverVector,
  RotateVector,
  Rotation_EQJ_ECL,
  Vector,
} from "astronomy-engine";

import { DAY_MS } from "../const";
import type { PlanetDef } from "./bodies";
import { observerAt, type HomeLocation } from "./home";

/** Ecliptic (J2000) cartesian coordinates in AU. x points at the March
 *  equinox, z at the ecliptic north pole. */
export type Vec3 = [number, number, number];

const J2000 = Date.UTC(2000, 0, 1, 12);
const EQJ_TO_ECL = Rotation_EQJ_ECL();

function toEcliptic(v: Vector): Vec3 {
  const e = RotateVector(EQJ_TO_ECL, v);
  return [e.x, e.y, e.z];
}

/** Heliocentric position of a body at `ms` (Unix ms). ~11 µs per call. */
export function helio(body: Body, ms: number): Vec3 {
  return toEcliptic(HelioVector(body, new Date(ms)));
}

const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function unit(v: Vec3): Vec3 {
  const l = length(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ── Orbits ───────────────────────────────────────────────────────────────

export interface Orbit {
  /** Time the samples are centred on. */
  t0: number;
  /** `n` positions evenly spaced in TIME over one period, starting half a
   *  period before t0. Even time spacing is what lets a trail be read
   *  straight off the samples. */
  pts: ReadonlyArray<Vec3>;
}

export const ORBIT_SAMPLES = 240;

export function sampleOrbit(p: PlanetDef, center: number, n = ORBIT_SAMPLES): Orbit {
  const span = p.period * DAY_MS;
  const start = center - span / 2;
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) pts.push(helio(p.body, start + (i * span) / n));
  return { t0: center, pts };
}

/** Fractional sample index for time `t` on an orbit (0 ≤ f < n). */
export function orbitIndex(orbit: Orbit, p: PlanetDef, t: number): number {
  const span = p.period * DAY_MS;
  const n = orbit.pts.length;
  let f = ((t - (orbit.t0 - span / 2)) / span) % 1;
  if (f < 0) f += 1;
  return f * n;
}

// ── Ticks ────────────────────────────────────────────────────────────────

export type TickLabel =
  | { kind: "month"; year: number; month: number }
  | { kind: "year"; year: number; span: number };

export interface Tick {
  t: number;
  pos: Vec3;
  major: boolean;
  label: TickLabel | null;
}

/** Ticks over one period centred on `center`. Tick times are anchored to
 *  the calendar (or to J2000 for day steps), never to `center`, so they
 *  stay put while time plays instead of sliding along the orbit. */
export function makeTicks(p: PlanetDef, center: number): Tick[] {
  const half = (p.period * DAY_MS) / 2;
  const lo = center - half;
  const hi = center + half;
  const spec = p.ticks;
  const out: Tick[] = [];
  const add = (t: number, major: boolean, label: TickLabel | null): void => {
    if (t >= lo && t < hi) out.push({ t, pos: helio(p.body, t), major, label });
  };

  if (spec.kind === "days") {
    const step = spec.step * DAY_MS;
    for (let k = Math.ceil((lo - J2000) / step); J2000 + k * step < hi; k++) {
      add(J2000 + k * step, false, null);
    }
  } else if (spec.kind === "months") {
    const d = new Date(lo);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    for (let i = 0; i < 14; i++) {
      const start = Date.UTC(y, m + i, 1);
      const s = new Date(start);
      add(start, true, { kind: "month", year: s.getUTCFullYear(), month: s.getUTCMonth() });
      add(Date.UTC(y, m + i, 16), false, null);
    }
  } else {
    const y0 = new Date(lo).getUTCFullYear();
    const y1 = new Date(hi).getUTCFullYear();
    for (let y = Math.ceil(y0 / spec.step) * spec.step; y <= y1; y += spec.step) {
      const labelled = y % spec.labelEvery === 0;
      add(
        Date.UTC(y, 0, 1),
        labelled,
        labelled ? { kind: "year", year: y, span: spec.labelEvery } : null,
      );
    }
  }
  return out;
}

/** Per-planet cache of orbit samples and ticks. Orbit shapes drift only
 *  over decades, so they are resampled rarely; ticks slide with time and
 *  are rebuilt whenever time moves a sixteenth of a period. */
export class OrbitCache {
  private readonly orbits = new Map<Body, Orbit>();
  private readonly ticks = new Map<Body, { center: number; list: Tick[] }>();

  orbit(p: PlanetDef, t: number): Orbit {
    const cached = this.orbits.get(p.body);
    if (cached && Math.abs(t - cached.t0) < 40 * 365.25 * DAY_MS) return cached;
    const fresh = sampleOrbit(p, t);
    this.orbits.set(p.body, fresh);
    return fresh;
  }

  tickList(p: PlanetDef, t: number): ReadonlyArray<Tick> {
    const cached = this.ticks.get(p.body);
    if (cached && Math.abs(t - cached.center) < (p.period * DAY_MS) / 16) return cached.list;
    const list = makeTicks(p, t);
    this.ticks.set(p.body, { center: t, list });
    return list;
  }
}

// ── Readouts ─────────────────────────────────────────────────────────────

export interface SkySnapshot {
  t: number;
  /** Heliocentric ecliptic positions, keyed by body. */
  pos: ReadonlyMap<Body, Vec3>;
  earthSunAu: number;
  earthMarsAu: number;
  earthJupiterAu: number;
  /** Lit fraction of the Moon, 0–1. */
  moonLit: number;
  /** Moon phase angle in degrees: 0 new, 90 first quarter, 180 full. */
  moonPhase: number;
  /** Unit vector from Earth towards the Moon, ecliptic. */
  moonDir: Vec3;
  /** Unit vector from Earth's centre to the zenith of the HA home,
   *  ecliptic. Null unless asked for. */
  homeDir: Vec3 | null;
  /** The Sun is above the home's horizon (geometric, no refraction). */
  homeDay: boolean;
  /** Unit vectors from Jupiter to its four big moons, ecliptic, in
   *  JUPITER_MOONS order. Null unless asked for. */
  jupiterMoons: ReadonlyArray<Vec3> | null;
}

/** What a snapshot computes beyond the planets, when a layer needs it. */
export interface SnapshotExtras {
  home?: HomeLocation | null;
  jupiterMoons?: boolean;
}

export function skySnapshot(
  t: number,
  bodies: ReadonlyArray<Body>,
  extras: SnapshotExtras = {},
): SkySnapshot {
  const date = new Date(t);
  const pos = new Map<Body, Vec3>();
  for (const b of bodies) pos.set(b, helio(b, t));
  const earth = pos.get(Body.Earth) ?? helio(Body.Earth, t);
  const homeDir = extras.home ? homeZenith(t, extras.home) : null;
  const sunDir: Vec3 = [-earth[0], -earth[1], -earth[2]];
  return {
    t,
    pos,
    earthSunAu: length(earth),
    earthMarsAu: GeoVector(Body.Mars, date, true).Length(),
    earthJupiterAu: GeoVector(Body.Jupiter, date, true).Length(),
    moonLit: Illumination(Body.Moon, date).phase_fraction,
    moonPhase: MoonPhase(date),
    moonDir: unit(toEcliptic(GeoMoon(date))),
    homeDir,
    homeDay: homeDir !== null && dot(homeDir, sunDir) > 0,
    jupiterMoons: extras.jupiterMoons ? jupiterMoonDirs(t) : null,
  };
}

/** Unit vector from Earth's centre towards the zenith of `home`, ecliptic:
 *  the sky straight above it. Geocentric, so it differs from the true
 *  vertical by up to 0.2°, which no needle on the card can show. */
export function homeZenith(t: number, home: HomeLocation): Vec3 {
  return unit(toEcliptic(ObserverVector(new Date(t), observerAt(home), false)));
}

export interface JupiterMoonDef {
  key: "io" | "europa" | "ganymede" | "callisto";
  /** Semi-major axis, km. */
  km: number;
  /** Orbital period, days. */
  period: number;
}

export const JUPITER_MOONS: ReadonlyArray<JupiterMoonDef> = [
  { key: "io", km: 421_700, period: 1.769 },
  { key: "europa", km: 671_034, period: 3.551 },
  { key: "ganymede", km: 1_070_412, period: 7.155 },
  { key: "callisto", km: 1_882_709, period: 16.689 },
];

/** Unit vectors from Jupiter to Io, Europa, Ganymede and Callisto,
 *  ecliptic. ~20 µs per call. */
export function jupiterMoonDirs(t: number): Vec3[] {
  const m = JupiterMoons(new Date(t));
  return [m.io, m.europa, m.ganymede, m.callisto].map((s) =>
    unit(toEcliptic(new Vector(s.x, s.y, s.z, s.t))),
  );
}

export interface PlanetDetails {
  sunAu: number;
  earthAu: number;
  /** IAU constellation name as seen from Earth, e.g. "Cancer". */
  constellation: string;
}

export function planetDetails(body: Body, t: number): PlanetDetails {
  const date = new Date(t);
  const sunAu = length(helio(body, t));
  if (body === Body.Earth) return { sunAu, earthAu: 0, constellation: "" };
  const geo = GeoVector(body, date, true);
  const eq = EquatorFromVector(geo);
  return { sunAu, earthAu: geo.Length(), constellation: Constellation(eq.ra, eq.dec).name };
}

/** Light travel time for a distance in AU, in seconds. */
export const lightSeconds = (au: number): number => au * 499.004784;

/** A north pole given as J2000 RA and Dec in degrees, as an ecliptic unit
 *  vector. */
function pole(raDeg: number, decDeg: number): Vec3 {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const v = new Vector(
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
    MakeTime(new Date(J2000)),
  );
  return unit(toEcliptic(v));
}

/** Saturn's north pole (RA 40.589°, Dec 83.537°). Its rings lie in the
 *  plane perpendicular to it. */
export const SATURN_POLE: Vec3 = pole(40.589, 83.537);

/** Jupiter's north pole (RA 268.057°, Dec 64.495°, IAU). Its four big
 *  moons orbit within half a degree of its equator. */
export const JUPITER_POLE: Vec3 = pole(268.057, 64.495);
