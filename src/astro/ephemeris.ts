import {
  Body,
  Constellation,
  EquatorFromVector,
  GeoMoon,
  GeoVector,
  HelioVector,
  Illumination,
  MakeTime,
  MoonPhase,
  RotateVector,
  Rotation_EQJ_ECL,
  Vector,
} from "astronomy-engine";

import { DAY_MS } from "../const";
import type { PlanetDef } from "./bodies";

/** Ecliptic (J2000) cartesian coordinates in AU. x points at the March
 *  equinox, z at the ecliptic north pole. */
export type Vec3 = [number, number, number];

const J2000 = Date.UTC(2000, 0, 1, 12);
const EQJ_TO_ECL = Rotation_EQJ_ECL();

export function toEcliptic(v: Vector): Vec3 {
  const e = RotateVector(EQJ_TO_ECL, v);
  return [e.x, e.y, e.z];
}

/** Heliocentric position of a body at `ms` (Unix ms). ~11 µs per call. */
export function helio(body: Body, ms: number): Vec3 {
  return toEcliptic(HelioVector(body, new Date(ms)));
}

export const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

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
      add(Date.UTC(y, 0, 1), labelled, labelled ? { kind: "year", year: y, span: spec.labelEvery } : null);
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
}

export function skySnapshot(t: number, bodies: ReadonlyArray<Body>): SkySnapshot {
  const date = new Date(t);
  const pos = new Map<Body, Vec3>();
  for (const b of bodies) pos.set(b, helio(b, t));
  const earth = pos.get(Body.Earth) ?? helio(Body.Earth, t);
  return {
    t,
    pos,
    earthSunAu: length(earth),
    earthMarsAu: GeoVector(Body.Mars, date, true).Length(),
    earthJupiterAu: GeoVector(Body.Jupiter, date, true).Length(),
    moonLit: Illumination(Body.Moon, date).phase_fraction,
    moonPhase: MoonPhase(date),
    moonDir: unit(toEcliptic(GeoMoon(date))),
  };
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

/** Saturn's north pole (RA 40.589°, Dec 83.537°, J2000), as an ecliptic
 *  unit vector. Its rings lie in the plane perpendicular to it. */
export const SATURN_POLE: Vec3 = (() => {
  const ra = (40.589 * Math.PI) / 180;
  const dec = (83.537 * Math.PI) / 180;
  const v = new Vector(
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
    MakeTime(new Date(J2000)),
  );
  return unit(toEcliptic(v));
})();
