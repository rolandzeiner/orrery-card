import { Body } from "astronomy-engine";
import { describe, expect, it } from "vite-plus/test";

import { shownBodies } from "../src/astro/bodies";
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
  showPluto: false,
  showJupiterMoons: false,
  showHome: false,
  ambient: false,
};
const VIENNA = { latitude: 48.2082, longitude: 16.3738, elevation: 190 };

function frame(cam: Camera, selected: Frame["selected"] = null, t = T): Frame {
  const date = fmt.dateLine(t, { live: false, playing: false, speed: "month", now: T });
  return { t, ts: 1000, cam, selected, date, rate: 0, eclipse: null };
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

  it("draws Pluto only when it's switched on", () => {
    const off = setup();
    off.renderer.draw(frame(CAM));
    expect(off.fake.texts()).not.toContain("PLUTO");

    const on = setup(480, { ...ALL_ON, showPluto: true });
    on.renderer.draw(frame(CAM));
    expect(on.fake.texts()).toContain("PLUTO");
  });

  it("shows Pluto as soon as it's switched on, without waiting for time to move", () => {
    const { fake, renderer } = setup();
    renderer.draw(frame(CAM));
    renderer.setOptions({ ...ALL_ON, showPluto: true });
    fake.calls.length = 0;
    renderer.draw(frame(CAM));
    expect(fake.texts()).toContain("PLUTO");
  });

  it("draws Jupiter's four moons only when they're switched on", () => {
    const arcs = (opts: RenderOptions, rate = 0): number => {
      const { fake, renderer } = setup(480, opts);
      renderer.draw({ ...frame(CAM), rate });
      return fake.calls.filter(([name]) => name === "arc").length;
    };
    const off = arcs(ALL_ON);
    // Four moons; at most one hides behind Jupiter's dot.
    expect(arcs({ ...ALL_ON, showJupiterMoons: true }) - off).toBeGreaterThanOrEqual(3);
    // At 1 year/s even Callisto would turn 22 times a second: off its ring.
    expect(arcs({ ...ALL_ON, showJupiterMoons: true }, 365.25)).toBe(off);
  });

  it("points the home needle only with a home location, and drops it in fast playback", () => {
    const needles = (home: typeof VIENNA | null, rate = 0): number => {
      const { fake, renderer } = setup(480, { ...ALL_ON, showHome: true });
      renderer.setHome(home);
      renderer.draw({ ...frame({ az: 1.1, el: Math.PI / 2, zoom: 1 }), rate });
      return fake.calls.filter(([name]) => name === "setLineDash" || name === "save").length;
    };
    const none = needles(null);
    expect(needles(VIENNA)).toBeGreaterThan(none);
    expect(needles(VIENNA, 7)).toBe(none);
  });

  it("dashes the home needle at night and draws it solid by day", () => {
    const dashes = (t: number): number => {
      const { fake, renderer } = setup(480, { ...ALL_ON, showHome: true, showTrails: false });
      renderer.setHome(VIENNA);
      renderer.draw(frame({ az: 1.1, el: Math.PI / 2, zoom: 1 }, null, t));
      return fake.calls.filter(
        ([name, args]) => name === "setLineDash" && (args[0] as number[]).length > 0,
      ).length;
    };
    // Vienna: noon and midnight UTC are 13:00 and 01:00 local.
    expect(dashes(Date.UTC(2026, 8, 26, 11))).toBe(0);
    expect(dashes(Date.UTC(2026, 8, 26, 23))).toBe(1);
  });

  it("lights the Sun–Earth line on an eclipse, with the shadow past Earth for a lunar one", () => {
    const lines = (eclipse: Frame["eclipse"]): Array<unknown[]> => {
      const { fake, renderer } = setup(480, { ...ALL_ON, showTrails: false });
      renderer.draw({ ...frame(CAM), eclipse });
      return fake.calls.filter(([name]) => name === "setLineDash").map(([, args]) => args);
    };
    expect(lines(null)).toHaveLength(0);
    expect(lines("solar")).toHaveLength(0);
    expect(lines("lunar")).toEqual([[[2, 3]]]);
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

  it("moves a long tag under the time on a narrow card", () => {
    const narrow = setup(300);
    const playing = fmt.dateLine(T, { live: false, playing: true, speed: "decade", now: T });
    narrow.renderer.draw({ ...frame(CAM), date: playing });
    expect(narrow.fake.texts()).toContain("10 YEARS/S");

    const wide = setup(900);
    wide.renderer.draw({ ...frame(CAM), date: playing });
    expect(wide.fake.texts()).toContain("  ·  10 YEARS/S");
  });

  it("falls back to the short eclipse tag where the long one would cross the readouts", () => {
    const date = {
      ...fmt.dateLine(T, { live: false, playing: false, speed: "month", now: T }),
      tag: "RINGFÖRMIGE SONNENFINSTERNIS",
      tagShort: "SONNENFINSTERNIS",
    };
    const narrow = setup(360);
    narrow.renderer.draw({ ...frame(CAM), date });
    expect(narrow.fake.texts()).toContain("SONNENFINSTERNIS");
    expect(narrow.fake.texts()).not.toContain("RINGFÖRMIGE SONNENFINSTERNIS");

    const wide = setup(900);
    wide.renderer.draw({ ...frame(CAM), date });
    expect(wide.fake.texts()).toContain("  ·  RINGFÖRMIGE SONNENFINSTERNIS");
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
      [{ scale: "true", showPluto: true, tilt: 8 }, { az: 0.3, el: 0.05, zoom: 0.5 }, "pluto"],
      [{ showJupiterMoons: true, showHome: true }, { az: 0.3, el: 0.02, zoom: 6 }, "jupiter"],
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
    const p = new Projector(CAM, size).project(
      new WorldMapper("log", 1).toWorld(helio(Body.Earth, T)),
      [0, 0, 0, 1],
    );
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

  it("ranks Pluto last, after the planets, unless it's selected", () => {
    expect(labelPriority(null, shownBodies(true)).at(-1)).toBe("pluto");
    expect(labelPriority("pluto", shownBodies(true))[0]).toBe("pluto");
  });

  it("keeps the previous spot and falls back to it when nothing is free", () => {
    const none = (): boolean => false;
    expect(chooseSpot(6, undefined, none)).toBe(0);
    expect(chooseSpot(6, 3, none)).toBe(3);
    expect(chooseSpot(6, 3, (i) => i === 3)).toBe(3);
  });
});
