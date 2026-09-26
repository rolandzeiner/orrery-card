import { describe, expect, it } from "vitest";

import { CardFormat, resolveHour12, resolveTimeZone } from "../src/format";

const t = Date.UTC(2026, 8, 26, 18, 5);
const base = { live: false, playing: false, speed: "month" as const, now: t };

describe("CardFormat.dateLine", () => {
  it("writes the English date line", () => {
    const line = new CardFormat("en", "UTC", false).dateLine(t, { ...base, live: true });
    expect(line.big).toBe("26 SEP 2026");
    expect(line.sub).toBe("SAT · 18:05");
    expect(line.tag).toBe("LIVE");
    expect(line.tagIsLive).toBe(true);
    expect(line.monthKey).toBe(2026 * 12 + 8);
  });

  it("writes the German date line without abbreviation dots", () => {
    const line = new CardFormat("de", "UTC", undefined).dateLine(t, base);
    expect(line.big).toMatch(/^26 SEPT? 2026$/);
    expect(line.sub).toBe("SA · 18:05");
  });

  it("shows the playback speed while playing, and the offset from now when paused", () => {
    const fmt = new CardFormat("en", "UTC", false);
    expect(fmt.dateLine(t, { ...base, playing: true, speed: "year" }).tag).toBe("1 YEAR/S");
    const later = t + 91 * 86_400_000;
    expect(fmt.dateLine(later, base).tag).toBe("IN 3 MONTHS");
  });

  it("uses the user's time zone for the calendar date", () => {
    // 23:30 UTC is already the next day in Vienna.
    const late = Date.UTC(2026, 8, 26, 23, 30);
    expect(new CardFormat("en", "Europe/Vienna", false).isoDate(late)).toBe("2026-09-27");
    expect(new CardFormat("en", "UTC", false).isoDate(late)).toBe("2026-09-26");
  });
});

describe("CardFormat numbers", () => {
  it("formats AU with the locale's decimal separator", () => {
    expect(new CardFormat("en", "UTC", false).au(1.5)).toBe("1.50 AU");
    expect(new CardFormat("de", "UTC", false).au(1.5)).toBe("1,50 AE");
  });

  it("switches light time from minutes to hours past 90 minutes", () => {
    const fmt = new CardFormat("en", "UTC", false);
    expect(fmt.lightTime(5)).toBe("42 min");
    expect(fmt.lightTime(30)).toBe("4.2 h");
  });
});

describe("profile settings", () => {
  it("follows the server zone only when the profile asks for it", () => {
    const config = { time_zone: "Europe/Vienna" };
    expect(resolveTimeZone({ locale: { time_zone: "server" }, config })).toBe("Europe/Vienna");
    expect(resolveTimeZone({ locale: { time_zone: "local" }, config })).toBeUndefined();
    expect(resolveTimeZone(undefined)).toBeUndefined();
  });

  it("maps the 12/24-hour setting", () => {
    expect(resolveHour12({ locale: { time_format: "12" } })).toBe(true);
    expect(resolveHour12({ locale: { time_format: "24" } })).toBe(false);
    expect(resolveHour12({ locale: { time_format: "language" } })).toBeUndefined();
  });
});
