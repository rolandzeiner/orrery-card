import type { PlanetKey } from "./astro/bodies";
import { lightSeconds, type SkySnapshot } from "./astro/ephemeris";
import { DAY_MS } from "./const";
import { localize } from "./localize/localize";
import type { DateLine, GaugeReading, Texts } from "./render/renderer";
import type { HomeAssistant } from "./types";

export const SPEEDS = [
  { key: "back_year", days: -365.25 },
  { key: "back_month", days: -30.44 },
  { key: "back_week", days: -7 },
  { key: "day", days: 1 },
  { key: "week", days: 7 },
  { key: "month", days: 30.44 },
  { key: "year", days: 365.25 },
  { key: "decade", days: 3652.5 },
] as const;
export type SpeedKey = (typeof SPEEDS)[number]["key"];
export const DEFAULT_SPEED: SpeedKey = "month";

/** Ranges the corner arcs fill across — each quantity's real extremes. */
const RANGES = {
  sunEarth: [0.9833, 1.0167],
  earthMars: [0.372, 2.675],
  earthJupiter: [3.95, 6.46],
} as const;

const fraction = (v: number, [lo, hi]: readonly [number, number]): number => (v - lo) / (hi - lo);

/** The user's time zone per their HA profile: "server" means the HA
 *  instance's zone; anything else (the default "local") the browser's. */
export function resolveTimeZone(hass: HomeAssistant | undefined): string | undefined {
  if (hass?.locale?.time_zone === "server" && hass.config?.time_zone) return hass.config.time_zone;
  return undefined;
}

/** HA's 12/24-hour profile setting → Intl's hour12 (undefined = locale). */
export function resolveHour12(hass: HomeAssistant | undefined): boolean | undefined {
  const pref = hass?.locale?.time_format;
  if (pref === "12") return true;
  if (pref === "24") return false;
  return undefined;
}

const clean = (s: string): string => s.replace(/\./g, "").toLocaleUpperCase();

/** Everything the card writes, localised for one language, time zone and
 *  clock setting. Rebuilt only when one of those changes. */
export class CardFormat implements Texts {
  private readonly months: string[];
  private readonly parts: Intl.DateTimeFormat;
  private readonly time: Intl.DateTimeFormat;
  private readonly weekday: Intl.DateTimeFormat;
  private readonly iso: Intl.DateTimeFormat;
  private readonly relative: Intl.RelativeTimeFormat;
  private readonly numbers = new Map<number, Intl.NumberFormat>();
  private readonly percent: Intl.NumberFormat;

  constructor(
    readonly lang: string,
    readonly timeZone: string | undefined,
    hour12: boolean | undefined,
  ) {
    const tz = timeZone ? { timeZone } : {};
    const monthFmt = new Intl.DateTimeFormat(lang, { month: "short", timeZone: "UTC" });
    this.months = Array.from({ length: 12 }, (_, m) => clean(monthFmt.format(Date.UTC(2001, m, 15))));
    this.parts = new Intl.DateTimeFormat("en-US", { ...tz, year: "numeric", month: "numeric", day: "numeric" });
    this.time = new Intl.DateTimeFormat(lang, {
      ...tz,
      hour: "numeric",
      minute: "2-digit",
      ...(hour12 === undefined ? {} : { hour12 }),
    });
    this.weekday = new Intl.DateTimeFormat(lang, { ...tz, weekday: "short" });
    this.iso = new Intl.DateTimeFormat("en-CA", { ...tz, year: "numeric", month: "2-digit", day: "2-digit" });
    this.relative = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
    this.percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 });
  }

  t(key: string, vars?: Record<string, string | number>): string {
    return localize(key, this.lang, vars);
  }

  num(value: number, digits: number): string {
    let f = this.numbers.get(digits);
    if (!f) {
      f = new Intl.NumberFormat(this.lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
      this.numbers.set(digits, f);
    }
    return f.format(value);
  }

  au(value: number, digits = 2): string {
    return this.t("card.au", { value: this.num(value, digits) });
  }

  /** Light travel time for a distance, as "14 min" or "1.3 h". */
  lightTime(au: number): string {
    const minutes = lightSeconds(au) / 60;
    return minutes >= 90
      ? this.t("card.hours", { value: this.num(minutes / 60, 1) })
      : this.t("card.minutes", { value: this.num(Math.round(minutes), 0) });
  }

  /** Calendar date in the user's zone: [year, month 1-12, day]. */
  ymd(t: number): [number, number, number] {
    let y = 0;
    let m = 0;
    let d = 0;
    for (const part of this.parts.formatToParts(t)) {
      if (part.type === "year") y = Number(part.value);
      else if (part.type === "month") m = Number(part.value);
      else if (part.type === "day") d = Number(part.value);
    }
    return [y, m, d];
  }

  /** yyyy-mm-dd in the user's zone, for the date input. */
  isoDate(t: number): string {
    return this.iso.format(t);
  }

  monthLabel(month: number): string {
    return this.months[month] ?? "";
  }

  planetLabel(key: PlanetKey): string {
    return this.planetName(key).toLocaleUpperCase(this.lang);
  }

  planetName(key: PlanetKey): string {
    return this.t(`planet.${key}`);
  }

  speedLabel(key: SpeedKey): string {
    return this.t(`speed.${key}`);
  }

  /** "in 3 months", "2 years ago" — how far the shown date is from now. */
  offset(t: number, now: number): string {
    const days = (t - now) / DAY_MS;
    const abs = Math.abs(days);
    if (abs < 45) return this.relative.format(Math.round(days), "day");
    if (abs < 730) return this.relative.format(Math.round(days / 30.44), "month");
    return this.relative.format(Math.round(days / 365.25), "year");
  }

  dateLine(t: number, state: { live: boolean; playing: boolean; speed: SpeedKey; now: number }): DateLine {
    const [year, month, day] = this.ymd(t);
    const tag = state.live
      ? this.t("card.live")
      : state.playing
        ? this.speedLabel(state.speed)
        : this.offset(t, state.now);
    return {
      big: `${String(day).padStart(2, "0")} ${this.monthLabel(month - 1)} ${year}`,
      sub: `${clean(this.weekday.format(t))} · ${this.time.format(t)}`,
      tag: tag.toLocaleUpperCase(this.lang),
      tagIsLive: state.live,
      monthKey: year * 12 + (month - 1),
      year,
    };
  }

  gauges(sky: SkySnapshot): ReadonlyArray<GaugeReading> {
    const lightS = lightSeconds(sky.earthSunAu);
    const phase = sky.moonPhase;
    const moonWord =
      phase < 8 || phase > 352
        ? "gauge.new"
        : Math.abs(phase - 180) < 8
          ? "gauge.full"
          : phase < 180
            ? "gauge.waxing"
            : "gauge.waning";
    const upper = (key: string): string => this.t(key).toLocaleUpperCase(this.lang);
    return [
      {
        label: upper("gauge.moon"),
        value: this.percent.format(sky.moonLit),
        detail: this.t(moonWord),
        fraction: sky.moonLit,
        tone: "accent2",
      },
      {
        label: upper("gauge.sun_earth"),
        value: this.au(sky.earthSunAu, 3),
        detail: this.t("card.light_time", {
          min: Math.floor(lightS / 60),
          sec: Math.round(lightS % 60),
        }),
        fraction: fraction(sky.earthSunAu, RANGES.sunEarth),
        tone: "accent",
      },
      {
        label: upper("gauge.earth_mars"),
        value: this.au(sky.earthMarsAu),
        detail: this.t("card.light_minutes", { value: Math.round(lightSeconds(sky.earthMarsAu) / 60) }),
        fraction: fraction(sky.earthMarsAu, RANGES.earthMars),
        tone: "accent",
      },
      {
        label: upper("gauge.earth_jupiter"),
        value: this.au(sky.earthJupiterAu),
        detail: this.t("card.light_minutes", { value: Math.round(lightSeconds(sky.earthJupiterAu) / 60) }),
        fraction: fraction(sky.earthJupiterAu, RANGES.earthJupiter),
        tone: "accent2",
      },
    ];
  }
}
