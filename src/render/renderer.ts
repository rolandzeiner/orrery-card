// Canvas renderer. Hot loops index typed arrays and fixed-length tables
// whose bounds are the loop bounds, so `!` on those reads is safe.
import { Body } from "astronomy-engine";

import { MERCURY_PERIHELION_AU, PLANETS, type PlanetDef, type PlanetKey } from "../astro/bodies";
import {
  OrbitCache,
  ORBIT_SAMPLES,
  orbitIndex,
  SATURN_POLE,
  skySnapshot,
  type SkySnapshot,
  type Vec3,
} from "../astro/ephemeris";
import { DAY_MS } from "../const";
import type { DistanceScale } from "../types";
import { Projector, type Camera } from "./camera";
import { asteroidPosition, makeBelt, makeGeodesic, makeStars, ringPoints } from "./decor";
import { LabelPlacer, type LabelItem, type Rect } from "./labels";
import type { Palette } from "./palette";
import { WorldMapper } from "./scale";

type Screen = [number, number, number, number];

export interface RenderOptions {
  scale: DistanceScale;
  tilt: number;
  showDate: boolean;
  showReadouts: boolean;
  showLabels: boolean;
  showTicks: boolean;
  showTrails: boolean;
  showBelt: boolean;
  showMoon: boolean;
  /** Spin the Sun with the frame clock. */
  ambient: boolean;
}

/** The date engraved in the lower band, already localised by the card. */
export interface DateLine {
  big: string;
  sub: string;
  tag: string;
  tagIsLive: boolean;
  /** Displayed year × 12 + month (0-based), for lighting the month tick. */
  monthKey: number;
  year: number;
}

export interface GaugeReading {
  label: string;
  value: string;
  detail: string;
  /** Fill of the arc, 0–1. */
  fraction: number;
  tone: "accent" | "accent2";
}

export interface Texts {
  monthLabel(month: number): string;
  planetLabel(key: PlanetKey): string;
  /** Top-left, top-right, bottom-right, bottom-left. */
  gauges(sky: SkySnapshot): ReadonlyArray<GaugeReading>;
}

export interface Frame {
  t: number;
  /** requestAnimationFrame timestamp — drives the Sun's spin only. */
  ts: number;
  cam: Camera;
  selected: PlanetKey | null;
  date: DateLine;
}

const J2000 = Date.UTC(2000, 0, 1, 12);
const STARS = makeStars(280);
const BELT = makeBelt(760);
const SUN = makeGeodesic();
const SATURN_RING = ringPoints(SATURN_POLE, 48);
const MOON_RING = ringPoints([0, 0, 1], 40);
const BODIES = PLANETS.map((p) => p.body);
/** Trail length as a share of the orbit. */
const TRAIL = 0.08;
/** Below this card size the corner readouts no longer fit. */
const MIN_SIZE_FOR_GAUGES = 280;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export class OrreryRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private size = 0;
  private dpr = 1;
  private palette: Palette | null = null;
  private opts: RenderOptions = {
    scale: "log",
    tilt: 1,
    showDate: true,
    showReadouts: true,
    showLabels: true,
    showTicks: true,
    showTrails: true,
    showBelt: true,
    showMoon: true,
    ambient: false,
  };
  private mapper = new WorldMapper("log", 1);
  private readonly cache = new OrbitCache();
  private readonly labels = new LabelPlacer();
  private readonly orbitScreens = new Map<PlanetKey, Float32Array>();
  private readonly screen = new Map<PlanetKey, Screen>();
  private sky: SkySnapshot | null = null;
  private sky0: CanvasGradient | null = null;
  private dotRadius = new Map<PlanetKey, number>();
  // Scratch buffers, reused every frame.
  private readonly w: Vec3 = [0, 0, 0];
  private readonly w2: Vec3 = [0, 0, 0];
  private readonly p: Screen = [0, 0, 0, 1];
  private readonly p2: Screen = [0, 0, 0, 1];
  private readonly r: Vec3 = [0, 0, 0];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private texts: Texts,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
    this.ctx = ctx;
  }

  get cssSize(): number {
    return this.size;
  }

  resize(size: number, devicePixelRatio: number): void {
    // Cap the backing store: a 1200 px card at DPR 2 is 5.8 MP per frame.
    const dpr = Math.min(devicePixelRatio || 1, 2, 1800 / Math.max(size, 1));
    this.size = size;
    this.dpr = dpr;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.sky0 = null;
    this.labels.reset();
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
    this.sky0 = null;
  }

  /** Swap the localised strings when the user's language or clock changes. */
  setTexts(texts: Texts): void {
    this.texts = texts;
    this.labels.reset();
  }

  setOptions(opts: RenderOptions): void {
    this.opts = opts;
    if (opts.scale !== this.mapper.kind || opts.tilt !== this.mapper.tilt) {
      this.mapper = new WorldMapper(opts.scale, opts.tilt);
    }
  }

  innerZoom(): number {
    return this.mapper.innerZoom();
  }

  /** Nearest planet within reach of a tap, or null. */
  pick(x: number, y: number): PlanetKey | null {
    let best: PlanetKey | null = null;
    let bestD = 22;
    for (const [key, s] of this.screen) {
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bestD) {
        bestD = d;
        best = key;
      }
    }
    return best;
  }

  draw(frame: Frame): void {
    const pal = this.palette;
    const S = this.size;
    if (!pal || S <= 0) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (!this.sky || this.sky.t !== frame.t) this.sky = skySnapshot(frame.t, BODIES);
    const sky = this.sky;
    const proj = new Projector(frame.cam, S);

    this.drawBackground(proj, pal);
    if (this.opts.showDate) this.drawDate(frame.date, pal);
    this.drawOrbits(proj, frame, pal);
    if (this.opts.showBelt) this.drawBelt(proj, frame.t, pal);
    this.drawSun(proj, frame.ts, pal);

    this.screen.clear();
    for (const p of PLANETS) {
      const pos = sky.pos.get(p.body);
      if (!pos) continue;
      this.screen.set(p.key, proj.project(this.mapper.toWorld(pos, this.w), [0, 0, 0, 1]));
    }
    if (this.opts.showTrails) this.drawTrails(frame, pal);
    this.drawSightLine(frame.selected, pal);
    this.drawPlanets(proj, sky, frame.selected, pal);
    if (this.opts.showLabels) this.drawPlanetLabels(proj, frame.selected, pal);
    if (this.opts.showReadouts && S >= MIN_SIZE_FOR_GAUGES) this.drawGauges(sky, pal);
  }

  // ── Layers ─────────────────────────────────────────────────────────────

  private depthAlpha(d: number, lo: number, hi: number, zoom: number): number {
    const n = Math.max(-1, Math.min(1, d * Math.min(zoom, 3)));
    return lo + ((hi - lo) * (1 - n)) / 2;
  }

  private font(weight: number, px: number): string {
    return `${weight} ${px}px ${this.palette?.font ?? "sans-serif"}`;
  }

  private spacing(value: string): void {
    // letterSpacing on canvas is Chrome 99+ / Safari 17+; elsewhere it's a
    // no-op property and the labels just render without tracking.
    if ("letterSpacing" in this.ctx) this.ctx.letterSpacing = value;
  }

  private drawBackground(proj: Projector, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    ctx.clearRect(0, 0, S, S);
    if (pal.skyInner && pal.skyOuter) {
      if (!this.sky0) {
        const g = ctx.createRadialGradient(proj.cx, proj.cy * 0.96, 0, proj.cx, proj.cy, S * 0.75);
        g.addColorStop(0, pal.skyInner);
        g.addColorStop(1, pal.skyOuter);
        this.sky0 = g;
      }
      ctx.fillStyle = this.sky0;
      ctx.fillRect(0, 0, S, S);
    }
    if (!pal.star) return;
    ctx.fillStyle = pal.star;
    const R = S * 0.74;
    const o = this.r;
    for (const star of STARS) {
      proj.rotate(star.dir[0], star.dir[1], star.dir[2], o);
      if (o[2] < 0) continue; // on the near side of the celestial sphere
      const x = proj.cx + o[0] * R;
      const y = proj.cy + o[1] * R;
      if (x < 0 || y < 0 || x > S || y > S) continue;
      ctx.globalAlpha = star.alpha * (0.4 + 0.6 * o[2]);
      ctx.fillRect(x, y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawDate(date: DateLine, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const cx = S / 2;
    const y = S / 2 + S * 0.335;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = this.font(300, Math.round(S * 0.078));
    this.spacing("0.02em");
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.92;
    ctx.fillText(date.big, cx, y);
    ctx.globalAlpha = 1;

    ctx.font = this.font(500, Math.max(10, Math.round(S * 0.022)));
    this.spacing("0.18em");
    const tag = date.tag ? `  ·  ${date.tag}` : "";
    const w1 = ctx.measureText(date.sub).width;
    const w2 = tag ? ctx.measureText(tag).width : 0;
    const x0 = cx - (w1 + w2) / 2;
    const y2 = y + S * 0.045;
    ctx.textAlign = "left";
    ctx.fillStyle = pal.label;
    ctx.fillText(date.sub, x0, y2);
    if (tag) {
      ctx.fillStyle = date.tagIsLive ? pal.accent : pal.accent2;
      ctx.fillText(tag, x0 + w1, y2);
    }
    this.spacing("0px");
  }

  private drawOrbits(proj: Projector, frame: Frame, pal: Palette): void {
    const ctx = this.ctx;
    const CH = 8;
    const zoom = frame.cam.zoom;
    for (const p of PLANETS) {
      const orbit = this.cache.orbit(p, frame.t);
      const n = orbit.pts.length;
      let scr = this.orbitScreens.get(p.key);
      if (!scr || scr.length !== n * 3) {
        scr = new Float32Array(n * 3);
        this.orbitScreens.set(p.key, scr);
      }
      for (let i = 0; i < n; i++) {
        proj.project(this.mapper.toWorld(orbit.pts[i]!, this.w), this.p);
        scr[i * 3] = this.p[0];
        scr[i * 3 + 1] = this.p[1];
        scr[i * 3 + 2] = this.p[2];
      }
      const sel = frame.selected === p.key;
      ctx.lineWidth = sel ? 1.4 : 1;
      ctx.strokeStyle = sel ? pal.accent2 : pal.orbit;
      for (let c = 0; c < n; c += CH) {
        ctx.beginPath();
        ctx.moveTo(scr[c * 3]!, scr[c * 3 + 1]!);
        let depth = 0;
        for (let j = 1; j <= CH; j++) {
          const i = (c + j) % n;
          ctx.lineTo(scr[i * 3]!, scr[i * 3 + 1]!);
          depth += scr[i * 3 + 2]!;
        }
        const a = this.depthAlpha(depth / CH, 0.16, 0.5, zoom);
        ctx.globalAlpha = sel ? Math.min(1, a + 0.3) : a;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (this.opts.showTicks) this.drawTicks(p, proj, frame, sel, pal);
    }
  }

  private drawTicks(p: PlanetDef, proj: Projector, frame: Frame, sel: boolean, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const fs = Math.max(8.5, Math.min(12, S * 0.0175));
    const step = 0.012; // radians — a short hop along the orbit, for the tangent
    const cs = Math.cos(step);
    const sn = Math.sin(step);
    // Zoomed in, the outer orbits run past the readout ring and their year
    // labels would crowd the date band. Keep their ticks, drop the labels.
    const labelled = this.mapper.radius(p.au) * proj.scalePx < S * 0.47;
    for (const tick of this.cache.tickList(p, frame.t)) {
      const q = tick.pos;
      proj.project(this.mapper.toWorld(q, this.w), this.p);
      this.w2[0] = q[0] * cs - q[1] * sn;
      this.w2[1] = q[0] * sn + q[1] * cs;
      this.w2[2] = q[2];
      proj.project(this.mapper.toWorld(this.w2, this.w2), this.p2);
      let tx = this.p2[0] - this.p[0];
      let ty = this.p2[1] - this.p[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      let nx = -ty;
      let ny = tx;
      if (nx * (this.p[0] - proj.cx) + ny * (this.p[1] - proj.cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const len = tick.major ? 7 : 3.5;
      ctx.strokeStyle = sel ? pal.accent2 : pal.orbit;
      ctx.globalAlpha = this.depthAlpha(this.p[2], 0.28, 0.75, frame.cam.zoom);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.p[0] - nx * len * 0.5, this.p[1] - ny * len * 0.5);
      ctx.lineTo(this.p[0] + nx * len * 0.5, this.p[1] + ny * len * 0.5);
      ctx.stroke();

      const label = tick.label;
      if (!label || !labelled) continue;
      const off = (len * 0.5 + fs * 0.85) * p.labelSide;
      const lx = this.p[0] + nx * off;
      const ly = this.p[1] + ny * off;
      if (lx < -20 || ly < -20 || lx > S + 20 || ly > S + 20) continue;
      const current =
        label.kind === "month"
          ? label.year * 12 + label.month === frame.date.monthKey
          : frame.date.year >= label.year && frame.date.year < label.year + label.span;
      const text = label.kind === "month" ? this.texts.monthLabel(label.month) : String(label.year);
      let ang = Math.atan2(ty, tx);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(ang);
      ctx.font = this.font(current ? 600 : 400, fs);
      this.spacing("0.08em");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (current) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal.accent;
        ctx.shadowColor = pal.accent;
        ctx.shadowBlur = 8;
      } else {
        ctx.globalAlpha = this.depthAlpha(this.p[2], 0.45, 0.95, frame.cam.zoom);
        ctx.fillStyle = pal.label;
      }
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.spacing("0px");
  }

  private drawBelt(proj: Projector, t: number, pal: Palette): void {
    const ctx = this.ctx;
    const days = (t - J2000) / DAY_MS;
    const sz = Math.max(1, this.size / 520);
    const v: Vec3 = this.w2;
    ctx.fillStyle = pal.orbit;
    for (const ast of BELT) {
      asteroidPosition(ast, days, v);
      proj.project(this.mapper.toWorld(v, this.w), this.p);
      ctx.globalAlpha = this.depthAlpha(this.p[2], 0.14, 0.42, 1);
      ctx.fillRect(this.p[0], this.p[1], sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  private sunRadius(proj: Projector): number {
    const merc = this.mapper.radius(MERCURY_PERIHELION_AU) * proj.scalePx;
    return Math.max(2.5, Math.min(0.45 * merc, this.size * 0.075));
  }

  private drawSun(proj: Projector, ts: number, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const { cx, cy } = proj;
    const R = this.sunRadius(proj);

    const hazeR = Math.min(S * 0.34, Math.max(R * 9, 40));
    const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, hazeR);
    haze.addColorStop(0, pal.accent2);
    haze.addColorStop(1, pal.accent2Clear);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = haze;
    ctx.fillRect(cx - hazeR, cy - hazeR, hazeR * 2, hazeR * 2);
    ctx.globalAlpha = 1;

    const spin = this.opts.ambient ? ts * 0.00011 : 0.4;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    const pts = SUN.vertices.map((v) => {
      const o: Vec3 = [0, 0, 0];
      proj.rotate(v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs, v[2], o);
      return [cx + o[0] * R, cy + o[1] * R, o[2]] as const;
    });
    ctx.lineWidth = R > 20 ? 0.9 : 0.7;
    ctx.strokeStyle = pal.accent2;
    for (const front of [false, true]) {
      ctx.beginPath();
      for (const [a, b] of SUN.edges) {
        const pa = pts[a]!;
        const pb = pts[b]!;
        if (pa[2] + pb[2] < 0 !== front) continue;
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
      }
      ctx.globalAlpha = front ? 0.8 : 0.22;
      ctx.stroke();
    }
    if (R > 12) {
      ctx.fillStyle = pal.accent2;
      ctx.globalAlpha = 0.9;
      for (const p of pts) if (p[2] < 0) ctx.fillRect(p[0] - 0.8, p[1] - 0.8, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  private drawTrails(frame: Frame, pal: Palette): void {
    const ctx = this.ctx;
    const m = Math.round(ORBIT_SAMPLES * TRAIL);
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    for (const p of PLANETS) {
      const scr = this.orbitScreens.get(p.key);
      const here = this.screen.get(p.key);
      if (!scr || !here) continue;
      const orbit = this.cache.orbit(p, frame.t);
      const n = scr.length / 3;
      const idx = Math.floor(orbitIndex(orbit, p, frame.t));
      ctx.strokeStyle = frame.selected === p.key ? pal.accent2 : pal.accent;
      let px = NaN;
      let py = NaN;
      for (let j = m; j >= 0; j--) {
        const i = (((idx - j) % n) + n) % n;
        const x = j === 0 ? here[0] : scr[i * 3]!;
        const y = j === 0 ? here[1] : scr[i * 3 + 1]!;
        if (!Number.isNaN(px)) {
          ctx.globalAlpha = 0.85 * (1 - j / m);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        px = x;
        py = y;
      }
    }
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
  }

  private drawSightLine(selected: PlanetKey | null, pal: Palette): void {
    if (!selected || selected === "earth") return;
    const a = this.screen.get("earth");
    const b = this.screen.get(selected);
    if (!a || !b) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = pal.accent2;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.restore();
  }

  private drawPlanets(proj: Projector, sky: SkySnapshot, selected: PlanetKey | null, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const sizeScale = Math.max(0.75, Math.min(1.35, S / 520));
    const order = PLANETS.slice().sort(
      (a, b) => (this.screen.get(b.key)?.[2] ?? 0) - (this.screen.get(a.key)?.[2] ?? 0),
    );
    this.dotRadius.clear();
    for (const p of order) {
      const s = this.screen.get(p.key);
      if (!s) continue;
      const [x, y, , k] = s;
      if (x < -30 || y < -30 || x > S + 30 || y > S + 30) continue;
      const r = p.size * sizeScale * (0.8 + 0.2 * k);
      this.dotRadius.set(p.key, r);
      const col = selected === p.key ? pal.accent2 : pal.accent;
      const clear = selected === p.key ? pal.accent2Clear : pal.accentClear;

      if (p.body === Body.Saturn) this.drawRing(proj, x, y, r, true, col);

      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4.5);
      glow.addColorStop(0, col);
      glow.addColorStop(1, clear);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = p.key === "earth" && selected !== "earth" ? pal.earthCore : col;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (p.key === "earth") {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (p.body === Body.Saturn) this.drawRing(proj, x, y, r, false, col);
    }
    const earth = this.screen.get("earth");
    if (this.opts.showMoon && earth) this.drawMoon(proj, sky, earth, sizeScale, pal);
  }

  private drawRing(proj: Projector, x: number, y: number, r: number, back: boolean, col: string): void {
    const ctx = this.ctx;
    const o = this.r;
    const R = r * 2.1;
    ctx.strokeStyle = col;
    ctx.globalAlpha = back ? 0.35 : 0.85;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= SATURN_RING.length; i++) {
      const q = SATURN_RING[i % SATURN_RING.length]!;
      proj.rotate(q[0], q[1], q[2], o);
      if (o[2] > 0 === back) {
        const px = x + o[0] * R;
        const py = y + o[1] * R;
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
      } else {
        pen = false;
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawMoon(proj: Projector, sky: SkySnapshot, earth: Screen, sizeScale: number, pal: Palette): void {
    const ctx = this.ctx;
    const R = 15 * sizeScale;
    const o = this.r;
    ctx.strokeStyle = pal.orbit;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    MOON_RING.forEach((q, i) => {
      proj.rotate(q[0], q[1], q[2], o);
      const px = earth[0] + o[0] * R;
      const py = earth[1] + o[1] * R;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
    const m = sky.moonDir;
    proj.rotate(m[0], m[1], m[2], o);
    ctx.fillStyle = pal.moon;
    ctx.beginPath();
    ctx.arc(earth[0] + o[0] * R, earth[1] + o[1] * R, 1.8 * sizeScale, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlanetLabels(proj: Projector, selected: PlanetKey | null, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const fs = Math.max(9, Math.min(12.5, S * 0.019));
    ctx.font = this.font(500, fs);
    this.spacing("0.12em");

    const sunR = this.sunRadius(proj);
    const obstacles: Rect[] = [{ x: proj.cx - sunR, y: proj.cy - sunR, w: sunR * 2, h: sunR * 2 }];
    for (const [key, r] of this.dotRadius) {
      const s = this.screen.get(key);
      if (s) obstacles.push({ x: s[0] - r - 2, y: s[1] - r - 2, w: r * 2 + 4, h: r * 2 + 4 });
    }
    // Stable priority: the selected planet, then Earth, then Sun-outwards.
    // Never depth order — it flips as planets pass each other.
    const keys = PLANETS.map((p) => p.key).sort((a, b) => rank(a) - rank(b));
    function rank(k: PlanetKey): number {
      if (k === selected) return -2;
      if (k === "earth") return -1;
      return PLANETS.findIndex((p) => p.key === k);
    }
    const items: LabelItem[] = [];
    const text = new Map<PlanetKey, string>();
    for (const key of keys) {
      const s = this.screen.get(key);
      const r = this.dotRadius.get(key);
      if (!s || r === undefined) continue;
      const label = this.texts.planetLabel(key);
      text.set(key, label);
      items.push({ id: key, x: s[0], y: s[1], r, w: ctx.measureText(label).width + 2, h: fs * 1.15 });
    }
    const placed = this.labels.place(items, obstacles);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const item of items) {
      const rect = placed.get(item.id);
      const key = item.id as PlanetKey;
      const s = this.screen.get(key);
      if (!rect || !s) continue;
      const sel = key === selected;
      ctx.font = this.font(sel ? 600 : 500, fs);
      ctx.fillStyle = sel ? pal.accent2 : pal.ink;
      ctx.globalAlpha = sel ? 1 : this.depthAlpha(s[2], 0.55, 0.92, 1);
      ctx.fillText(text.get(key) ?? "", rect.x + 1, rect.y + rect.h / 2);
    }
    ctx.globalAlpha = 1;
    this.spacing("0px");
  }

  private drawGauges(sky: SkySnapshot, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const cx = S / 2;
    const cy = S / 2;
    const Rg = S * 0.462;
    const span = (44 * Math.PI) / 180;
    const lf = Math.max(8.5, S * 0.017);
    const vf = Math.max(13, S * 0.038);
    const sf = Math.max(8.5, S * 0.016);
    // Diagonals, clockwise from top-left. Each arc fills outwards from the
    // end nearest the vertical axis, so the four read as a symmetric set.
    const slots = [
      { deg: -135, dir: -1 },
      { deg: -45, dir: 1 },
      { deg: 45, dir: -1 },
      { deg: 135, dir: 1 },
    ] as const;
    const readings = this.texts.gauges(sky);
    slots.forEach((slot, i) => {
      const g = readings[i];
      if (!g) return;
      const c = (slot.deg * Math.PI) / 180;
      const a0 = c - span / 2;
      const a1 = c + span / 2;
      const col = g.tone === "accent" ? pal.accent : pal.accent2;
      ctx.lineCap = "round";
      ctx.strokeStyle = pal.orbit;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, Rg, a0, a1);
      ctx.stroke();

      const frac = Math.max(0.02, clamp01(g.fraction));
      const start = slot.dir === 1 ? a0 : a1;
      const end = start + slot.dir * span * frac;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, Rg, Math.min(start, end), Math.max(start, end));
      ctx.stroke();
      ctx.restore();
      ctx.lineCap = "butt";

      const lr = Rg + S * 0.1;
      const lx = cx + Math.cos(c) * lr;
      const ly = cy + Math.sin(c) * lr;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
      ctx.font = this.font(500, lf);
      this.spacing("0.14em");
      ctx.fillStyle = pal.label;
      ctx.fillText(g.label, lx, ly - vf * 0.62);
      this.spacing("0px");
      ctx.font = this.font(500, vf);
      ctx.fillStyle = col;
      ctx.fillText(g.value, lx, ly + vf * 0.36);
      ctx.font = this.font(400, sf);
      ctx.fillStyle = pal.label;
      ctx.fillText(g.detail, lx, ly + vf * 0.36 + sf * 1.5);
    });
    ctx.globalAlpha = 1;
  }
}
