import { describe, expect, it } from "vite-plus/test";

import en from "../src/localize/languages/en.json";
import de from "../src/localize/languages/de.json";
import { CARD_VERSION } from "../src/const";
import { localize } from "../src/localize/localize";
import pkg from "../package.json";
import { sorted } from "../src/sorted";

type Dict = { [key: string]: string | Dict };

function flatten(dict: Dict, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(dict)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const placeholders = (s: string): string[] =>
  sorted([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));

/** Every language file on disk, so a new one is checked without editing this test. */
const LANGUAGES: ReadonlyArray<[string, Map<string, string>]> = Object.entries(
  import.meta.glob<Dict>("../src/localize/languages/*.json", { eager: true, import: "default" }),
).map(([path, dict]) => [path.replace(/^.*\/|\.json$/g, ""), flatten(dict)]);

describe("translations", () => {
  const enKeys = flatten(en);
  const deKeys = flatten(de);

  it("bundles more than English and German", () => {
    expect(LANGUAGES.length).toBeGreaterThan(2);
  });

  it.each(LANGUAGES)("%s has the same keys as English", (_code, keys) => {
    expect(sorted(keys.keys())).toEqual(sorted(enKeys.keys()));
  });

  it.each(LANGUAGES)("%s uses the same placeholders as English", (_code, keys) => {
    for (const [key, text] of enKeys) {
      expect(placeholders(keys.get(key) ?? ""), key).toEqual(placeholders(text));
    }
  });

  it.each(LANGUAGES)("%s is registered, so the card serves its own strings", (code, keys) => {
    for (const [key, text] of keys) {
      expect(localize(key, code), key).toBe(text);
    }
  });

  it("drops the region and script from the language tag", () => {
    expect(localize("planet.earth", "zh-Hant")).toBe("地球");
    expect(localize("planet.earth", "pt-BR")).toBe("Terra");
  });

  it("serves Bokmål for plain Norwegian and Nynorsk", () => {
    expect(localize("planet.earth", "no")).toBe("Jorden");
    expect(localize("planet.earth", "nn-NO")).toBe("Jorden");
  });

  it("falls back to English for a language it doesn't bundle", () => {
    expect(localize("planet.earth", "ko")).toBe("Earth");
  });

  it("addresses the reader as du, never Sie", () => {
    for (const [key, text] of deKeys) {
      expect(text, key).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre)\b/);
    }
  });
});

describe("version", () => {
  it("keeps package.json and CARD_VERSION in step", () => {
    expect(CARD_VERSION).toBe(pkg.version);
  });
});
