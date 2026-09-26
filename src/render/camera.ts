import type { Vec3 } from "../astro/ephemeris";

export interface Camera {
  /** Rotation about the ecliptic pole, radians. */
  az: number;
  /** Elevation above the ecliptic plane, radians: 0 edge-on, π/2 from above. */
  el: number;
  /** Scale factor on top of the fit-to-card size. */
  zoom: number;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 40;
export const DEFAULT_ELEVATION = (26 * Math.PI) / 180;

/** Presets the view button cycles through — the single-pointer alternative
 *  to dragging (WCAG 2.5.7). */
export const VIEW_PRESETS: ReadonlyArray<number> = [
  DEFAULT_ELEVATION,
  Math.PI / 2,
  (4 * Math.PI) / 180,
];

export const clampElevation = (el: number): number => Math.max(0, Math.min(Math.PI / 2, el));
export const clampZoom = (z: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/** Camera distance in world units (Neptune's orbit has radius 1). Large
 *  enough that perspective stays a hint rather than a distortion. */
const CAM_DIST = 6;

/** Share of the card's side that Neptune's orbit spans at zoom 1, per side. */
export const FIT = 0.43;

/** Projects world coordinates to card pixels for one frame. Construct once
 *  per frame; the methods write into caller-owned arrays so the hot loops
 *  allocate nothing. */
export class Projector {
  readonly cx: number;
  readonly cy: number;
  readonly scalePx: number;
  private readonly cA: number;
  private readonly sA: number;
  private readonly cE: number;
  private readonly sE: number;
  private readonly tmp: Vec3 = [0, 0, 0];

  constructor(cam: Camera, size: number) {
    this.cx = size / 2;
    this.cy = size / 2;
    this.scalePx = size * FIT * cam.zoom;
    this.cA = Math.cos(cam.az);
    this.sA = Math.sin(cam.az);
    this.cE = Math.cos(cam.el);
    this.sE = Math.sin(cam.el);
  }

  /** Rotation only. Returns screen-space x, y (y grows downwards) and depth
   *  (positive = farther from the viewer). */
  rotate(x: number, y: number, z: number, out: Vec3): Vec3 {
    const x1 = x * this.cA - y * this.sA;
    const y1 = x * this.sA + y * this.cA;
    out[0] = x1;
    out[1] = -(y1 * this.sE + z * this.cE);
    out[2] = y1 * this.cE - z * this.sE;
    return out;
  }

  /** World → pixels. out = [x, y, depth, perspective factor]. */
  project(w: Vec3, out: [number, number, number, number]): [number, number, number, number] {
    const r = this.rotate(w[0], w[1], w[2], this.tmp);
    const k = CAM_DIST / (CAM_DIST + r[2]);
    out[0] = this.cx + r[0] * k * this.scalePx;
    out[1] = this.cy + r[1] * k * this.scalePx;
    out[2] = r[2];
    out[3] = k;
    return out;
  }
}

/** Azimuth that puts a heliocentric longitude at the front (bottom) of the
 *  view, nudged a little to the side so Earth doesn't sit on the axis. */
export function azimuthFacing(longitude: number): number {
  return -Math.PI / 2 - longitude + 0.35;
}

/** Side of the largest square that fits the stage. Falls back to the
 *  width when a host gives no definite height (masonry, vertical-stack,
 *  the editor preview) — ha-lovelace-card, fluid-square gotcha. */
export function fitSquare(w: number, h: number): number {
  const wOk = Number.isFinite(w) && w > 0;
  const hOk = Number.isFinite(h) && h > 0;
  if (wOk && hOk) return Math.min(w, h);
  if (wOk) return w;
  if (hOk) return h;
  return 0;
}
