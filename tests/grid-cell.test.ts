/**
 * The card fills its sections-view grid cell instead of painting over the
 * card below it.
 *
 * A sections view gives the card a fixed-height cell whenever rows is numeric
 * -- which the USER causes by dragging the height or width handle, since a
 * stored grid_options overrides getGridOptions(). rows: "auto" exempts
 * nobody. Only the PAIR below makes the card take that height; see
 * ha-lovelace-card references/gotchas.md, "A card whose :host is display: block ...".
 *
 * happy-dom and node do no layout, so the guard is on the CSS text. It needs
 * no DOM: import it into any vitest suite, or run it on its own. The
 * portfolio lost this four times, each time in a card whose styles were
 * written by hand instead of copied from styles.ts.template -- which is why
 * this ships as a test rather than as advice.
 *
 * Needs vitest as a devDependency and a "test": "vitest run" script.
 */
import { describe, expect, it } from "vitest";

import { cardStyles } from "../src/styles";

/** The declarations of the first rule for a selector, up to its closing brace. */
const rule = (selector: string): string => {
  const css = cardStyles.cssText;
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
};

describe("the grid cell", () => {
  it("takes the cell's height on the host", () => {
    expect(rule(":host")).toMatch(/display:\s*block/);
    expect(rule(":host")).toMatch(/block-size:\s*100%/);
  });

  it("resolves ha-card against it and clips inside the card", () => {
    expect(rule("ha-card")).toMatch(/block-size:\s*100%/);
    expect(rule("ha-card")).toMatch(/overflow:\s*hidden/);
  });
});
