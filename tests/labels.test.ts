import { describe, expect, it } from "vitest";

import { candidates, LabelPlacer, RETURN_MARGIN, type LabelItem } from "../src/render/labels";

const item = (id: string, x: number, y: number): LabelItem => ({ id, x, y, r: 3, w: 50, h: 12 });

/** Which candidate spot a placed rect is. */
function spotOf(placer: LabelPlacer, items: LabelItem[], id: string): number {
  const placed = placer.place(items, []).get(id);
  const target = items.find((i) => i.id === id)!;
  return candidates(target).findIndex((c) => c.x === placed?.x && c.y === placed?.y);
}

describe("LabelPlacer", () => {
  it("uses the preferred spot when nothing is in the way", () => {
    const placer = new LabelPlacer();
    expect(spotOf(placer, [item("a", 100, 100)], "a")).toBe(0);
  });

  it("moves a label out of the way of a higher-priority one", () => {
    const placer = new LabelPlacer();
    const items = [item("a", 100, 100), item("b", 104, 100)];
    expect(spotOf(placer, items, "b")).not.toBe(0);
  });

  // Geometry used below: a's preferred label spans x 108–158 on the same
  // line as b's preferred label, which starts at b.x + 8. So b at x = 150
  // just clears it and b at x = 149 just collides.

  it("does not flip back and forth while two planets jitter side by side", () => {
    const placer = new LabelPlacer();
    const spots = new Set<number>();
    // b wobbles across the collision boundary every frame — the case that
    // made labels jump left and right.
    for (let frame = 0; frame < 40; frame++) {
      const bx = frame % 2 === 0 ? 149 : 151;
      spots.add(spotOf(placer, [item("a", 100, 100), item("b", bx, 100)], "b"));
    }
    expect(spots.size).toBe(1);
  });

  it("returns to the preferred spot only once it is clear by the margin", () => {
    const placer = new LabelPlacer();
    // Crowded out of spot 0 first.
    expect(spotOf(placer, [item("a", 100, 100), item("b", 149, 100)], "b")).not.toBe(0);
    // Clear by 1 px, inside the margin: stays put.
    expect(spotOf(placer, [item("a", 100, 100), item("b", 151, 100)], "b")).not.toBe(0);
    // Clear by more than the margin: goes home.
    const home = 150 + RETURN_MARGIN + 1;
    expect(spotOf(placer, [item("a", 100, 100), item("b", home, 100)], "b")).toBe(0);
  });

  it("keeps labels off obstacles such as the Sun", () => {
    const placer = new LabelPlacer();
    const a = item("a", 100, 100);
    const sun = { ...candidates(a)[0]! };
    const placed = placer.place([a], [sun]).get("a");
    expect(placed).not.toEqual(sun);
  });

  it("flips a label inwards at the edge of the card", () => {
    const placer = new LabelPlacer();
    const bounds = { x: 0, y: 0, w: 400, h: 400 };
    const edge = item("uranus", 380, 200);
    const rect = placer.place([edge], [], bounds).get("uranus")!;
    expect(rect.x + rect.w).toBeLessThanOrEqual(400);
    expect(rect.x).toBeLessThan(edge.x);
  });
});
