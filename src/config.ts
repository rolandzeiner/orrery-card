import type {
  Appearance,
  DistanceScale,
  OpeningView,
  ResolvedConfig,
} from "./types";

export const TILT_MIN = 1;
export const TILT_MAX = 8;

export const SCALES: ReadonlyArray<DistanceScale> = ["log", "sqrt", "true"];
export const VIEWS: ReadonlyArray<OpeningView> = ["all", "inner"];
export const APPEARANCES: ReadonlyArray<Appearance> = ["space", "theme"];

export const DEFAULTS: ResolvedConfig = {
  title: "",
  scale: "log",
  tilt: 1,
  view: "all",
  appearance: "space",
  showControls: true,
  showDate: true,
  showReadouts: true,
  showLabels: true,
  showTicks: true,
  showTrails: true,
  showBelt: true,
  showMoon: true,
  ambientMotion: true,
};

/** YAML key → resolved key for every boolean option. */
const FLAGS = {
  show_controls: "showControls",
  show_date: "showDate",
  show_readouts: "showReadouts",
  show_labels: "showLabels",
  show_ticks: "showTicks",
  show_trails: "showTrails",
  show_belt: "showBelt",
  show_moon: "showMoon",
  ambient_motion: "ambientMotion",
} as const satisfies Record<string, keyof ResolvedConfig>;

function oneOf<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T {
  const value = raw[key];
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" && (allowed as ReadonlyArray<string>).includes(value)) {
    return value as T;
  }
  throw new Error(`"${key}" must be one of: ${allowed.join(", ")}.`);
}

/** Validate the user's YAML and fill in defaults. Throws with a message
 *  Lovelace shows verbatim on its error card, so each one names the key and
 *  the values it accepts. */
export function resolveConfig(raw: unknown): ResolvedConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("The card configuration must be a mapping of options.");
  }
  const cfg = raw as Record<string, unknown>;

  const title = cfg.title ?? "";
  if (typeof title !== "string") {
    throw new Error('"title" must be text.');
  }

  let tilt = DEFAULTS.tilt;
  if (cfg.tilt !== undefined && cfg.tilt !== null && cfg.tilt !== "") {
    const n = typeof cfg.tilt === "string" ? Number(cfg.tilt) : cfg.tilt;
    if (typeof n !== "number" || !Number.isFinite(n) || n < TILT_MIN || n > TILT_MAX) {
      throw new Error(`"tilt" must be a number from ${TILT_MIN} to ${TILT_MAX}.`);
    }
    tilt = n;
  }

  const resolved: ResolvedConfig = {
    ...DEFAULTS,
    title: title.trim(),
    scale: oneOf(cfg, "scale", SCALES, DEFAULTS.scale),
    tilt,
    view: oneOf(cfg, "view", VIEWS, DEFAULTS.view),
    appearance: oneOf(cfg, "appearance", APPEARANCES, DEFAULTS.appearance),
  };

  for (const [yamlKey, key] of Object.entries(FLAGS)) {
    const value = cfg[yamlKey];
    if (value === undefined || value === null) continue;
    if (typeof value !== "boolean") {
      throw new Error(`"${yamlKey}" must be true or false.`);
    }
    resolved[key] = value;
  }
  return resolved;
}
