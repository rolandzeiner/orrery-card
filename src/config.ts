import type {
  Appearance,
  ColorTheme,
  DistanceScale,
  OpeningView,
  ResolvedConfig,
} from "./types";

export const TILT_MIN = 1;
export const TILT_MAX = 8;

export const SCALES: ReadonlyArray<DistanceScale> = ["log", "sqrt", "true"];
export const VIEWS: ReadonlyArray<OpeningView> = ["all", "inner"];
export const APPEARANCES: ReadonlyArray<Appearance> = ["space", "theme"];
export const COLOR_THEMES: ReadonlyArray<ColorTheme> = ["vibe", "ha", "kenobi", "spock"];

export const DEFAULTS: ResolvedConfig = {
  title: "",
  scale: "log",
  tilt: 1,
  view: "all",
  appearance: "space",
  colorTheme: "vibe",
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
  if (isUnset(value)) return fallback;
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
  return {
    ...DEFAULTS,
    title: parseTitle(cfg.title),
    scale: oneOf(cfg, "scale", SCALES, DEFAULTS.scale),
    tilt: parseTilt(cfg.tilt),
    view: oneOf(cfg, "view", VIEWS, DEFAULTS.view),
    appearance: oneOf(cfg, "appearance", APPEARANCES, DEFAULTS.appearance),
    colorTheme: oneOf(cfg, "color_theme", COLOR_THEMES, DEFAULTS.colorTheme),
    ...parseFlags(cfg),
  };
}

const isUnset = (value: unknown): boolean => value === undefined || value === null || value === "";

function parseTitle(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error('"title" must be text.');
  return value.trim();
}

function parseTilt(value: unknown): number {
  if (isUnset(value)) return DEFAULTS.tilt;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < TILT_MIN || n > TILT_MAX) {
    throw new Error(`"tilt" must be a number from ${TILT_MIN} to ${TILT_MAX}.`);
  }
  return n;
}

type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];

function parseFlags(cfg: Record<string, unknown>): Partial<Record<FlagKey, boolean>> {
  const out: Partial<Record<FlagKey, boolean>> = {};
  for (const [yamlKey, key] of Object.entries(FLAGS)) {
    const value = cfg[yamlKey];
    if (value === undefined || value === null) continue;
    if (typeof value !== "boolean") throw new Error(`"${yamlKey}" must be true or false.`);
    out[key] = value;
  }
  return out;
}

/** Every option's default, keyed as the user writes it in YAML. */
export const YAML_DEFAULTS: Readonly<Record<string, string | number | boolean>> = {
  scale: DEFAULTS.scale,
  tilt: DEFAULTS.tilt,
  view: DEFAULTS.view,
  appearance: DEFAULTS.appearance,
  color_theme: DEFAULTS.colorTheme,
  ...Object.fromEntries(Object.entries(FLAGS).map(([yamlKey, key]) => [yamlKey, DEFAULTS[key]])),
};

/** The config as the editor should show it: every option present, so a
 *  toggle that defaults to on is drawn on and a dropdown isn't blank.
 *  (ha-form draws a missing boolean as off, and a dropdown selector
 *  ignores `default` altogether.) */
export function withDefaults(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...YAML_DEFAULTS };
  for (const [key, value] of Object.entries(config)) {
    // An unset value falls back to the default instead of blanking it out.
    if (!isUnset(value)) out[key] = value;
  }
  return out;
}

/** The config as it should be saved: only what differs from the defaults,
 *  with `type` first, so the YAML stays as short as the user wrote it. */
export function tidyConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    // "" is what a cleared text field or dropdown hands back.
    if (isUnset(value)) continue;
    if (key in YAML_DEFAULTS && YAML_DEFAULTS[key] === value) continue;
    out[key] = value;
  }
  const { type, ...rest } = out;
  return type === undefined ? rest : { type, ...rest };
}
