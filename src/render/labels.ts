/** Planet-name placement with hysteresis.
 *
 *  Each label has six candidate spots around its dot. Picking the first
 *  free spot every frame makes labels flip from side to side whenever two
 *  planets pass close to each other, because tiny movements toggle a
 *  collision on and off. Two rules stop that:
 *
 *  1. A label keeps last frame's spot while that spot is still free.
 *  2. It returns to its preferred spot (index 0) only once that spot is
 *     free by a clear margin, so a label near the boundary doesn't bounce.
 *
 *  Items are placed in the caller's order, which must be stable from frame
 *  to frame (not depth-sorted), or the priority itself would flip.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelItem {
  id: string;
  /** Dot centre and radius, px. */
  x: number;
  y: number;
  r: number;
  /** Measured text box, px. */
  w: number;
  h: number;
}

/** Extra clearance a label needs before it moves back to its preferred spot. */
export const RETURN_MARGIN = 6;

const overlaps = (a: Rect, b: Rect, margin: number): boolean =>
  a.x - margin < b.x + b.w &&
  b.x < a.x + a.w + margin &&
  a.y - margin < b.y + b.h &&
  b.y < a.y + a.h + margin;

/** Candidate text boxes, preferred first: right-above, right-below,
 *  left-above, left-below, centred above, centred below. */
export function candidates(item: LabelItem): Rect[] {
  const g = item.r + 5;
  const { w, h } = item;
  return [
    { x: item.x + g, y: item.y - g * 0.6 - h, w, h },
    { x: item.x + g, y: item.y + g * 0.6, w, h },
    { x: item.x - g - w, y: item.y - g * 0.6 - h, w, h },
    { x: item.x - g - w, y: item.y + g * 0.6, w, h },
    { x: item.x - w / 2, y: item.y - g - h - 2, w, h },
    { x: item.x - w / 2, y: item.y + g + 2, w, h },
  ];
}

/** Which candidate spot a label takes, given the spot it had last frame.
 *  `isFree(i, margin)` says whether spot i is clear by `margin` px.
 *
 *  - A label away from its preferred spot (0) goes back once 0 is clear
 *    by RETURN_MARGIN.
 *  - Otherwise it keeps last frame's spot while that spot is free.
 *  - Otherwise it takes the first free spot. Spot 0 needs the margin here
 *    too, or a label pushed out of it would land back on a borderline
 *    spot 0 and leave again next frame.
 *  - With nothing free it stays put (or takes 0 on its first frame). */
export function chooseSpot(count: number, prev: number | undefined, isFree: (i: number, margin: number) => boolean): number {
  if (prev === undefined) return firstFree(count, isFree, 0) ?? 0;
  if (prev !== 0 && isFree(0, RETURN_MARGIN)) return 0;
  if (isFree(prev, 0)) return prev;
  return firstFree(count, isFree, RETURN_MARGIN) ?? prev;
}

function firstFree(count: number, isFree: (i: number, margin: number) => boolean, marginForZero: number): number | undefined {
  for (let i = 0; i < count; i++) if (isFree(i, i === 0 ? marginForZero : 0)) return i;
  return undefined;
}

export class LabelPlacer {
  private readonly previous = new Map<string, number>();

  /** `bounds`, when given, is the drawable area: a spot that would stick
   *  out of it counts as taken, so edge labels flip inwards. */
  place(items: ReadonlyArray<LabelItem>, obstacles: ReadonlyArray<Rect>, bounds?: Rect): Map<string, Rect> {
    const taken: Rect[] = [...obstacles];
    const placed = new Map<string, Rect>();
    const inside = (r: Rect): boolean =>
      !bounds ||
      (r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h);
    const free = (rect: Rect, margin: number): boolean =>
      inside(rect) && !taken.some((other) => overlaps(rect, other, margin));

    for (const item of items) {
      const spots = candidates(item);
      const prev = this.previous.get(item.id);
      const chosen = chooseSpot(spots.length, prev, (i, margin) => free(spots[i]!, margin));
      const rect = spots[chosen]!;
      this.previous.set(item.id, chosen);
      placed.set(item.id, rect);
      taken.push(rect);
    }
    return placed;
  }

  reset(): void {
    this.previous.clear();
  }
}
