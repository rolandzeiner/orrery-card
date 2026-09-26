import { Body } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { helio } from "../src/astro/ephemeris";
import { CardFormat } from "../src/format";
import { chooseSpot } from "../src/render/labels";
import { Projector, type Camera } from "../src/render/camera";
import {
  isCurrentLabel,
  labelPriority,
  OrreryRenderer,
  uprightAngle,
  type Frame,
  type RenderOptions,
} from "../src/render/renderer";
import { WorldMapper } from "../src/render/scale";
import { fakeCanvas, fakeContext, SAMPLE_PALETTE } from "./fake-canvas";

const T = Date.UTC(2026, 8, 26, 12);
const fmt = new CardFormat("en", "UTC", false);
const ALL_ON: RenderOptions = {
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

function frame(cam: Camera, selected: Frame["selected"] = null, t = T): Frame {
  const date = fmt.dateLine(t, { live: false, playing: false, speed: "month", now: T });
  return { t, ts: 1000, cam, selected, date };
}

function setup(size = 480, opts: RenderOptions = ALL_ON) {
  const fake = fakeContext();
  const renderer = new OrreryRenderer(fakeCanvas(fake), fmt);
  renderer.setOptions(opts);
  renderer.setPalette(SAMPLE_PALETTE);
  renderer.resize(size, 1);
  return { fake, renderer };
}

const CAM: Camera = { az: 1.1, el: 0.45, zoom: 1 };

describe("OrreryRenderer.draw", () => {
  it("draws nothing until it has a palette", () => {
    const fake = fakeContext();
    const renderer = new OrreryRenderer(fakeCanvas(fake), fmt);
    renderer.resize(400, 1);
    renderer.draw(frame(CAM));
    expect(fake.calls).toHaveLength(0);
    expect(renderer.hasPalette).toBe(false);
  });

  it("draws the date, the planet names, the month labels and the readouts", () => {
    const { fake, renderer } = setup();
    renderer.draw(frame(CAM));
    const texts = fake.texts();
    expect(texts).toContain("26 SEP 2026");
    expect(texts).toContain("EARTH");
    expect(texts).toContain("NEPTUNE");
    expect(texts).toContain("SEP");
    expect(texts).toContain("MOON");
    expect(texts).toContain("2026");
  });

  it("leaves out every optional layer when they're switched off", () => {
    const { fake, renderer } = setup(480, {
      ...ALL_ON,
      showDate: false,
      showReadouts: false,
      showLabels: false,
      showTicks: false,
      showTrails: false,
      showBelt: false,
      showMoon: false,
    });
    renderer.draw(frame(CAM));
    expect(fake.texts()).toEqual([]);
  });

  it("frosts the line-work behind the date, and only when the date is shown", () => {
    const shown = setup();
    shown.renderer.draw(frame({ az: 1.1, el: Math.PI / 2, zoom: 1 }));
    expect(shown.fake.calls.some(([name]) => name === "drawImage")).toBe(true);
    expect(shown.fake.calls.some(([name]) => name === "clip")).toBe(true);

    const hidden = setup(480, { ...ALL_ON, showDate: false });
    hidden.renderer.draw(frame({ az: 1.1, el: Math.PI / 2, zoom: 1 }));
    expect(hidden.fake.calls.some(([name]) => name === "drawImage")).toBe(false);
  });

  it("hides the corner readouts on a card too small for them", () => {
    const { fake, renderer } = setup(260);
    renderer.draw(frame(CAM));
    expect(fake.texts()).not.toContain("MOON");
  });

  it("draws every selection, view and scale without throwing", () => {
    const cases: Array<[Partial<RenderOptions>, Camera, Frame["selected"]]> = [
      [{}, CAM, "mars"],
      [{}, CAM, "earth"],
      [{}, CAM, "saturn"],
      [{ ambient: true }, { az: 0, el: Math.PI / 2, zoom: 1 }, null],
      [{ scale: "true" }, { az: 2, el: 0.05, zoom: 20 }, "mercury"],
      [{ scale: "sqrt", tilt: 8 }, { az: -1, el: 0.8, zoom: 3 }, "neptune"],
    ];
    for (const [opts, cam, selected] of cases) {
      const { renderer } = setup(420, { ...ALL_ON, ...opts });
      expect(() => renderer.draw(frame(cam, selected))).not.toThrow();
    }
  });

  it("finds Earth where it drew it, and nothing in an empty corner", () => {
    const size = 480;
    const { renderer } = setup(size);
    renderer.draw(frame(CAM));
    const p = new Projector(CAM, size).project(new WorldMapper("log", 1).toWorld(helio(Body.Earth, T)), [0, 0, 0, 1]);
    expect(renderer.pick(p[0] + 2, p[1] - 2)).toBe("earth");
    expect(renderer.pick(2, 2)).toBeNull();
  });

  it("caps the backing store so a huge card stays affordable", () => {
    const fake = fakeContext();
    const canvas = fakeCanvas(fake);
    const renderer = new OrreryRenderer(canvas, fmt);
    renderer.resize(1200, 2);
    expect(canvas.width).toBe(1800);
  });

  it("refuses a canvas without a 2D context", () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => new OrreryRenderer(canvas, fmt)).toThrow(/Canvas 2D/);
  });
});

describe("tick labels", () => {
  const date = { monthKey: 2026 * 12 + 8, year: 2026 };

  it("lights the shown month and the year span containing the shown year", () => {
    expect(isCurrentLabel({ kind: "month", year: 2026, month: 8 }, date)).toBe(true);
    expect(isCurrentLabel({ kind: "month", year: 2025, month: 8 }, date)).toBe(false);
    expect(isCurrentLabel({ kind: "year", year: 2025, span: 5 }, date)).toBe(true);
    expect(isCurrentLabel({ kind: "year", year: 2020, span: 5 }, date)).toBe(false);
  });

  it("keeps rotated text upright", () => {
    expect(uprightAngle(1, 0)).toBeCloseTo(0);
    expect(uprightAngle(-1, 0)).toBeCloseTo(0);
    expect(uprightAngle(-1, 0.01)).toBeLessThan(0);
    expect(Math.abs(uprightAngle(-1, -1))).toBeLessThanOrEqual(Math.PI / 2);
  });
});

describe("label priority and spots", () => {
  it("puts the selected planet first, then Earth, then outwards", () => {
    expect(labelPriority("mars").slice(0, 3)).toEqual(["mars", "earth", "mercury"]);
    expect(labelPriority(null)[0]).toBe("earth");
    expect(labelPriority("earth")).toHaveLength(8);
  });

  it("keeps the previous spot and falls back to it when nothing is free", () => {
    const none = (): boolean => false;
    expect(chooseSpot(6, undefined, none)).toBe(0);
    expect(chooseSpot(6, 3, none)).toBe(3);
    expect(chooseSpot(6, 3, (i) => i === 3)).toBe(3);
  });
});
