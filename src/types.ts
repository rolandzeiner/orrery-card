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

/** Marker every card config extends. */
export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export type DistanceScale = "log" | "sqrt" | "true";
export type OpeningView = "all" | "inner";
export type Appearance = "space" | "theme";
/** Colour scheme. `ha` takes the accents from the active HA theme. */
export type ColorTheme = "vibe" | "ha" | "kenobi" | "spock";

/** The YAML the user writes. Every key is optional. */
export interface OrreryCardConfig extends LovelaceCardConfig {
  title?: string;
  /** How planet distances are compressed. Default `log`. */
  scale?: DistanceScale;
  /** Orbit-tilt multiplier, 1 (true) to 8. Default 1. */
  tilt?: number;
  /** Zoom the card opens at. Default `all`. */
  view?: OpeningView;
  /** `space` paints its own dark sky; `theme` follows the HA theme. */
  appearance?: Appearance;
  /** Colour scheme for planets, the Sun and the controls. Default `vibe`. */
  color_theme?: ColorTheme;
  show_controls?: boolean;
  show_date?: boolean;
  show_readouts?: boolean;
  show_labels?: boolean;
  show_ticks?: boolean;
  show_trails?: boolean;
  show_belt?: boolean;
  show_moon?: boolean;
  /** Slowly rotate the Sun. Off under prefers-reduced-motion regardless. */
  ambient_motion?: boolean;
}

/** `OrreryCardConfig` after defaults — every field present. */
export interface ResolvedConfig {
  title: string;
  scale: DistanceScale;
  tilt: number;
  view: OpeningView;
  appearance: Appearance;
  colorTheme: ColorTheme;
  showControls: boolean;
  showDate: boolean;
  showReadouts: boolean;
  showLabels: boolean;
  showTicks: boolean;
  showTrails: boolean;
  showBelt: boolean;
  showMoon: boolean;
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
export type HaFormSchema =
  | HaFormSelectorSchema
  | HaFormGridSchema
  | HaFormExpandableSchema;

