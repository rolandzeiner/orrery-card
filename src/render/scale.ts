import { MARS_APHELION_AU, OUTER_EDGE_AU } from "../astro/bodies";
import type { Vec3 } from "../astro/ephemeris";
import type { DistanceScale } from "../types";

/** Radial compression. `log` keeps Mercury at a fifth of Neptune's radius,
 *  so every orbit gets room; `true` is linear. */
export function scaleDistance(kind: DistanceScale, au: number): number {
  if (kind === "log") return Math.log1p(au / 0.25);
  if (kind === "sqrt") return Math.sqrt(au);
  return au;
}

/** Maps ecliptic AU positions into world units, where Neptune's orbit has
 *  radius 1. The radius is compressed as a whole vector, so an orbit's tilt
 *  angle survives the compression; `tilt` then stretches only z. */
export class WorldMapper {
  readonly norm: number;

  constructor(
    readonly kind: DistanceScale,
    readonly tilt: number,
  ) {
    this.norm = 1 / scaleDistance(kind, OUTER_EDGE_AU);
  }

  /** Scaled radius of a distance in AU, in world units. */
  radius(au: number): number {
    return scaleDistance(this.kind, au) * this.norm;
  }

  toWorld(v: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    const r = Math.hypot(v[0], v[1], v[2]) || 1e-9;
    const s = this.radius(r) / r;
    out[0] = v[0] * s;
    out[1] = v[1] * s;
    out[2] = v[2] * s * this.tilt;
    return out;
  }

  /** Zoom that fits Mars' orbit, for the "inner planets" view. */
  innerZoom(): number {
    return 0.95 / this.radius(MARS_APHELION_AU);
  }
}
