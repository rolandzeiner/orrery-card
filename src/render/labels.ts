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

export class LabelPlacer {
  private readonly previous = new Map<string, number>();

  place(items: ReadonlyArray<LabelItem>, obstacles: ReadonlyArray<Rect>): Map<string, Rect> {
    const taken: Rect[] = [...obstacles];
    const placed = new Map<string, Rect>();
    const free = (rect: Rect, margin: number): boolean =>
      !taken.some((other) => overlaps(rect, other, margin));

    for (const item of items) {
      const spots = candidates(item);
      const prev = this.previous.get(item.id);
      let chosen = -1;

      if (prev !== undefined && prev !== 0 && free(spots[0]!, RETURN_MARGIN)) {
        chosen = 0;
      } else if (prev !== undefined && free(spots[prev]!, 0)) {
        chosen = prev;
      } else {
        for (let i = 0; i < spots.length; i++) {
          // Guard the preferred spot with the same margin here, or a label
          // pushed out of spot 1 would land back on a borderline spot 0 and
          // leave it again next frame.
          const margin = i === 0 && prev !== undefined ? RETURN_MARGIN : 0;
          if (free(spots[i]!, margin)) {
            chosen = i;
            break;
          }
        }
      }
      if (chosen < 0) chosen = prev ?? 0;

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
