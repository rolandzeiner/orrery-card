import { describe, expect, it } from "vitest";

import en from "../src/localize/languages/en.json";
import de from "../src/localize/languages/de.json";
import { CARD_VERSION } from "../src/const";
import pkg from "../package.json";

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

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe("translations", () => {
  const enKeys = flatten(en as Dict);
  const deKeys = flatten(de as Dict);

  it("has the same keys in English and German", () => {
    expect([...deKeys.keys()].sort()).toEqual([...enKeys.keys()].sort());
  });

  it("uses the same placeholders in both languages", () => {
    for (const [key, text] of enKeys) {
      expect(placeholders(deKeys.get(key) ?? ""), key).toEqual(placeholders(text));
    }
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
