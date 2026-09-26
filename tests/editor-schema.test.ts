import { describe, expect, it } from "vitest";

import { YAML_DEFAULTS } from "../src/config";
import { buildSchema } from "../src/editor-schema";
import { localize } from "../src/localize/localize";
import type { HaFormSchema } from "../src/types";

function fields(schema: ReadonlyArray<HaFormSchema>): HaFormSchema[] {
  return schema.flatMap((f) => ("schema" in f ? fields(f.schema) : [f]));
}

describe("editor schema", () => {
  for (const lang of ["en", "de"]) {
    const t = (key: string): string => localize(`editor.${key}`, lang);
    const schema = buildSchema(t);

    it(`offers a field for every option (${lang})`, () => {
      const names = fields(schema).map((f) => f.name);
      expect(names.sort()).toEqual(["title", ...Object.keys(YAML_DEFAULTS)].sort());
    });

    it(`labels every field and option (${lang})`, () => {
      for (const f of fields(schema)) {
        expect(t(f.name), f.name).not.toBe(`editor.${f.name}`);
        if ("selector" in f && "select" in f.selector) {
          for (const o of f.selector.select.options) expect(o.label, `${f.name}=${o.value}`).not.toMatch(/^editor\./);
        }
      }
    });
  }

  it("flattens the expandable section so its toggles stay top-level", () => {
    const expandable = buildSchema((k) => k).find((f) => "type" in f && f.type === "expandable");
    expect(expandable && "flatten" in expandable && expandable.flatten).toBe(true);
  });
});
