import { describe, expect, it } from "vite-plus/test";

import { YAML_DEFAULTS } from "../src/config";
import {
  type EditorField,
  fallbackSchema,
  GROUPS,
  groupSummary,
  topFields,
  type Translate,
} from "../src/editor-fields";
import { tileImage } from "../src/editor-art";
import { localize } from "../src/localize/localize";
import { sorted } from "../src/sorted";
import editorSource from "../src/editor.ts?raw";

const tr =
  (lang: string): Translate =>
  (key, vars) =>
    localize(key, lang, vars);
const en = tr("en");

function allFields(t: Translate, config: Record<string, unknown> = {}): EditorField[] {
  return [...topFields(config, t), ...GROUPS.flatMap((g) => [...g.common(t), ...g.more])];
}

describe("editor fields", () => {
  it("offers every option exactly once", () => {
    const names = allFields(en).map((f) => f.name);
    expect(sorted(names)).toEqual(sorted(["title", ...Object.keys(YAML_DEFAULTS)]));
  });

  for (const lang of ["en", "de"]) {
    const t = tr(lang);
    it(`labels every field, option and group (${lang})`, () => {
      for (const f of allFields(t)) {
        expect(t(`editor.${f.name}`), f.name).not.toMatch(/^editor\./);
        if ("select" in f.selector)
          for (const o of f.selector.select.options)
            expect(o.label, `${f.name}=${o.value}`).not.toMatch(/^editor\./);
      }
      for (const g of GROUPS) expect(t(`editor.groups.${g.id}`)).not.toMatch(/^editor\./);
    });

    it(`summarises every group in words, never keys (${lang})`, () => {
      const configs = [
        {},
        { show_pluto: true, ambient_motion: false, tilt: 2.5, scale: "true", view: "inner" },
        { show_labels: false, show_moon: false, show_belt: false, show_controls: false },
      ];
      for (const config of configs)
        for (const g of GROUPS) {
          const line = groupSummary(g.id, config, t, lang);
          expect(line, `${g.id} ${JSON.stringify(config)}`).not.toMatch(/editor\.|\{/);
        }
    });
  }

  it("draws colour theme and background as picture tiles", () => {
    const [, theme, look] = topFields({}, en);
    for (const f of [theme, look]) {
      if (!f || !("select" in f.selector)) throw new Error("not a select");
      expect(f.selector.select.mode).toBe("box");
      for (const o of f.selector.select.options) expect(o.image).toBeDefined();
    }
  });

  it("draws the theme tiles on the chosen background", () => {
    const [, onSpace] = topFields({}, en);
    const [, onTheme] = topFields({ appearance: "theme" }, en);
    const image = (f: EditorField | undefined): unknown =>
      f && "select" in f.selector ? f.selector.select.options[0]?.image : undefined;
    expect(typeof image(onSpace)).toBe("string");
    expect(image(onTheme)).toEqual(tileImage("vibe", "theme"));
  });

  it("gives the theme background a light and a dark picture", () => {
    const img = tileImage("kenobi", "theme");
    if (typeof img === "string") throw new Error("expected src + src_dark");
    expect(img.src).toMatch(/^data:image\/svg\+xml,/);
    expect(img.src_dark).not.toBe(img.src);
    expect(decodeURIComponent(tileImage("spock", "space") as string)).toContain("#ff9900");
  });

  it("flattens the fallback groups so their toggles stay top-level", () => {
    for (const g of fallbackSchema(en)) expect("flatten" in g && g.flatten).toBe(true);
  });
});

describe("group summaries", () => {
  const line = (id: "sky" | "view" | "controls", config: Record<string, unknown> = {}): string =>
    groupSummary(id, config, en, "en");

  it("names what the sky hides", () => {
    expect(line("sky")).toBe("Without Pluto");
    expect(line("sky", { show_pluto: true })).toBe("Everything shown");
    expect(line("sky", { show_moon: false })).toBe("Without Pluto and the Moon");
    expect(line("sky", { show_moon: false, show_trails: false })).toBe("3 of 6 layers shown");
    expect(line("sky", { show_pluto: true, ambient_motion: false })).toBe(
      "Everything shown · Sun at rest",
    );
  });

  it("states the view", () => {
    expect(line("view")).toBe("Log scale · All planets · Real tilt");
    expect(line("view", { scale: "true", view: "inner", tilt: 2.5 })).toBe(
      "True to scale · Inner planets · Tilt ×2.5",
    );
    expect(groupSummary("view", { tilt: 2.5 }, tr("de"), "de")).toBe(
      "Log-Skala · Alle Planeten · Neigung ×2,5",
    );
  });

  it("lists the controls and readouts that are on", () => {
    expect(line("controls")).toBe("Time controls · Date · Readouts");
    expect(line("controls", { show_date: false })).toBe("Time controls · Readouts");
    expect(line("controls", { show_controls: false, show_date: false, show_readouts: false })).toBe(
      "All hidden",
    );
  });

  it("falls back to the defaults for a config the card would reject", () => {
    expect(line("view", { scale: "huge" })).toBe("Log scale · All planets · Real tilt");
  });
});

describe("editor source", () => {
  it("never binds the panels' expanded state", () => {
    // Bound, the panel's body keeps a pixel height and spills over the
    // panels below (ha-lovelace-card, editor-composition.md).
    expect(editorSource).not.toMatch(/\.expanded=|\?expanded=/);
  });
});
