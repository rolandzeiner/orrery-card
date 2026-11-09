import { Observer } from "astronomy-engine";

import type { HomeAssistant } from "../types";

/** The home location set in Home Assistant (Settings → System → General). */
export interface HomeLocation {
  latitude: number;
  longitude: number;
  /** Metres above sea level. */
  elevation: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The home location HA reports, or null when there is none the engine
 *  can use. */
export function resolveHome(hass: HomeAssistant | undefined): HomeLocation | null {
  const lat = hass?.config?.latitude;
  const lon = hass?.config?.longitude;
  const elevation = hass?.config?.elevation;
  if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon, elevation: finite(elevation) ? elevation : 0 };
}

export const observerAt = (home: HomeLocation): Observer =>
  new Observer(home.latitude, home.longitude, home.elevation);
