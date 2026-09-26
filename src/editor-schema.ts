import { SCALES, TILT_MAX, TILT_MIN } from "./config";
import type { HaFormSchema } from "./types";

export const FLAG_FIELDS = [
  "show_controls",
  "show_date",
  "show_readouts",
  "show_labels",
  "show_ticks",
  "show_trails",
  "show_belt",
  "show_moon",
] as const;

export function buildSchema(t: (key: string) => string): ReadonlyArray<HaFormSchema> {
  const select = (name: string, values: ReadonlyArray<string>): HaFormSchema => ({
    name,
    selector: {
      select: { mode: "dropdown", options: values.map((v) => ({ value: v, label: t(`${name}_${v}`) })) },
    },
  });
  return [
    { name: "title", selector: { text: {} } },
    select("scale", SCALES),
    { name: "tilt", selector: { number: { min: TILT_MIN, max: TILT_MAX, step: 0.5, mode: "slider" } } },
    { type: "grid", name: "", schema: [select("view", ["all", "inner"]), select("appearance", ["space", "theme"])] },
    {
      type: "expandable",
      name: "layers",
      title: t("layers"),
      // Without flatten, ha-form nests these under data.layers and the
      // card never sees them (ha-lovelace-card, expandable footgun).
      flatten: true,
      schema: [
        { type: "grid", name: "", schema: FLAG_FIELDS.map((name) => ({ name, selector: { boolean: {} } })) },
        { name: "ambient_motion", selector: { boolean: {} } },
      ],
    },
  ];
}
