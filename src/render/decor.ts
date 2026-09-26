import type { Vec3 } from "../astro/ephemeris";

/** Deterministic PRNG (LCG), so the star field and belt look the same on
 *  every load and every card instance. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export interface Star {
  dir: Vec3;
  alpha: number;
  size: number;
}

export function makeStars(count: number, seed = 7): Star[] {
  const rnd = seeded(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    stars.push({
      dir: [r * Math.cos(th), r * Math.sin(th), u],
      alpha: 0.12 + rnd() * 0.45,
      size: 0.6 + rnd() * 0.9,
    });
  }
  return stars;
}

export interface Asteroid {
  /** Semi-major axis, AU. */
  a: number;
  inc: number;
  node: number;
  /** Mean anomaly at J2000, radians. */
  m0: number;
  /** Mean motion, radians per day. */
  n: number;
}

/** Kirkwood gaps — orbits in 3:1, 5:2, 7:3 and 2:1 resonance with Jupiter,
 *  which Jupiter has cleared. The belt leaves them open. */
export const KIRKWOOD_GAPS_AU: ReadonlyArray<number> = [2.5, 2.82, 2.95, 3.27];

export function makeBelt(count: number, seed = 11): Asteroid[] {
  const rnd = seeded(seed);
  const belt: Asteroid[] = [];
  while (belt.length < count) {
    const a = 2.1 + rnd() * 1.25;
    if (KIRKWOOD_GAPS_AU.some((g) => Math.abs(a - g) < 0.03)) continue;
    belt.push({
      a,
      inc: rnd() * rnd() * ((18 * Math.PI) / 180),
      node: rnd() * Math.PI * 2,
      m0: rnd() * Math.PI * 2,
      n: (2 * Math.PI) / (Math.pow(a, 1.5) * 365.25),
    });
  }
  return belt;
}

/** Position of an asteroid on a circular, inclined orbit. */
export function asteroidPosition(ast: Asteroid, daysSinceJ2000: number, out: Vec3): Vec3 {
  const m = ast.m0 + ast.n * daysSinceJ2000;
  const x = ast.a * Math.cos(m);
  const y0 = ast.a * Math.sin(m);
  const z = y0 * Math.sin(ast.inc);
  const y = y0 * Math.cos(ast.inc);
  out[0] = x * Math.cos(ast.node) - y * Math.sin(ast.node);
  out[1] = x * Math.sin(ast.node) + y * Math.cos(ast.node);
  out[2] = z;
  return out;
}

export interface Wireframe {
  vertices: ReadonlyArray<Vec3>;
  edges: ReadonlyArray<readonly [number, number]>;
}

/** Geodesic sphere for the Sun: an icosahedron subdivided once
 *  (42 vertices, 120 edges). */
export function makeGeodesic(): Wireframe {
  const g = (1 + Math.sqrt(5)) / 2;
  const norm = (p: Vec3): Vec3 => {
    const l = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / l, p[1] / l, p[2] / l];
  };
  const v: Vec3[] = (
    [
      [-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0],
      [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g],
      [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1],
    ] as Vec3[]
  ).map(norm);
  const faces: ReadonlyArray<readonly [number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const mids = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const hit = mids.get(key);
    if (hit !== undefined) return hit;
    const pa = v[a]!;
    const pb = v[b]!;
    v.push(norm([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]));
    mids.set(key, v.length - 1);
    return v.length - 1;
  };
  const edges = new Map<string, readonly [number, number]>();
  const edge = (a: number, b: number): void => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edges.has(key)) edges.set(key, a < b ? [a, b] : [b, a]);
  };
  for (const [a, b, c] of faces) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    for (const [p, q, r] of [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]] as const) {
      edge(p, q);
      edge(q, r);
      edge(r, p);
    }
  }
  return { vertices: v, edges: [...edges.values()] };
}

/** Unit circle in the plane perpendicular to `normal`, as `n` points. */
export function ringPoints(normal: Vec3, n: number): Vec3[] {
  let u: Vec3 = [normal[1], -normal[0], 0];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const w: Vec3 = [
    normal[1] * u[2] - normal[2] * u[1],
    normal[2] * u[0] - normal[0] * u[2],
    normal[0] * u[1] - normal[1] * u[0],
  ];
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s]);
  }
  return pts;
}
