/**
 * Solar and lunar eclipses: finding the one before or after a moment, and
 * how one looks from the HA home.
 *
 * Astronomy Engine only searches forwards, so the previous eclipse is the
 * last one a forward search finds in a window before the moment. From
 * 1795 to 2205 no two eclipses of either kind are more than 163 days
 * apart, so a 200-day window always holds one.
 */
import {
  Body,
  Equator,
  Horizon,
  NextGlobalSolarEclipse,
  NextLunarEclipse,
  SearchGlobalSolarEclipse,
  SearchLocalSolarEclipse,
  SearchLunarEclipse,
  type AstroTime,
} from "astronomy-engine";

import { DAY_MS, MAX_TIME, MIN_TIME } from "../const";
import { observerAt, type HomeLocation } from "./home";

export type EclipseBody = "solar" | "lunar";
/** Astronomy Engine's EclipseKind values. */
export type EclipseType = "penumbral" | "partial" | "annular" | "total";

export interface Eclipse {
  body: EclipseBody;
  type: EclipseType;
  /** Greatest eclipse, Unix ms. */
  peak: number;
  /** Lunar only: half the length of the partial phase, or of the faint
   *  penumbral one where there is none, in minutes. */
  halfMinutes?: number;
}

/**
 * How an eclipse looks from home. `seen`: under way with the Sun (solar)
 * or the Moon (lunar) above the horizon at its peak. `sets` / `rises`: the
 * body sets or rises while it is under way. `unseen`: not at all.
 */
export type HomeVisibility = "seen" | "sets" | "rises" | "unseen";

export interface HomeView {
  visibility: HomeVisibility;
  /** Solar only, when seen: how it looks there (often partial where the
   *  eclipse is total elsewhere), and the share of the Sun's disc the Moon
   *  covers at its deepest, 0–1. */
  type?: EclipseType;
  obscuration?: number;
}

const LOOKBACK = 200 * DAY_MS;
/** Steps past the eclipse the card already stands on. */
const NUDGE = 60_000;

const ms = (time: AstroTime): number => time.date.getTime();

interface Series {
  first(from: number): Eclipse;
  next(after: Eclipse): Eclipse;
}

const SOLAR: Series = {
  first: (from) => solar(SearchGlobalSolarEclipse(new Date(from))),
  next: (after) => solar(NextGlobalSolarEclipse(new Date(after.peak))),
};

const LUNAR: Series = {
  first: (from) => lunar(SearchLunarEclipse(new Date(from))),
  next: (after) => lunar(NextLunarEclipse(new Date(after.peak))),
};

function solar(e: { kind: string; peak: AstroTime }): Eclipse {
  return { body: "solar", type: e.kind as EclipseType, peak: ms(e.peak) };
}

function lunar(e: {
  kind: string;
  peak: AstroTime;
  sd_partial: number;
  sd_penum: number;
}): Eclipse {
  return {
    body: "lunar",
    type: e.kind as EclipseType,
    peak: ms(e.peak),
    halfMinutes: e.sd_partial > 0 ? e.sd_partial : e.sd_penum,
  };
}

/** The first eclipse of either kind after `t`, or null past the range the
 *  card can show. */
export function nextEclipse(t: number): Eclipse | null {
  const after = t + NUDGE;
  const a = firstAfter(SOLAR, after);
  const b = firstAfter(LUNAR, after);
  const e = a.peak <= b.peak ? a : b;
  return e.peak <= MAX_TIME ? e : null;
}

/** The first eclipse in `series` that peaks after `after`. The engine
 *  searches from the first new or full moon after the time it's given,
 *  but an eclipse can peak before that moment: searching from just past
 *  a peak finds the same eclipse again, so step on until it is later. */
function firstAfter(series: Series, after: number): Eclipse {
  let e = series.first(after);
  while (e.peak <= after) e = series.next(e);
  return e;
}

/** The last eclipse of either kind before `t`, or null before the range
 *  the card can show. */
export function previousEclipse(t: number): Eclipse | null {
  const before = t - NUDGE;
  const found = [lastBefore(SOLAR, before), lastBefore(LUNAR, before)].filter(
    (e): e is Eclipse => e !== null,
  );
  const e = found.reduce<Eclipse | null>(
    (best, x) => (best && best.peak > x.peak ? best : x),
    null,
  );
  return e && e.peak >= MIN_TIME ? e : null;
}

function lastBefore(series: Series, before: number): Eclipse | null {
  let last: Eclipse | null = null;
  for (let e = series.first(before - LOOKBACK); e.peak < before; e = series.next(e)) last = e;
  return last;
}

/** How `e` looks from `home`. */
export function homeView(e: Eclipse, home: HomeLocation): HomeView {
  return e.body === "solar" ? solarFromHome(e, home) : lunarFromHome(e, home);
}

function solarFromHome(e: Eclipse, home: HomeLocation): HomeView {
  const local = SearchLocalSolarEclipse(new Date(e.peak - DAY_MS), observerAt(home));
  // The local search skips eclipses home can't see, so a peak far from
  // this one belongs to a later eclipse.
  if (Math.abs(ms(local.peak.time) - e.peak) > DAY_MS / 2) return { visibility: "unseen" };
  const visibility = horizonCase(
    local.partial_begin.altitude,
    local.peak.altitude,
    local.partial_end.altitude,
  );
  return visibility === "seen"
    ? { visibility, type: local.kind, obscuration: local.obscuration }
    : { visibility };
}

function lunarFromHome(e: Eclipse, home: HomeLocation): HomeView {
  const observer = observerAt(home);
  const altitude = (t: number): number => {
    const date = new Date(t);
    const eq = Equator(Body.Moon, date, observer, true, true);
    return Horizon(date, observer, eq.ra, eq.dec).altitude;
  };
  const half = (e.halfMinutes ?? 0) * 60_000;
  return {
    visibility: horizonCase(altitude(e.peak - half), altitude(e.peak), altitude(e.peak + half)),
  };
}

/** Seen, setting, rising or unseen, from the body's altitude (degrees) at
 *  the start, the peak and the end. */
function horizonCase(start: number, peak: number, end: number): HomeVisibility {
  if (peak > 0) return "seen";
  if (start > 0) return "sets";
  if (end > 0) return "rises";
  return "unseen";
}
