import { describe, expect, it } from "vite-plus/test";

import {
  FIT,
  Projector,
  clampElevation,
  clampZoom,
  fitSquare,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../src/render/camera";
import { makeGeodesic, ringPoints } from "../src/render/decor";
import { scaleDistance, WorldMapper } from "../src/render/scale";
import { sorted } from "../src/sorted";

describe("WorldMapper", () => {
  it.each(["log", "sqrt", "true"] as const)(
    "puts Neptune's orbit at radius ~1 on the %s scale",
    (kind) => {
      const m = new WorldMapper(kind, 1);
      expect(m.radius(30.07)).toBeGreaterThan(0.98);
      expect(m.radius(30.07)).toBeLessThanOrEqual(1);
    },
  );

  it("keeps distances in order on every scale", () => {
    for (const kind of ["log", "sqrt", "true"] as const) {
      const au = [0.39, 0.72, 1, 1.52, 5.2, 9.5, 19.2, 30.1];
      const r = au.map((a) => scaleDistance(kind, a));
      expect(sorted(r, (x, y) => x - y)).toEqual(r);
    }
  });

  it("gives Mercury real room on the log scale", () => {
    expect(new WorldMapper("log", 1).radius(0.387)).toBeGreaterThan(0.18);
    expect(new WorldMapper("true", 1).radius(0.387)).toBeLessThan(0.02);
  });

  it("exaggerates only the height above the ecliptic", () => {
    const flat = new WorldMapper("log", 1).toWorld([1, 0, 0.1]);
    const tall = new WorldMapper("log", 4).toWorld([1, 0, 0.1]);
    expect(tall[0]).toBeCloseTo(flat[0]);
    expect(tall[2]).toBeCloseTo(flat[2] * 4);
  });

  it("zooms the inner view in so Mars' orbit fits", () => {
    const m = new WorldMapper("log", 1);
    expect(m.radius(1.67) * m.innerZoom()).toBeCloseTo(0.95);
  });
});

describe("Projector", () => {
  const size = 500;

  it("looks straight down at elevation 90°: +y is up on screen", () => {
    const p = new Projector({ az: 0, el: Math.PI / 2, zoom: 1 }, size);
    const [x, y] = p.project([0, 1, 0], [0, 0, 0, 1]);
    expect(x).toBeCloseTo(size / 2);
    expect(y).toBeCloseTo(size / 2 - size * FIT);
  });

  it("puts the near side of the plane lower on screen and closer", () => {
    const p = new Projector({ az: 0, el: 0.4, zoom: 1 }, size);
    const near = p.project([0, -1, 0], [0, 0, 0, 1]);
    const far = p.project([0, 1, 0], [0, 0, 0, 1]);
    expect(near[1]).toBeGreaterThan(far[1]);
    expect(near[2]).toBeLessThan(far[2]);
    expect(near[3]).toBeGreaterThan(far[3]);
  });

  it("clamps elevation and zoom", () => {
    expect(clampElevation(-1)).toBe(0);
    expect(clampElevation(3)).toBe(Math.PI / 2);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(1e6)).toBe(ZOOM_MAX);
  });
});

describe("fitSquare", () => {
  it("uses the smaller side, and the width when the height is unknown", () => {
    expect(fitSquare(400, 300)).toBe(300);
    expect(fitSquare(400, 0)).toBe(400);
    expect(fitSquare(0, 0)).toBe(0);
  });
});

describe("decor geometry", () => {
  const len = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);

  it("builds the Sun as a once-subdivided icosahedron on the unit sphere", () => {
    const { vertices, edges } = makeGeodesic();
    expect(vertices).toHaveLength(42);
    expect(edges).toHaveLength(120);
    for (const v of vertices) expect(len(v)).toBeCloseTo(1, 12);
    const lengths = edges.map(([a, b]) => {
      const p = vertices[a]!;
      const q = vertices[b]!;
      return len([p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
    });
    // Geodesic edges come in two lengths, within 14 % of each other.
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.14);
  });

  it("lays a ring of unit points square to its normal", () => {
    const raw = [0.3, -0.4, 0.866];
    const n = len(raw);
    const tilted: [number, number, number] = [raw[0]! / n, raw[1]! / n, raw[2]! / n];
    // One normal on each side of ringPoints' |z| < 0.9 switch: the ecliptic
    // pole (Earth's Moon) and a tilted one, like Saturn's.
    const cases: Array<[[number, number, number], number]> = [
      [[0, 0, 1], 40],
      [tilted, 48],
    ];
    for (const [normal, count] of cases) {
      const pts = ringPoints(normal, count);
      expect(pts).toHaveLength(count);
      for (const p of pts) {
        expect(len(p)).toBeCloseTo(1, 12);
        expect(p[0] * normal[0] + p[1] * normal[1] + p[2] * normal[2]).toBeCloseTo(0, 12);
      }
    }
  });
});
