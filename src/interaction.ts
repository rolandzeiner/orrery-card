/** Input and time logic for the card, kept free of the DOM so it can be
 *  tested on its own. The card's event handlers only translate events into
 *  calls here and apply the result. */
import { DAY_MS, MAX_TIME, MIN_TIME } from "./const";
import { clampElevation, type Camera } from "./render/camera";

// ── Time ─────────────────────────────────────────────────────────────────

export const clampTime = (t: number): number => Math.max(MIN_TIME, Math.min(MAX_TIME, t));

/** Playback: move `t` on by `daysPerSecond` over `dtMs`. `ended` is true
 *  when it ran into the start or end of the travel range. */
export function advanceTime(t: number, daysPerSecond: number, dtMs: number): { t: number; ended: boolean } {
  const next = clampTime(t + daysPerSecond * DAY_MS * (dtMs / 1000));
  return { t: next, ended: next === MIN_TIME || next === MAX_TIME };
}

/** Step by whole calendar months, then by days. */
export function stepTime(t: number, days: number, months: number): number {
  const d = new Date(t);
  if (months) d.setUTCMonth(d.getUTCMonth() + months);
  return clampTime(d.getTime() + days * DAY_MS);
}

/** Move `t` to the date typed into the date input (yyyy-mm-dd), keeping
 *  the time of day. `shown` is the calendar date `t` currently displays,
 *  as [year, month 1-12, day]. Null when the input isn't a full date. */
export function moveToDate(t: number, input: string, shown: readonly [number, number, number]): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return clampTime(t + target - Date.UTC(shown[0], shown[1] - 1, shown[2]));
}

// ── Keyboard ─────────────────────────────────────────────────────────────

const KEY_STEP = (5 * Math.PI) / 180;
const KEY_ZOOM = 1.15;

export type ViewCommand =
  | { kind: "rotate"; az: number; el: number }
  | { kind: "zoom"; factor: number }
  | { kind: "reset" };

const KEYS: Readonly<Record<string, ViewCommand>> = {
  ArrowLeft: { kind: "rotate", az: -KEY_STEP, el: 0 },
  ArrowRight: { kind: "rotate", az: KEY_STEP, el: 0 },
  ArrowUp: { kind: "rotate", az: 0, el: KEY_STEP },
  ArrowDown: { kind: "rotate", az: 0, el: -KEY_STEP },
  "+": { kind: "zoom", factor: KEY_ZOOM },
  "=": { kind: "zoom", factor: KEY_ZOOM },
  "-": { kind: "zoom", factor: 1 / KEY_ZOOM },
  "0": { kind: "reset" },
};

/** What a key does to the view while the sky has focus, if anything. */
export function keyCommand(key: string): ViewCommand | null {
  return KEYS[key] ?? null;
}

// ── Pointer gestures ─────────────────────────────────────────────────────

const ROTATE_PER_PX = 0.008;
const TILT_PER_PX = 0.006;
/** Movement (px, |dx| + |dy|) below which a press still counts as a tap. */
export const TAP_SLOP = 4;

export type GestureUpdate = { az: number; el: number } | { zoom: number };

interface Point {
  x: number;
  y: number;
}

/** Tracks the pointers on the sky: one finger or the mouse rotates, two
 *  fingers pinch-zoom, and a press that barely moves is a tap. */
export class ViewGesture {
  private readonly pointers = new Map<number, Point>();
  private drag: { start: Point; az0: number; el0: number; moved: boolean } | null = null;
  private pinch: { d0: number; z0: number } | null = null;

  down(id: number, x: number, y: number, cam: Camera): void {
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 1) {
      this.drag = { start: { x, y }, az0: cam.az, el0: cam.el, moved: false };
    } else if (this.pointers.size === 2) {
      this.pinch = { d0: this.spread() || 1, z0: cam.zoom };
      this.drag = null;
    }
  }

  /** The camera change this move asks for, or null for none. */
  move(id: number, x: number, y: number): GestureUpdate | null {
    if (!this.pointers.has(id)) return null;
    this.pointers.set(id, { x, y });
    if (this.pinch && this.pointers.size === 2) return { zoom: (this.pinch.z0 * this.spread()) / this.pinch.d0 };
    if (!this.drag) return null;
    const dx = x - this.drag.start.x;
    const dy = y - this.drag.start.y;
    if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) this.drag.moved = true;
    return { az: this.drag.az0 + dx * ROTATE_PER_PX, el: clampElevation(this.drag.el0 + dy * TILT_PER_PX) };
  }

  /** Ends a pointer. True when it was a tap: one pointer, barely moved,
   *  and lifted rather than cancelled (WCAG 2.5.2). */
  up(id: number, cancelled: boolean): boolean {
    const tap = !cancelled && this.drag !== null && !this.drag.moved;
    this.pointers.delete(id);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.drag = null;
    return tap;
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
