/**
 * What the visual editor shows, as plain data.
 *
 * Kept apart from the editor element so a node test can read it: the guard
 * in editor-fields.test.ts fails when an option has no field here, which
 * is how a new option would end up YAML-only.
 *
 * Three tiers, the house layout for an editor past about ten options: the
 * title and the two colour choices bare at the top, then one collapsed
 * group per concern, each saying in its header what it is set to. Groups
 * and the fields inside them run from the option people change most to
 * the one they change least.
 */
import {
  APPEARANCES,
  COLOR_THEMES,
  DEFAULTS,
  resolveConfig,
  SCALES,
  TILT_MAX,
  TILT_MIN,
  VIEWS,
} from "./config";
import { tileImage } from "./editor-art";
import type { HaFormSchema, HASelector, ResolvedConfig } from "./types";

/** Every option the editor offers, keyed as the user writes it in YAML.
 *  editor-fields.test.ts checks this list against YAML_DEFAULTS. */
export type FieldName =
  | "title"
  | "scale"
  | "tilt"
  | "view"
  | "appearance"
  | "color_theme"
  | "show_controls"
  | "show_date"
  | "show_readouts"
  | "show_labels"
  | "show_ticks"
  | "show_trails"
  | "show_belt"
  | "show_moon"
  | "show_pluto"
  | "ambient_motion";

export interface EditorField {
  name: FieldName;
  selector: HASelector;
}

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const toggle = (name: FieldName): EditorField => ({ name, selector: { boolean: {} } });

function select(name: FieldName, values: ReadonlyArray<string>, t: Translate): EditorField {
  return {
    name,
    selector: {
      select: {
        mode: "dropdown",
        options: values.map((v) => ({ value: v, label: t(`editor.${name}_${v}`) })),
      },
    },
  };
}

/** The config as the editor reads it. A config the card would reject
 *  still gets an editor, drawn with the defaults. */
export function resolved(config: Record<string, unknown>): ResolvedConfig {
  try {
    return resolveConfig(config);
  } catch {
    return DEFAULTS;
  }
}

/**
 * The top tier. Colour theme and background are pictures, not names: each
 * tile is the card in that choice, and the theme tiles are drawn on the
 * background that is chosen, so the two together show what the card will
 * look like.
 */
export function topFields(config: Record<string, unknown>, t: Translate): EditorField[] {
  const { appearance, colorTheme } = resolved(config);
  return [
    { name: "title", selector: { text: {} } },
    {
      name: "color_theme",
      selector: {
        select: {
          mode: "box",
          box_max_columns: 2,
          options: COLOR_THEMES.map((theme) => ({
            value: theme,
            label: t(`editor.color_theme_${theme}`),
            image: tileImage(theme, appearance),
          })),
        },
      },
    },
    {
      name: "appearance",
      selector: {
        select: {
          mode: "box",
          box_max_columns: 2,
          options: APPEARANCES.map((look) => ({
            value: look,
            label: t(`editor.appearance_${look}`),
            image: tileImage(colorTheme, look),
          })),
        },
      },
    },
  ];
}

export type GroupId = "sky" | "view" | "controls";

export interface Group {
  id: GroupId;
  icon: string;
  /** The fields most people change. */
  common: (t: Translate) => EditorField[];
  /** The rest, below a divider in the same group. */
  more: EditorField[];
}

export const GROUPS: readonly Group[] = [
  {
    id: "sky",
    icon: "mdi:orbit",
    common: () => [
      toggle("show_pluto"),
      toggle("show_labels"),
      toggle("show_trails"),
      toggle("show_moon"),
    ],
    more: [toggle("show_belt"), toggle("show_ticks"), toggle("ambient_motion")],
  },
  {
    id: "view",
    icon: "mdi:telescope",
    common: (t) => [
      select("scale", SCALES, t),
      select("view", VIEWS, t),
      {
        name: "tilt",
        selector: { number: { min: TILT_MIN, max: TILT_MAX, step: 0.5, mode: "slider" } },
      },
    ],
    more: [],
  },
  {
    id: "controls",
    icon: "mdi:gesture-tap-button",
    common: () => [toggle("show_controls"), toggle("show_date"), toggle("show_readouts")],
    more: [],
  },
];

/** What a field draws in ha-form. */
export const schemaOf = (fields: readonly EditorField[]): HaFormSchema[] =>
  fields.map(({ name, selector }) => ({ name, selector }));

/**
 * The groups as ha-form expandables, for the moment before Home Assistant
 * has loaded ha-expansion-panel (it loads it lazily, and an expandable is
 * what pulls it in). No summary line there, but every option is reachable.
 */
export function fallbackSchema(t: Translate): HaFormSchema[] {
  return GROUPS.map((group) => ({
    type: "expandable",
    name: group.id,
    title: t(`editor.groups.${group.id}`),
    icon: group.icon,
    // Without flatten, ha-form nests the values under the group's name and
    // the card, which reads a flat config, never sees them.
    flatten: true,
    schema: schemaOf([...group.common(t), ...group.more]),
  }));
}

/** The sky's layers, in the order a summary names the hidden ones. */
const SKY_LAYERS = [
  ["show_pluto", "showPluto"],
  ["show_labels", "showLabels"],
  ["show_trails", "showTrails"],
  ["show_moon", "showMoon"],
  ["show_belt", "showBelt"],
  ["show_ticks", "showTicks"],
] as const satisfies ReadonlyArray<readonly [FieldName, keyof ResolvedConfig]>;

const CONTROLS = [
  ["show_controls", "showControls"],
  ["show_date", "showDate"],
  ["show_readouts", "showReadouts"],
] as const satisfies ReadonlyArray<readonly [FieldName, keyof ResolvedConfig]>;

/**
 * The line under a collapsed group: what it is set to, so nobody has to
 * open a panel to find out. The sky names what is hidden rather than what
 * is shown, since by default almost everything is.
 */
export function groupSummary(
  id: GroupId,
  config: Record<string, unknown>,
  t: Translate,
  lang: string,
): string {
  const c = resolved(config);
  switch (id) {
    case "sky": {
      const hidden = SKY_LAYERS.filter(([, key]) => !c[key]).map(([name]) =>
        t(`editor.summary.${name}`),
      );
      const [a = "", b = ""] = hidden;
      const layers =
        hidden.length === 0
          ? t("editor.summary.all_shown")
          : hidden.length === 1
            ? t("editor.summary.without_one", { a })
            : hidden.length === 2
              ? t("editor.summary.without_two", { a, b })
              : t("editor.summary.shown_count", {
                  n: SKY_LAYERS.length - hidden.length,
                  total: SKY_LAYERS.length,
                });
      return c.ambientMotion ? layers : `${layers} · ${t("editor.summary.sun_still")}`;
    }
    case "view": {
      const tilt =
        c.tilt === DEFAULTS.tilt
          ? t("editor.summary.tilt_real")
          : t("editor.summary.tilt", { n: new Intl.NumberFormat(lang).format(c.tilt) });
      return [t(`editor.summary.scale_${c.scale}`), t(`editor.view_${c.view}`), tilt].join(" · ");
    }
    case "controls": {
      const shown = CONTROLS.filter(([, key]) => c[key]).map(([name]) =>
        t(`editor.summary.${name}`),
      );
      return shown.length > 0 ? shown.join(" · ") : t("editor.summary.all_hidden");
    }
  }
}
