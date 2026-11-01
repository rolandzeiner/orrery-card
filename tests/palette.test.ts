/**
 * @vitest-environment happy-dom
 *
 * readPalette against a probe whose computed colours are stubbed, so the
 * tests decide what the browser "resolved". happy-dom doesn't resolve
 * custom properties itself.
 */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PROBE_TOKENS, readPalette } from "../src/render/palette";

const COLOURS: Record<string, string> = {
  skyInner: "rgb(17, 23, 42)",
  skyOuter: "rgb(7, 10, 18)",
  star: "rgb(200, 210, 238)",
  orbit: "rgb(148, 160, 190)",
  label: "rgb(128, 138, 164)",
  ink: "rgb(216, 221, 235)",
  accent: "rgb(72, 201, 230)",
  accent2: "rgb(168, 120, 240)",
  earthCore: "rgb(233, 251, 255)",
  moon: "rgb(221, 227, 242)",
  plate: "rgb(11, 15, 27)",
};

/** A connected probe with one child per token, as the card renders it. */
function probe(): HTMLElement {
  const el = document.createElement("span");
  for (const [key] of PROBE_TOKENS) {
    const child = document.createElement("span");
    child.dataset.token = key;
    el.appendChild(child);
  }
  document.body.appendChild(el);
  return el;
}

function stubColours(colourOf: (key: string | undefined) => string): void {
  vi.stubGlobal("getComputedStyle", (el: HTMLElement) => ({
    color: colourOf(el.dataset.token),
    fontFamily: "Roboto",
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("readPalette", () => {
  it("reads every token from its own probe child", () => {
    stubColours((key) => (key ? (COLOURS[key] ?? "") : ""));
    const palette = readPalette(probe());
    expect(palette).not.toBeNull();
    expect(palette?.orbit).toBe(COLOURS.orbit);
    expect(palette?.plate).toBe(COLOURS.plate);
    expect(palette?.accentClear).toBe("rgba(72, 201, 230, 0)");
    expect(palette?.font).toBe("Roboto");
  });

  it("leaves the sky out when its tokens are transparent", () => {
    stubColours((key) =>
      key === "skyInner" || key === "skyOuter" || key === "star"
        ? "rgba(0, 0, 0, 0)"
        : (COLOURS[key ?? ""] ?? ""),
    );
    const palette = readPalette(probe());
    expect(palette?.skyInner).toBeNull();
    expect(palette?.star).toBeNull();
    expect(palette?.ink).toBe(COLOURS.ink);
  });

  it("fails a read where every token came back as one colour (#10)", () => {
    stubColours(() => "rgb(0, 154, 199)");
    expect(readPalette(probe())).toBeNull();
  });

  it("fails a read with an unresolved token", () => {
    stubColours((key) => (key === "moon" ? "" : (COLOURS[key ?? ""] ?? "")));
    expect(readPalette(probe())).toBeNull();
  });

  it("fails a read on a probe that isn't in the document", () => {
    stubColours((key) => COLOURS[key ?? ""] ?? "");
    const el = probe();
    el.remove();
    expect(readPalette(el)).toBeNull();
  });
});
