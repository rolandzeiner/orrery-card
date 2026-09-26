import { describe, expect, it } from "vitest";

import { DAY_MS, MAX_TIME, MIN_TIME } from "../src/const";
import { advanceTime, keyCommand, moveToDate, stepTime, TAP_SLOP, ViewGesture } from "../src/interaction";

const T = Date.UTC(2026, 8, 26, 12);

describe("time", () => {
  it("plays forward at the chosen speed", () => {
    const { t, ended } = advanceTime(T, 30, 500);
    expect(t - T).toBe(15 * DAY_MS);
    expect(ended).toBe(false);
  });

  it("stops at the end of the range", () => {
    expect(advanceTime(MAX_TIME - DAY_MS, 365, 1000)).toEqual({ t: MAX_TIME, ended: true });
    expect(advanceTime(MIN_TIME + DAY_MS, -365, 1000)).toEqual({ t: MIN_TIME, ended: true });
  });

  it("steps by calendar months and by days", () => {
    expect(new Date(stepTime(Date.UTC(2026, 0, 31), 0, 1)).toISOString()).toBe("2026-03-03T00:00:00.000Z");
    expect(stepTime(T, -1, 0)).toBe(T - DAY_MS);
    expect(stepTime(MIN_TIME, 0, -1)).toBe(MIN_TIME);
  });

  it("jumps to a typed date and keeps the time of day", () => {
    expect(moveToDate(T, "2030-01-15", [2026, 9, 26])).toBe(Date.UTC(2030, 0, 15, 12));
    expect(moveToDate(T, "2030-01", [2026, 9, 26])).toBeNull();
    expect(moveToDate(T, "3000-01-01", [2026, 9, 26])).toBe(MAX_TIME);
  });
});

describe("keyCommand", () => {
  it("maps arrows to rotation, +/- to zoom and 0 to reset", () => {
    expect(keyCommand("ArrowLeft")).toMatchObject({ kind: "rotate", el: 0 });
    expect(keyCommand("ArrowUp")).toMatchObject({ kind: "rotate", az: 0 });
    expect(keyCommand("+")).toMatchObject({ kind: "zoom" });
    expect(keyCommand("=")).toEqual(keyCommand("+"));
    expect(keyCommand("-")).toMatchObject({ kind: "zoom" });
    expect(keyCommand("0")).toEqual({ kind: "reset" });
  });

  it("ignores every other key, so the dashboard keeps them", () => {
    expect(keyCommand("a")).toBeNull();
    expect(keyCommand("Tab")).toBeNull();
    expect(keyCommand("Enter")).toBeNull();
  });
});

describe("ViewGesture", () => {
  const cam = { az: 1, el: 0.5, zoom: 2 };

  it("rotates with a one-finger drag", () => {
    const g = new ViewGesture();
    g.down(1, 100, 100, cam);
    const update = g.move(1, 150, 120);
    expect(update).toMatchObject({ az: expect.any(Number), el: expect.any(Number) });
    if (update && "az" in update) {
      expect(update.az).toBeGreaterThan(cam.az);
      expect(update.el).toBeGreaterThan(cam.el);
    }
    expect(g.up(1, false)).toBe(false);
  });

  it("treats a press that barely moves as a tap", () => {
    const g = new ViewGesture();
    g.down(1, 100, 100, cam);
    g.move(1, 100 + TAP_SLOP / 2, 100);
    expect(g.up(1, false)).toBe(true);
  });

  it("doesn't tap when the press is cancelled", () => {
    const g = new ViewGesture();
    g.down(1, 100, 100, cam);
    expect(g.up(1, true)).toBe(false);
  });

  it("zooms with a two-finger pinch", () => {
    const g = new ViewGesture();
    g.down(1, 100, 100, cam);
    g.down(2, 200, 100, cam);
    expect(g.move(2, 300, 100)).toEqual({ zoom: cam.zoom * 2 });
    expect(g.up(2, false)).toBe(false);
    expect(g.up(1, false)).toBe(false);
  });

  it("ignores moves from pointers it never saw go down", () => {
    expect(new ViewGesture().move(7, 10, 10)).toBeNull();
  });
});
