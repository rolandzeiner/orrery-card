// Canvas renderer. Hot loops index typed arrays and fixed-length tables
// whose bounds are the loop bounds, so `!` on those reads is safe.
import { Body } from "astronomy-engine";

import {
  MERCURY_PERIHELION_AU,
  PLANETS,
  shownBodies,
  type PlanetDef,
  type PlanetKey,
} from "../astro/bodies";
import type { EclipseBody } from "../astro/eclipses";
import {
  JUPITER_MOONS,
  JUPITER_POLE,
  OrbitCache,
  ORBIT_SAMPLES,
  orbitIndex,
  SATURN_POLE,
  skySnapshot,
  type SkySnapshot,
  type TickLabel,
  type Vec3,
} from "../astro/ephemeris";
import type { HomeLocation } from "../astro/home";
import { DAY_MS } from "../const";
import { sorted } from "../sorted";
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
  showPluto: boolean;
  showJupiterMoons: boolean;
  showHome: boolean;
  /** Spin the Sun with the frame clock. */
  ambient: boolean;
}

/** The date engraved in the lower band, already localised by the card. */
export interface DateLine {
  big: string;
  sub: string;
  tag: string;
  /** A shorter tag for when `tag` won't fit between the bottom readouts
   *  ("SOLAR ECLIPSE" for "ANNULAR SOLAR ECLIPSE"). */
  tagShort?: string;
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
  /** Days of sky time per second while playing, 0 when still. Anything
   *  that turns faster than about twice a second would only flicker. */
  rate: number;
  /** The eclipse the card stands on, if any: lights the Sun–Earth line. */
  eclipse: EclipseBody | null;
}

const J2000 = Date.UTC(2000, 0, 1, 12);
const STARS = makeStars(280);
const BELT = makeBelt(760);
const SUN = makeGeodesic();
const SATURN_RING = ringPoints(SATURN_POLE, 48);
const MOON_RING = ringPoints([0, 0, 1], 40);
const JUPITER_RING = ringPoints(JUPITER_POLE, 40);
/** Ring radius of each Galilean moon as a share of Callisto's. The square
 *  root of the real distances, so Io clears Jupiter's dot and Callisto
 *  stays close. */
const CALLISTO_KM = Math.max(...JUPITER_MOONS.map((m) => m.km));
const JUPITER_MOON_RINGS = JUPITER_MOONS.map((m) => Math.sqrt(m.km / CALLISTO_KM));
/** Earth's Moon's ring radius at a 520 px card, px. */
const MOON_RING_PX = 15;
/** Callisto's ring radius at a 520 px card, px. */
const CALLISTO_RING_PX = 19;
/** Home needle length past Earth's ring, side-on, at a 520 px card, px:
 *  its tip lands just outside the Moon's ring. */
const HOME_NEEDLE_PX = 20;
/** Turns per second of playback above which a body is left out. */
const MAX_TURNS_PER_SECOND = 2;
/** Trail length as a share of the orbit. */
const TRAIL = 0.08;
/** Below this card size the corner readouts no longer fit. */
const MIN_SIZE_FOR_GAUGES = 280;
/** Radius of the readouts' arcs, as a share of the card's side. */
const GAUGE_RADIUS = 0.462;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

interface TickGeometry {
  x: number;
  y: number;
  depth: number;
  /** Unit tangent along the orbit, in screen space. */
  tx: number;
  ty: number;
  /** Unit normal pointing away from the Sun. */
  nx: number;
  ny: number;
}

interface DateLayout {
  /** Baselines of the big date and the line under it. */
  y: number;
  y2: number;
  /** Baseline of the tag: its own line when stacked, else y2. */
  y3: number;
  stacked: boolean;
  bigPx: number;
  subPx: number;
  tag: string;
  subW: number;
  /** Stacked only: the tag as set on its own line, fitted to the room. */
  line: { text: string; px: number; track: string };
  box: Rect;
}

interface PlanetLabelItem extends LabelItem {
  text: string;
  depth: number;
}

/** Inside the canvas, with `margin` px of slack on every side. */
function onCanvas(p: readonly number[], size: number, margin: number): boolean {
  const x = p[0] ?? NaN;
  const y = p[1] ?? NaN;
  return x >= -margin && y >= -margin && x <= size + margin && y <= size + margin;
}

/** Is this tick label the month or year currently shown? */
export function isCurrentLabel(
  label: TickLabel,
  date: Pick<DateLine, "monthKey" | "year">,
): boolean {
  if (label.kind === "month") return label.year * 12 + label.month === date.monthKey;
  return date.year >= label.year && date.year < label.year + label.span;
}

/** Text angle along a tangent, flipped so labels never read upside down. */
export function uprightAngle(tx: number, ty: number): number {
  const a = Math.atan2(ty, tx);
  if (a > Math.PI / 2) return a - Math.PI;
  if (a < -Math.PI / 2) return a + Math.PI;
  return a;
}

/** Label priority: the selected planet, then Earth, then outwards from the
 *  Sun. Deliberately not depth order — that flips as planets pass each
 *  other, and the labels would jump with it. */
export function labelPriority(
  selected: PlanetKey | null,
  planets: ReadonlyArray<PlanetDef> = PLANETS,
): PlanetKey[] {
  const keys = planets.map((p) => p.key);
  const rank = (k: PlanetKey): number =>
    k === selected ? -2 : k === "earth" ? -1 : keys.indexOf(k);
  return sorted(keys, (a, b) => rank(a) - rank(b));
}

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
    showPluto: false,
    showJupiterMoons: false,
    showHome: false,
    ambient: false,
  };
  private home: HomeLocation | null = null;
  /** The current frame's playback rate, days per second. */
  private rate = 0;
  private planets: ReadonlyArray<PlanetDef> = PLANETS;
  private mapper = new WorldMapper("log", 1);
  private readonly cache = new OrbitCache();
  private readonly labels = new LabelPlacer();
  private readonly orbitScreens = new Map<PlanetKey, Float32Array>();
  private readonly screen = new Map<PlanetKey, Screen>();
  private sky: SkySnapshot | null = null;
  private sky0: CanvasGradient | null = null;
  private dotRadius = new Map<PlanetKey, number>();
  /** The date's text box this frame, or null when the date is hidden. */
  private dateBox: Rect | null = null;
  /** The home needle's box this frame, kept clear of planet names. */
  private needleBox: Rect | null = null;
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

  get hasPalette(): boolean {
    return this.palette !== null;
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
    if (opts.showPluto !== this.opts.showPluto) {
      this.planets = shownBodies(opts.showPluto);
    }
    // The cached snapshot has nothing for a layer that just appeared.
    if (
      opts.showPluto !== this.opts.showPluto ||
      opts.showJupiterMoons !== this.opts.showJupiterMoons ||
      opts.showHome !== this.opts.showHome
    ) {
      this.sky = null;
    }
    this.opts = opts;
    if (opts.scale !== this.mapper.kind || opts.tilt !== this.mapper.tilt) {
      this.mapper = new WorldMapper(opts.scale, opts.tilt);
    }
  }

  /** The HA home location the home needle points from. */
  setHome(home: HomeLocation | null): void {
    const same =
      home?.latitude === this.home?.latitude &&
      home?.longitude === this.home?.longitude &&
      home?.elevation === this.home?.elevation;
    if (same) return;
    this.home = home;
    this.sky = null;
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

    if (!this.sky || this.sky.t !== frame.t)
      this.sky = skySnapshot(
        frame.t,
        this.planets.map((p) => p.body),
        { home: this.opts.showHome ? this.home : null, jupiterMoons: this.opts.showJupiterMoons },
      );
    const sky = this.sky;
    this.rate = frame.rate;
    const proj = new Projector(frame.cam, S);

    this.drawBackground(proj, pal);
    this.drawOrbits(proj, frame, pal);
    if (this.opts.showBelt) this.drawBelt(proj, frame.t, pal);
    this.drawSun(proj, frame.ts, pal);
    // The date sits above the line-work (on a frosted plate, so it reads
    // even when orbits and tick labels run through it, as they do from
    // above) but below the planets, which stay the brightest thing.
    this.dateBox = this.opts.showDate ? this.drawDate(frame.date, pal) : null;

    this.projectPlanets(proj, sky);
    if (this.opts.showTrails) this.drawTrails(frame, pal);
    if (frame.eclipse) this.drawEclipseLine(proj, frame.eclipse, pal);
    this.drawSightLine(frame.selected, pal);
    this.drawPlanets(proj, sky, frame.selected, pal);
    if (this.opts.showLabels) this.drawPlanetLabels(proj, frame.selected, pal);
    if (this.gaugesShown()) this.drawGauges(sky, pal);
  }

  // ── Layers ─────────────────────────────────────────────────────────────

  private projectPlanets(proj: Projector, sky: SkySnapshot): void {
    this.screen.clear();
    for (const p of this.planets) {
      const pos = sky.pos.get(p.body);
      if (pos) this.screen.set(p.key, proj.project(this.mapper.toWorld(pos, this.w), [0, 0, 0, 1]));
    }
  }

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
    this.ctx.clearRect(0, 0, this.size, this.size);
    if (pal.skyInner && pal.skyOuter) this.fillSky(proj, pal.skyInner, pal.skyOuter);
    if (pal.star) this.drawStars(proj, pal.star);
  }

  private fillSky(proj: Projector, inner: string, outer: string): void {
    const ctx = this.ctx;
    if (!this.sky0) {
      const g = ctx.createRadialGradient(
        proj.cx,
        proj.cy * 0.96,
        0,
        proj.cx,
        proj.cy,
        this.size * 0.75,
      );
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      this.sky0 = g;
    }
    ctx.fillStyle = this.sky0;
    ctx.fillRect(0, 0, this.size, this.size);
  }

  /** Stars on a sphere around the scene, so they turn with the view. Only
   *  the far half is drawn: the near half would sit in front of the planets. */
  private drawStars(proj: Projector, color: string): void {
    const ctx = this.ctx;
    const S = this.size;
    const R = S * 0.74;
    const o = this.r;
    ctx.fillStyle = color;
    for (const star of STARS) {
      proj.rotate(star.dir[0], star.dir[1], star.dir[2], o);
      const x = proj.cx + o[0] * R;
      const y = proj.cy + o[1] * R;
      if (o[2] < 0 || !onCanvas([x, y], S, 0)) continue;
      ctx.globalAlpha = star.alpha * (0.4 + 0.6 * o[2]);
      ctx.fillRect(x, y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  /** Draws the date and returns the box its text covers. */
  private drawDate(date: DateLine, pal: Palette): Rect {
    const layout = this.dateLayout(date);
    this.drawDatePlate(layout, pal);
    this.drawDateText(date, layout, pal);
    return layout.box;
  }

  private dateLayout(date: DateLine): DateLayout {
    const ctx = this.ctx;
    const S = this.size;
    const bigPx = Math.round(S * 0.078);
    const subPx = Math.max(10, Math.round(S * 0.022));
    const y = S / 2 + S * 0.335;
    const y2 = y + S * 0.045;
    const tag = date.tag ? `  ·  ${date.tag}` : "";

    ctx.font = this.font(300, bigPx);
    this.spacing("0.02em");
    const bigW = ctx.measureText(date.big).width;
    ctx.font = this.font(500, subPx);
    this.spacing("0.18em");
    const subW = ctx.measureText(date.sub).width;
    const tagW = tag ? ctx.measureText(tag).width : 0;
    this.spacing("0px");

    // On a narrow card the time plus a long tag ("1 MONTH/S", "IN 75
    // YEARS") would run into the corner readouts; give the tag its own line.
    const stacked = tag !== "" && subW + tagW > S * 0.44;
    const y3 = stacked ? y2 + subPx * 1.45 : y2;
    const line = stacked
      ? this.fitTag(date, subPx, this.tagRoom(y3))
      : { text: date.tag, px: subPx, track: "0.18em", w: 0 };
    const w = Math.max(bigW, stacked ? Math.max(subW, line.w) : subW + tagW);
    const top = y - bigPx * 0.78;
    const bottom = y3 + subPx * 0.35;
    return {
      y,
      y2,
      y3,
      stacked,
      bigPx,
      subPx,
      tag,
      subW,
      line,
      box: { x: S / 2 - w / 2, y: top, w, h: bottom - top },
    };
  }

  /** Width free for a line of text whose baseline is at `y`: between the
   *  arcs of the two bottom readouts when they're drawn, which close in as
   *  the line sits lower. */
  private tagRoom(y: number): number {
    const S = this.size;
    if (!this.gaugesShown()) return S * 0.9;
    const Rg = S * GAUGE_RADIUS;
    // The arcs end 23° short of the vertical; below their ends, their ends
    // set the room.
    const dy = Math.min(y - S / 2, Rg * Math.cos((23 * Math.PI) / 180));
    return 2 * Math.sqrt(Rg * Rg - dy * dy) - 10;
  }

  /** The tag on its own line, as wide as it may be: tracked as usual,
   *  then tighter, then the short form the same two ways, and only past
   *  all four set smaller. */
  private fitTag(
    date: DateLine,
    px: number,
    room: number,
  ): { text: string; px: number; track: string; w: number } {
    const ctx = this.ctx;
    ctx.font = this.font(500, px);
    const texts = date.tagShort ? [date.tag, date.tagShort] : [date.tag];
    let last = { text: date.tag, px, track: "0.18em", w: 0 };
    for (const text of texts)
      for (const track of ["0.18em", "0.06em"]) {
        this.spacing(track);
        last = { text, px, track, w: ctx.measureText(text).width };
        if (last.w <= room) {
          this.spacing("0px");
          return last;
        }
      }
    this.spacing("0px");
    const scale = Math.max(8 / px, room / last.w);
    return { ...last, px: px * scale, w: last.w * scale };
  }

  private gaugesShown(): boolean {
    return this.opts.showReadouts && this.size >= MIN_SIZE_FOR_GAUGES;
  }

  /** A soft oval behind the date: the line-work under it is blurred, then
   *  covered by a wash of the sky colour that fades to nothing at the rim,
   *  so there is no visible edge. */
  private drawDatePlate(layout: DateLayout, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const { box } = layout;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rx = box.w / 2 + S * 0.07;
    const ry = box.h / 2 + S * 0.04;

    // Blur first, clipped well inside the fade so its edge stays hidden
    // under the plate. ctx.filter is Chromium, Firefox and Safari 18+;
    // elsewhere the copy is skipped and the plate alone does the work.
    if ("filter" in ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.filter = `blur(${Math.max(2, S * 0.006)}px)`;
      const d = this.dpr;
      ctx.drawImage(
        this.canvas,
        (cx - rx) * d,
        (cy - ry) * d,
        rx * 2 * d,
        ry * 2 * d,
        cx - rx,
        cy - ry,
        rx * 2,
        ry * 2,
      );
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    wash.addColorStop(0, pal.plate);
    wash.addColorStop(0.6, pal.plate);
    wash.addColorStop(1, pal.plateClear);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawDateText(date: DateLine, layout: DateLayout, pal: Palette): void {
    const ctx = this.ctx;
    const cx = this.size / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = this.font(300, layout.bigPx);
    this.spacing("0.02em");
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.95;
    ctx.fillText(date.big, cx, layout.y);
    ctx.globalAlpha = 1;

    ctx.font = this.font(500, layout.subPx);
    this.spacing("0.18em");
    const tagColor = date.tagIsLive ? pal.accent : pal.accent2;
    if (layout.stacked) {
      ctx.fillStyle = pal.label;
      ctx.fillText(date.sub, cx, layout.y2);
      ctx.font = this.font(500, layout.line.px);
      this.spacing(layout.line.track);
      ctx.fillStyle = tagColor;
      ctx.fillText(layout.line.text, cx, layout.y3);
    } else {
      const tagW = layout.tag ? ctx.measureText(layout.tag).width : 0;
      const x0 = cx - (layout.subW + tagW) / 2;
      ctx.textAlign = "left";
      ctx.fillStyle = pal.label;
      ctx.fillText(date.sub, x0, layout.y2);
      ctx.fillStyle = tagColor;
      if (layout.tag) ctx.fillText(layout.tag, x0 + layout.subW, layout.y2);
    }
    this.spacing("0px");
  }

  private drawOrbits(proj: Projector, frame: Frame, pal: Palette): void {
    for (const p of this.planets) {
      const sel = frame.selected === p.key;
      this.strokeOrbit(this.projectOrbit(p, proj, frame.t), sel, frame.cam.zoom, pal);
      if (this.opts.showTicks) this.drawTicks(p, proj, frame, sel, pal);
    }
  }

  /** Orbit samples in screen space: x, y, depth per sample. Kept per planet
   *  because the trails read the same samples. */
  private projectOrbit(p: PlanetDef, proj: Projector, t: number): Float32Array {
    const orbit = this.cache.orbit(p, t);
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
    return scr;
  }

  /** Strokes an orbit in short chunks, each faded by its mean depth. */
  private strokeOrbit(scr: Float32Array, sel: boolean, zoom: number, pal: Palette): void {
    const ctx = this.ctx;
    const CH = 8;
    const n = scr.length / 3;
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
  }

  private drawTicks(p: PlanetDef, proj: Projector, frame: Frame, sel: boolean, pal: Palette): void {
    const S = this.size;
    const fs = Math.max(8.5, Math.min(12, S * 0.0175));
    // Zoomed in, the outer orbits run past the readout ring and their year
    // labels would crowd the date band. Keep their ticks, drop the labels.
    const labelled = this.mapper.radius(p.au) * proj.scalePx < S * 0.47;
    for (const tick of this.cache.tickList(p, frame.t)) {
      const g = this.tickGeometry(tick.pos, proj);
      const len = tick.major ? 7 : 3.5;
      this.drawTickMark(g, len, sel, frame.cam.zoom, pal);
      if (tick.label && labelled) {
        const offset = (len * 0.5 + fs * 0.85) * p.labelSide;
        this.drawTickLabel(tick.label, g, offset, fs, frame, pal);
      }
    }
    this.ctx.globalAlpha = 1;
    this.spacing("0px");
  }

  /** Where a tick sits on screen, the orbit's direction there, and the
   *  normal pointing away from the Sun. */
  private tickGeometry(q: Vec3, proj: Projector): TickGeometry {
    const step = 0.012; // radians — a short hop along the orbit, for the tangent
    proj.project(this.mapper.toWorld(q, this.w), this.p);
    this.w2[0] = q[0] * Math.cos(step) - q[1] * Math.sin(step);
    this.w2[1] = q[0] * Math.sin(step) + q[1] * Math.cos(step);
    this.w2[2] = q[2];
    proj.project(this.mapper.toWorld(this.w2, this.w2), this.p2);
    const [x, y, depth] = this.p;
    const tl = Math.hypot(this.p2[0] - x, this.p2[1] - y) || 1;
    const tx = (this.p2[0] - x) / tl;
    const ty = (this.p2[1] - y) / tl;
    const outward = -ty * (x - proj.cx) + tx * (y - proj.cy) >= 0 ? 1 : -1;
    return { x, y, depth, tx, ty, nx: -ty * outward, ny: tx * outward };
  }

  private drawTickMark(
    g: TickGeometry,
    len: number,
    sel: boolean,
    zoom: number,
    pal: Palette,
  ): void {
    const ctx = this.ctx;
    ctx.strokeStyle = sel ? pal.accent2 : pal.orbit;
    ctx.globalAlpha = this.depthAlpha(g.depth, 0.28, 0.75, zoom);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.x - g.nx * len * 0.5, g.y - g.ny * len * 0.5);
    ctx.lineTo(g.x + g.nx * len * 0.5, g.y + g.ny * len * 0.5);
    ctx.stroke();
  }

  /** A month or year label, set along the orbit and kept upright. The
   *  label for the shown month or year is lit in the accent colour. */
  private drawTickLabel(
    label: TickLabel,
    g: TickGeometry,
    offset: number,
    fs: number,
    frame: Frame,
    pal: Palette,
  ): void {
    const S = this.size;
    const lx = g.x + g.nx * offset;
    const ly = g.y + g.ny * offset;
    if (lx < -20 || ly < -20 || lx > S + 20 || ly > S + 20) return;
    const current = isCurrentLabel(label, frame.date);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(uprightAngle(g.tx, g.ty));
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
      ctx.globalAlpha = this.depthAlpha(g.depth, 0.45, 0.95, frame.cam.zoom);
      ctx.fillStyle = pal.label;
    }
    ctx.fillText(
      label.kind === "month" ? this.texts.monthLabel(label.month) : String(label.year),
      0,
      0,
    );
    ctx.restore();
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
    const R = this.sunRadius(proj);
    this.drawSunHaze(proj, R, pal);
    this.drawSunWireframe(proj, R, this.opts.ambient ? ts * 0.00011 : 0.4, pal);
  }

  private drawSunHaze(proj: Projector, R: number, pal: Palette): void {
    const ctx = this.ctx;
    const { cx, cy } = proj;
    const hazeR = Math.min(this.size * 0.34, Math.max(R * 9, 40));
    const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, hazeR);
    haze.addColorStop(0, pal.accent2);
    haze.addColorStop(1, pal.accent2Clear);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = haze;
    ctx.fillRect(cx - hazeR, cy - hazeR, hazeR * 2, hazeR * 2);
    ctx.globalAlpha = 1;
  }

  /** The geodesic Sun: back edges faint, front edges and vertices bright. */
  private drawSunWireframe(proj: Projector, R: number, spin: number, pal: Palette): void {
    const ctx = this.ctx;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    const pts = SUN.vertices.map((v) => {
      const o: Vec3 = [0, 0, 0];
      proj.rotate(v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs, v[2], o);
      return [proj.cx + o[0] * R, proj.cy + o[1] * R, o[2]] as const;
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
      for (const p of pts.filter((q) => q[2] < 0)) ctx.fillRect(p[0] - 0.8, p[1] - 0.8, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  private drawTrails(frame: Frame, pal: Palette): void {
    const ctx = this.ctx;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    for (const p of this.planets) {
      const scr = this.orbitScreens.get(p.key);
      const here = this.screen.get(p.key);
      if (!scr || !here) continue;
      ctx.strokeStyle = frame.selected === p.key ? pal.accent2 : pal.accent;
      const idx = Math.floor(orbitIndex(this.cache.orbit(p, frame.t), p, frame.t));
      this.strokeTrail(scr, here, idx);
    }
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
  }

  /** A trail back along the orbit samples to the planet's exact position,
   *  fading out with age. Segment j runs from sample j+1 to sample j. */
  private strokeTrail(scr: Float32Array, here: Screen, idx: number): void {
    const ctx = this.ctx;
    const m = Math.round(ORBIT_SAMPLES * TRAIL);
    const n = scr.length / 3;
    const point = (j: number): readonly [number, number] => {
      if (j === 0) return [here[0], here[1]];
      const i = (((idx - j) % n) + n) % n;
      return [scr[i * 3]!, scr[i * 3 + 1]!];
    };
    for (let j = m - 1; j >= 0; j--) {
      const [x0, y0] = point(j + 1);
      const [x1, y1] = point(j);
      ctx.globalAlpha = 0.85 * (1 - j / m);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
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

  /** Glyph scale for the card's size: 1 at 520 px. */
  private sizeScale(): number {
    return Math.max(0.75, Math.min(1.35, this.size / 520));
  }

  /** Too fast to draw: it would turn more than about twice a second. */
  private tooFast(periodDays: number): boolean {
    return Math.abs(this.rate) / periodDays > MAX_TURNS_PER_SECOND;
  }

  private drawPlanets(
    proj: Projector,
    sky: SkySnapshot,
    selected: PlanetKey | null,
    pal: Palette,
  ): void {
    const S = this.size;
    const sizeScale = this.sizeScale();
    // Far to near, so nearer planets paint over farther ones.
    const order = sorted(
      this.planets,
      (a, b) => (this.screen.get(b.key)?.[2] ?? 0) - (this.screen.get(a.key)?.[2] ?? 0),
    );
    this.dotRadius.clear();
    this.needleBox = null;
    for (const p of order) {
      const s = this.screen.get(p.key);
      if (!s || !onCanvas(s, S, 30)) continue;
      const r = p.size * sizeScale * (0.8 + 0.2 * s[3]);
      this.dotRadius.set(p.key, r);
      this.drawPlanet(proj, p, s, r, selected, pal);
    }
    const earth = this.screen.get("earth");
    if (this.opts.showMoon && earth) this.drawMoon(proj, sky, earth, sizeScale, pal);
    if (sky.homeDir && earth) this.drawHomeNeedle(proj, sky.homeDir, sky.homeDay, earth, pal);
  }

  private drawPlanet(
    proj: Projector,
    p: PlanetDef,
    s: Screen,
    r: number,
    selected: PlanetKey | null,
    pal: Palette,
  ): void {
    const ctx = this.ctx;
    const [x, y] = s;
    const sel = selected === p.key;
    const col = sel ? pal.accent2 : pal.accent;
    const saturn = p.body === Body.Saturn;
    const moons = p.body === Body.Jupiter ? (this.sky?.jupiterMoons ?? null) : null;
    if (saturn) this.drawRing(proj, x, y, r, true, col);
    if (moons) this.drawJupiterMoons(proj, x, y, r, moons, true, pal);
    this.drawGlow(x, y, r, col, sel ? pal.accent2Clear : pal.accentClear);
    ctx.fillStyle = p.key === "earth" && !sel ? pal.earthCore : col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (p.key === "earth") this.drawEarthRing(x, y, r, col);
    if (saturn) this.drawRing(proj, x, y, r, false, col);
    if (moons) this.drawJupiterMoons(proj, x, y, r, moons, false, pal);
  }

  private drawGlow(x: number, y: number, r: number, col: string, clear: string): void {
    const ctx = this.ctx;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4.5);
    glow.addColorStop(0, col);
    glow.addColorStop(1, clear);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Earth gets a thin ring around its dot: "you are here". */
  private drawEarthRing(x: number, y: number, r: number, col: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawRing(
    proj: Projector,
    x: number,
    y: number,
    r: number,
    back: boolean,
    col: string,
  ): void {
    const ctx = this.ctx;
    ctx.strokeStyle = col;
    ctx.globalAlpha = back ? 0.35 : 0.85;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    this.ringPath(proj, SATURN_RING, x, y, r * 2.1, back);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Adds the far (`back`) or near half of a ring of radius R around
   *  (x, y) to the current path. */
  private ringPath(
    proj: Projector,
    ring: ReadonlyArray<Vec3>,
    x: number,
    y: number,
    R: number,
    back: boolean,
  ): void {
    const ctx = this.ctx;
    const o = this.r;
    let pen = false;
    for (let i = 0; i <= ring.length; i++) {
      const q = ring[i % ring.length]!;
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
  }

  /**
   * Io, Europa, Ganymede and Callisto, drawn like Earth's Moon: faint
   * rings and real directions, distances compressed. Called twice around
   * Jupiter's dot, far half first, so the planet hides what passes behind
   * it. A moon that would turn too fast to follow is left off its ring.
   */
  private drawJupiterMoons(
    proj: Projector,
    x: number,
    y: number,
    r: number,
    moons: ReadonlyArray<Vec3>,
    back: boolean,
    pal: Palette,
  ): void {
    const ctx = this.ctx;
    const s = this.sizeScale();
    const outer = Math.max(CALLISTO_RING_PX * s, r * 3);
    const o = this.r;
    ctx.strokeStyle = pal.orbit;
    ctx.lineWidth = 0.7;
    ctx.globalAlpha = back ? 0.16 : 0.26;
    ctx.beginPath();
    for (const share of JUPITER_MOON_RINGS)
      this.ringPath(proj, JUPITER_RING, x, y, outer * share, back);
    ctx.stroke();
    ctx.fillStyle = pal.moon;
    ctx.globalAlpha = 1;
    JUPITER_MOONS.forEach((def, i) => {
      const dir = moons[i];
      if (!dir || this.tooFast(def.period)) return;
      proj.rotate(dir[0], dir[1], dir[2], o);
      if (o[2] > 0 !== back) return;
      const R = outer * JUPITER_MOON_RINGS[i]!;
      ctx.beginPath();
      ctx.arc(x + o[0] * R, y + o[1] * R, 1.3 * s, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawMoon(
    proj: Projector,
    sky: SkySnapshot,
    earth: Screen,
    sizeScale: number,
    pal: Palette,
  ): void {
    const ctx = this.ctx;
    const R = MOON_RING_PX * sizeScale;
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

  /**
   * A needle from Earth towards the sky straight above the HA home: solid
   * while the Sun is up there, dashed at night. It turns once a day, so it
   * is left out while playback runs faster than that can be followed.
   */
  private drawHomeNeedle(
    proj: Projector,
    dir: Vec3,
    day: boolean,
    earth: Screen,
    pal: Palette,
  ): void {
    if (this.tooFast(1)) return;
    const ctx = this.ctx;
    const s = this.sizeScale();
    const o = proj.rotate(dir[0], dir[1], dir[2], this.r);
    const flat = Math.hypot(o[0], o[1]);
    // Pointing straight at the viewer it has no direction to show.
    if (flat < 0.02) return;
    // Clear of Earth's dot and its ring, then full length when side-on.
    // Turned towards or away from the viewer it shortens, but only to
    // 40 %: seen from above, the zenith of a mid-latitude home points
    // mostly up out of the page, and full foreshortening would tuck the
    // needle under Earth's ring for half the day.
    const base = (this.dotRadius.get("earth") ?? 3.4 * s) + 3;
    const tip = base + HOME_NEEDLE_PX * s * (0.4 + 0.6 * flat);
    const ux = o[0] / flat;
    const uy = o[1] / flat;
    const x0 = earth[0] + ux * base;
    const y0 = earth[1] + uy * base;
    const x1 = earth[0] + ux * tip;
    const y1 = earth[1] + uy * tip;
    const pad = 3;
    this.needleBox = {
      x: Math.min(x0, x1) - pad,
      y: Math.min(y0, y1) - pad,
      w: Math.abs(x1 - x0) + pad * 2,
      h: Math.abs(y1 - y0) + pad * 2,
    };
    ctx.save();
    ctx.strokeStyle = pal.accent;
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = o[2] > 0 ? 0.55 : 0.95;
    ctx.lineWidth = day ? 1.4 : 1.2;
    ctx.lineCap = "round";
    if (!day) ctx.setLineDash([2.5, 2.5]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x1, y1, 1.8 * s, 0, Math.PI * 2);
    if (day) ctx.fill();
    else ctx.stroke();
    ctx.restore();
  }

  /**
   * On an eclipse, the line from the Sun to Earth lights up: the Moon sits
   * on it, between the two for a solar eclipse; for a lunar one it runs on
   * past Earth, dashed, as the shadow the Moon passes through.
   */
  private drawEclipseLine(proj: Projector, body: EclipseBody, pal: Palette): void {
    const earth = this.screen.get("earth");
    if (!earth) return;
    const dx = earth[0] - proj.cx;
    const dy = earth[1] - proj.cy;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const ux = dx / d;
    const uy = dy / d;
    const sunR = this.sunRadius(proj);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = pal.accent2;
    ctx.shadowColor = pal.accent2;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(proj.cx + ux * sunR, proj.cy + uy * sunR);
    ctx.lineTo(earth[0], earth[1]);
    ctx.stroke();
    if (body === "lunar") {
      const shadow = MOON_RING_PX * this.sizeScale() * 1.25;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(earth[0], earth[1]);
      ctx.lineTo(earth[0] + ux * shadow, earth[1] + uy * shadow);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlanetLabels(proj: Projector, selected: PlanetKey | null, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const fs = Math.max(9, Math.min(12.5, S * 0.019));
    ctx.font = this.font(500, fs);
    this.spacing("0.12em");
    const items = this.labelItems(labelPriority(selected, this.planets), fs);
    const placed = this.labels.place(items, this.labelObstacles(proj), {
      x: 2,
      y: 2,
      w: S - 4,
      h: S - 4,
    });

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const item of items) {
      const rect = placed.get(item.id);
      if (!rect) continue;
      const sel = item.id === selected;
      ctx.font = this.font(sel ? 600 : 500, fs);
      ctx.fillStyle = sel ? pal.accent2 : pal.ink;
      ctx.globalAlpha = sel ? 1 : this.depthAlpha(item.depth, 0.55, 0.92, 1);
      ctx.fillText(item.text, rect.x + 1, rect.y + rect.h / 2);
    }
    ctx.globalAlpha = 1;
    this.spacing("0px");
  }

  /** What planet names must not cover: the Sun, the date, every dot. */
  private labelObstacles(proj: Projector): Rect[] {
    const sunR = this.sunRadius(proj);
    const obstacles: Rect[] = [{ x: proj.cx - sunR, y: proj.cy - sunR, w: sunR * 2, h: sunR * 2 }];
    if (this.dateBox) obstacles.push(this.dateBox);
    if (this.needleBox) obstacles.push(this.needleBox);
    for (const [key, r] of this.dotRadius) {
      const s = this.screen.get(key);
      if (s) obstacles.push({ x: s[0] - r - 2, y: s[1] - r - 2, w: r * 2 + 4, h: r * 2 + 4 });
    }
    return obstacles;
  }

  /** One label per drawn planet, in priority order, measured in the
   *  current font. */
  private labelItems(keys: ReadonlyArray<PlanetKey>, fs: number): PlanetLabelItem[] {
    const items: PlanetLabelItem[] = [];
    for (const key of keys) {
      const s = this.screen.get(key);
      const r = this.dotRadius.get(key);
      if (!s || r === undefined) continue;
      const text = this.texts.planetLabel(key);
      const w = this.ctx.measureText(text).width + 2;
      items.push({ id: key, x: s[0], y: s[1], r, w, h: fs * 1.15, text, depth: s[2] });
    }
    return items;
  }

  private drawGauges(sky: SkySnapshot, pal: Palette): void {
    const ctx = this.ctx;
    const S = this.size;
    const cx = S / 2;
    const cy = S / 2;
    const Rg = S * GAUGE_RADIUS;
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
      // Centre each line on the corner, but never past the card's edge —
      // long German labels overhang on narrow cards otherwise.
      const line = (text: string, y: number): void => {
        const half = ctx.measureText(text).width / 2;
        ctx.fillText(text, Math.max(half + 4, Math.min(S - half - 4, lx)), y);
      };
      ctx.font = this.font(500, lf);
      this.spacing("0.14em");
      ctx.fillStyle = pal.label;
      line(g.label, ly - vf * 0.62);
      this.spacing("0px");
      ctx.font = this.font(500, vf);
      ctx.fillStyle = col;
      line(g.value, ly + vf * 0.36);
      ctx.font = this.font(400, sf);
      ctx.fillStyle = pal.label;
      line(g.detail, ly + vf * 0.36 + sf * 1.5);
    });
    ctx.globalAlpha = 1;
  }
}
