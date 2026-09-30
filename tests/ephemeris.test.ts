import { Body } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { PLANET_BY_KEY, PLUTO } from "../src/astro/bodies";
import {
  helio,
  makeTicks,
  OrbitCache,
  orbitIndex,
  planetDetails,
  sampleOrbit,
  skySnapshot,
} from "../src/astro/ephemeris";

const longitude = (v: [number, number, number]): number => {
  const deg = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  return (deg + 360) % 360;
};

// Positions are in the J2000 frame, but equinoxes and solstices are defined
// against the equinox of date, which precession has moved 50.3″ a year since
// 2000: 26 years × 50.3″ = 0.363°. So the 2026 equinox sits at 179.637°.
const PRECESSION_2026 = (26 * 50.29) / 3600;

describe("helio", () => {
  it("puts Earth opposite the Sun on the March equinox", () => {
    // Equinox 2026-03-20 14:46 UTC.
    expect(longitude(helio(Body.Earth, Date.UTC(2026, 2, 20, 14, 46)))).toBeCloseTo(180 - PRECESSION_2026, 1);
  });

  it("puts Earth a quarter turn on at the June solstice", () => {
    // Solstice 2026-06-21 08:24 UTC.
    expect(longitude(helio(Body.Earth, Date.UTC(2026, 5, 21, 8, 24)))).toBeCloseTo(270 - PRECESSION_2026, 1);
  });

  it("keeps Earth on the ecliptic plane", () => {
    expect(Math.abs(helio(Body.Earth, Date.UTC(2026, 8, 26))[2])).toBeLessThan(1e-4);
  });
});

describe("orbits", () => {
  it("samples one period evenly and finds the current sample", () => {
    const earth = PLANET_BY_KEY.earth;
    const t = Date.UTC(2026, 8, 26);
    const orbit = sampleOrbit(earth, t, 120);
    expect(orbit.pts).toHaveLength(120);
    // t0 sits half a period into the samples.
    expect(orbitIndex(orbit, earth, t)).toBeCloseTo(60, 5);
  });

  it("samples Pluto's orbit from inside Neptune's out to 49 AU", () => {
    const radii = sampleOrbit(PLUTO, Date.UTC(2026, 8, 26)).pts.map((p) => Math.hypot(...p));
    expect(Math.min(...radii)).toBeGreaterThan(29.5);
    expect(Math.min(...radii)).toBeLessThan(30.07);
    expect(Math.max(...radii)).toBeGreaterThan(49);
    expect(Math.max(...radii)).toBeLessThan(49.5);
  });

  it("reuses a cached orbit instead of resampling", () => {
    const cache = new OrbitCache();
    const jupiter = PLANET_BY_KEY.jupiter;
    const first = cache.orbit(jupiter, Date.UTC(2026, 0, 1));
    expect(cache.orbit(jupiter, Date.UTC(2030, 0, 1))).toBe(first);
  });
});

describe("makeTicks", () => {
  const t = Date.UTC(2026, 8, 26);

  it("labels Earth's orbit with each month once", () => {
    const labels = makeTicks(PLANET_BY_KEY.earth, t).filter((k) => k.label?.kind === "month");
    expect(labels).toHaveLength(12);
    const months = labels.map((k) => (k.label?.kind === "month" ? k.label.month : -1)).sort((a, b) => a - b);
    expect(months).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("ticks Jupiter yearly on 1 January, labelling every year", () => {
    const ticks = makeTicks(PLANET_BY_KEY.jupiter, t);
    expect(ticks.length).toBeGreaterThanOrEqual(11);
    expect(ticks.every((k) => new Date(k.t).getUTCMonth() === 0 && new Date(k.t).getUTCDate() === 1)).toBe(true);
    expect(ticks.every((k) => k.label?.kind === "year")).toBe(true);
  });

  it("anchors day ticks to the calendar, so they don't slide as time plays", () => {
    const a = makeTicks(PLANET_BY_KEY.mercury, t).map((k) => k.t);
    const b = makeTicks(PLANET_BY_KEY.mercury, t + 3 * 86_400_000).map((k) => k.t);
    const shared = a.filter((x) => b.includes(x));
    expect(shared.length).toBeGreaterThanOrEqual(a.length - 1);
  });
});

describe("readouts", () => {
  const fullMoon = Date.UTC(2026, 8, 26, 12);

  it("shows a nearly full Moon on 26 September 2026", () => {
    const sky = skySnapshot(fullMoon, [Body.Earth]);
    expect(sky.moonLit).toBeGreaterThan(0.98);
    expect(sky.moonPhase).toBeGreaterThan(170);
    expect(sky.moonPhase).toBeLessThan(190);
  });

  it("keeps the Sun–Earth distance within the orbit's extremes", () => {
    const sky = skySnapshot(fullMoon, [Body.Earth]);
    expect(sky.earthSunAu).toBeGreaterThan(0.983);
    expect(sky.earthSunAu).toBeLessThan(1.017);
  });

  it("finds Pluto in Capricornus, about 35 AU away, in 2026", () => {
    const pluto = planetDetails(Body.Pluto, fullMoon);
    expect(pluto.constellation).toBe("Capricornus");
    expect(pluto.earthAu).toBeGreaterThan(34);
    expect(pluto.earthAu).toBeLessThan(37);
  });

  it("finds Mars in Cancer on 26 September 2026", () => {
    const mars = planetDetails(Body.Mars, fullMoon);
    expect(mars.constellation).toBe("Cancer");
    expect(mars.earthAu).toBeGreaterThan(1.5);
    expect(mars.earthAu).toBeLessThan(1.9);
  });
});
