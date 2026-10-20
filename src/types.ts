/** Minimal HA shape — only the fields this card touches. */
export interface HomeAssistant {
  /** Modern HA exposes the user's profile settings here; older versions only
   *  had top-level `language`. Read both with `??` fallback. */
  locale?: {
    language?: string;
    /** "language" | "system" | "12" | "24" */
    time_format?: string;
    /** "local" | "server" */
    time_zone?: string;
  } & Record<string, unknown>;
  language?: string;
  themes?: { darkMode?: boolean; theme?: string } & Record<string, unknown>;
  selectedTheme?: { theme?: string; dark?: boolean } | null;
  config?: { time_zone?: string } & Record<string, unknown>;
}

export type DistanceScale = "log" | "sqrt" | "true";
export type OpeningView = "all" | "inner";
export type Appearance = "space" | "theme";
/** Colour scheme. `ha` takes the accents from the active HA theme. */
export type ColorTheme = "vibe" | "ha" | "kenobi" | "spock";

/** The card's config after defaults, every field present. Built from the
 *  user's YAML by `resolveConfig`; `YAML_DEFAULTS` in config.ts lists the
 *  snake_case YAML keys, and `DEFAULTS` there holds the defaults. */
export interface ResolvedConfig {
  title: string;
  /** How planet distances are compressed. */
  scale: DistanceScale;
  /** Orbit-tilt multiplier, 1 (true) to 8. */
  tilt: number;
  /** Zoom the card opens at. */
  view: OpeningView;
  /** `space` paints its own dark sky; `theme` follows the HA theme. */
  appearance: Appearance;
  /** Colour scheme for planets, the Sun and the controls. */
  colorTheme: ColorTheme;
  showControls: boolean;
  showDate: boolean;
  showReadouts: boolean;
  showLabels: boolean;
  showTicks: boolean;
  showTrails: boolean;
  showBelt: boolean;
  showMoon: boolean;
  /** Draw Pluto, the dwarf planet. */
  showPluto: boolean;
  /** Slowly rotate the Sun. Off under prefers-reduced-motion regardless. */
  ambientMotion: boolean;
}

// ── ha-form schema (for getConfigForm) ──────────────────────────────────
// Subset of HA selector keys; canonical list lives in HA frontend
// src/data/selector.ts.
export type HASelector =
  | { boolean: Record<string, never> }
  | { text: Record<string, never> }
  | {
      number: {
        min?: number;
        max?: number;
        step?: number;
        mode?: "box" | "slider";
      };
    }
  | {
      select: {
        mode?: "dropdown" | "list";
        options: ReadonlyArray<{ value: string; label: string }>;
      };
    };

export interface HaFormSelectorSchema {
  name: string;
  required?: boolean;
  selector: HASelector;
}
export interface HaFormGridSchema {
  type: "grid";
  name: "";
  schema: ReadonlyArray<HaFormSchema>;
}
export interface HaFormExpandableSchema {
  type: "expandable";
  name: string;
  title?: string;
  /** REQUIRED for flat config shapes. Without it, ha-form nests the inner
   *  values under `data[name]` and the card silently misses them. */
  flatten?: boolean;
  schema: ReadonlyArray<HaFormSchema>;
}
export type HaFormSchema = HaFormSelectorSchema | HaFormGridSchema | HaFormExpandableSchema;
