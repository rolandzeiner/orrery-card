import { describe, expect, it } from "vitest";

import { DEFAULTS, resolveConfig } from "../src/config";

describe("resolveConfig", () => {
  it("fills every default from an empty config", () => {
    expect(resolveConfig({ type: "custom:orrery-card" })).toEqual(DEFAULTS);
  });

  it("maps the YAML flags onto the resolved shape", () => {
    const cfg = resolveConfig({ show_controls: false, ambient_motion: false, show_moon: false });
    expect(cfg.showControls).toBe(false);
    expect(cfg.ambientMotion).toBe(false);
    expect(cfg.showMoon).toBe(false);
    expect(cfg.showBelt).toBe(true);
  });

  it("accepts a numeric tilt given as text, as the YAML editor can produce", () => {
    expect(resolveConfig({ tilt: "3.5" }).tilt).toBe(3.5);
  });

  it("trims the title", () => {
    expect(resolveConfig({ title: "  Sky  " }).title).toBe("Sky");
  });

  it.each([
    [{ scale: "cubic" }, /"scale" must be one of: log, sqrt, true/],
    [{ view: "outer" }, /"view" must be one of: all, inner/],
    [{ appearance: "neon" }, /"appearance" must be one of: space, theme/],
    [{ tilt: 0 }, /"tilt" must be a number from 1 to 8/],
    [{ tilt: 12 }, /"tilt" must be a number from 1 to 8/],
    [{ tilt: "steep" }, /"tilt" must be a number from 1 to 8/],
    [{ show_belt: "yes" }, /"show_belt" must be true or false/],
    [{ title: 42 }, /"title" must be text/],
  ])("rejects %j with a message naming the key", (raw, message) => {
    expect(() => resolveConfig(raw)).toThrow(message);
  });

  it("rejects a config that isn't a mapping", () => {
    expect(() => resolveConfig(null)).toThrow(/mapping/);
    expect(() => resolveConfig([])).toThrow(/mapping/);
  });
});
