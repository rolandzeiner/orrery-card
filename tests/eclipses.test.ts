import { describe, expect, it } from "vite-plus/test";

import { homeView, nextEclipse, previousEclipse, type Eclipse } from "../src/astro/eclipses";
import { MAX_TIME, MIN_TIME } from "../src/const";
import { CardFormat } from "../src/format";

const VIENNA = { latitude: 48.2082, longitude: 16.3738, elevation: 190 };
const MINUTE = 60_000;

function must(e: Eclipse | null): Eclipse {
  if (!e) throw new Error("no eclipse found");
  return e;
}

// The 2026 eclipses, peaks per NASA's catalogue: 17 Feb annular solar,
// 3 Mar total lunar, 12 Aug total solar, 28 Aug partial lunar.
const AUG_12 = Date.UTC(2026, 7, 12, 17, 46);
const AUG_28 = Date.UTC(2026, 7, 28, 4, 13);
const MAR_3 = Date.UTC(2026, 2, 3, 11, 34);
const FEB_17 = Date.UTC(2026, 1, 17, 12, 12);

describe("stepping through eclipses", () => {
  it("finds the next eclipse of either kind", () => {
    const solar = must(nextEclipse(Date.UTC(2026, 6, 1)));
    expect(solar).toMatchObject({ body: "solar", type: "total" });
    expect(Math.abs(solar.peak - AUG_12)).toBeLessThan(2 * MINUTE);

    const lunar = must(nextEclipse(solar.peak));
    expect(lunar).toMatchObject({ body: "lunar", type: "partial" });
    expect(Math.abs(lunar.peak - AUG_28)).toBeLessThan(2 * MINUTE);
  });

  it("steps back from the eclipse it stands on, not onto it", () => {
    const aug = must(nextEclipse(Date.UTC(2026, 6, 1)));
    const mar = must(previousEclipse(aug.peak));
    expect(mar).toMatchObject({ body: "lunar", type: "total" });
    expect(Math.abs(mar.peak - MAR_3)).toBeLessThan(2 * MINUTE);

    const feb = must(previousEclipse(mar.peak));
    expect(feb).toMatchObject({ body: "solar", type: "annular" });
    expect(Math.abs(feb.peak - FEB_17)).toBeLessThan(2 * MINUTE);
  });

  it("never stays on the eclipse it stands on when stepping forward", () => {
    // The engine searches from the new or full moon, and about a third of
    // eclipses peak before it: these two once came back to themselves.
    for (const peak of [
      Date.UTC(1800, 3, 24, 0, 23, 31, 10),
      Date.UTC(1802, 2, 19, 11, 15, 0, 682),
    ])
      expect(must(nextEclipse(peak)).peak).toBeGreaterThan(peak + MINUTE);
    let t = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 40; i++) {
      const e = must(nextEclipse(t));
      expect(e.peak).toBeGreaterThan(t);
      expect(must(previousEclipse(e.peak)).peak).toBeLessThan(e.peak);
      t = e.peak;
    }
  });

  it("goes forward and back to the same eclipse", () => {
    const e = must(nextEclipse(Date.UTC(2031, 3, 1)));
    const back = must(previousEclipse(must(nextEclipse(e.peak)).peak));
    expect(back.peak).toBe(e.peak);
  });

  it("gives the length of a lunar eclipse, partial phase first", () => {
    const lunar = must(nextEclipse(AUG_12 + MINUTE));
    // The 28 August 2026 partial phase lasts about 3 h 18 min.
    expect(lunar.halfMinutes).toBeGreaterThan(90);
    expect(lunar.halfMinutes).toBeLessThan(110);
  });

  it("stops at the ends of the range the card can show", () => {
    expect(nextEclipse(MAX_TIME)).toBeNull();
    expect(previousEclipse(MIN_TIME)).toBeNull();
  });
});

describe("eclipses from home", () => {
  it("sees the August 2027 eclipse as partial, about half the Sun covered", () => {
    const e = must(nextEclipse(Date.UTC(2027, 6, 25)));
    expect(e).toMatchObject({ body: "solar", type: "total" });
    const view = homeView(e, VIENNA);
    expect(view.visibility).toBe("seen");
    expect(view.type).toBe("partial");
    expect(view.obscuration).toBeGreaterThan(0.4);
    expect(view.obscuration).toBeLessThan(0.55);
  });

  it("has the Sun set during the August 2026 eclipse", () => {
    expect(homeView(must(nextEclipse(Date.UTC(2026, 6, 1))), VIENNA).visibility).toBe("sets");
  });

  it("can't see the February 2026 annular eclipse at all", () => {
    expect(homeView(must(nextEclipse(Date.UTC(2026, 0, 1))), VIENNA)).toEqual({
      visibility: "unseen",
    });
  });

  it("has the Moon set during the August 2026 lunar eclipse, and up in February 2027", () => {
    expect(homeView(must(nextEclipse(AUG_12 + MINUTE)), VIENNA).visibility).toBe("sets");
    const feb = must(nextEclipse(Date.UTC(2027, 1, 15)));
    expect(feb).toMatchObject({ body: "lunar", type: "penumbral" });
    expect(homeView(feb, VIENNA).visibility).toBe("seen");
  });

  it("can't see the March 2026 lunar eclipse, at midday in Vienna", () => {
    const mar = must(previousEclipse(Date.UTC(2026, 2, 10)));
    expect(homeView(mar, VIENNA).visibility).toBe("unseen");
  });
});

describe("eclipse wording", () => {
  const en = new CardFormat("en", "UTC", false);
  const de = new CardFormat("de", "UTC", false);

  it("names every kind in both languages", () => {
    expect(en.eclipseName({ body: "solar", type: "total" })).toBe("Total solar eclipse");
    expect(en.eclipseName({ body: "lunar", type: "penumbral" })).toBe("Penumbral lunar eclipse");
    expect(de.eclipseName({ body: "solar", type: "annular" })).toBe("Ringförmige Sonnenfinsternis");
  });

  it("says how it looks from home", () => {
    const solar = { body: "solar" } as const;
    expect(
      en.eclipseFromHome(solar, { visibility: "seen", type: "partial", obscuration: 0.47 }),
    ).toBe("From your home, the Moon covers up to 47% of the Sun.");
    expect(en.eclipseFromHome(solar, { visibility: "seen", type: "total", obscuration: 1 })).toBe(
      "From your home, it's total.",
    );
    expect(en.eclipseFromHome(solar, { visibility: "sets" })).toBe(
      "From your home, the Sun sets while it's under way.",
    );
    expect(en.eclipseFromHome({ body: "lunar" }, { visibility: "rises" })).toBe(
      "From your home, the Moon rises while it's under way.",
    );
    expect(de.eclipseFromHome({ body: "lunar" }, { visibility: "unseen" })).toBe(
      "Von deinem Zuhause aus ist sie nicht zu sehen.",
    );
  });

  it("puts the eclipse in the date tag, ahead of the offset", () => {
    const line = en.dateLine(AUG_12, {
      live: false,
      playing: false,
      speed: "month",
      now: Date.UTC(2026, 0, 1),
      eclipse: { body: "solar", type: "total" },
    });
    expect(line.tag).toBe("TOTAL SOLAR ECLIPSE");
    expect(line.tagShort).toBe("SOLAR ECLIPSE");
    expect(line.tagIsLive).toBe(false);
    const playing = en.dateLine(AUG_12, {
      live: false,
      playing: true,
      speed: "month",
      now: AUG_12,
      eclipse: { body: "solar", type: "total" },
    });
    expect(playing.tag).toBe("1 MONTH/S");
  });
});
