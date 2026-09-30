import { describe, expect, it } from "vitest";

import { DEFAULTS, resolveConfig, tidyConfig, withDefaults, YAML_DEFAULTS } from "../src/config";

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

  it("leaves Pluto off unless asked for", () => {
    expect(resolveConfig({}).showPluto).toBe(false);
    expect(resolveConfig({ show_pluto: true }).showPluto).toBe(true);
    expect(() => resolveConfig({ show_pluto: "yes" })).toThrow(/"show_pluto"/);
  });

  it("accepts a numeric tilt given as text, as the YAML editor can produce", () => {
    expect(resolveConfig({ tilt: "3.5" }).tilt).toBe(3.5);
  });

  it("accepts every colour theme, defaulting to Vibe", () => {
    expect(resolveConfig({}).colorTheme).toBe("vibe");
    for (const t of ["vibe", "ha", "kenobi", "spock"]) expect(resolveConfig({ color_theme: t }).colorTheme).toBe(t);
  });

  it("trims the title", () => {
    expect(resolveConfig({ title: "  Sky  " }).title).toBe("Sky");
  });

  it.each([
    [{ scale: "cubic" }, /"scale" must be one of: log, sqrt, true/],
    [{ view: "outer" }, /"view" must be one of: all, inner/],
    [{ appearance: "neon" }, /"appearance" must be one of: space, theme/],
    [{ color_theme: "vader" }, /"color_theme" must be one of: vibe, ha, kenobi, spock/],
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

describe("editor round trip", () => {
  it("shows every option with its default, so toggles that default to on are drawn on", () => {
    const shown = withDefaults({ type: "custom:orrery-card" });
    expect(shown.show_controls).toBe(true);
    expect(shown.ambient_motion).toBe(true);
    expect(shown.scale).toBe("log");
    expect(shown.appearance).toBe("space");
    expect(shown.tilt).toBe(1);
  });

  it("treats cleared values as unset rather than blanking the default", () => {
    expect(withDefaults({ scale: "", show_belt: null, tilt: undefined })).toMatchObject({ scale: "log", show_belt: true, tilt: 1 });
  });

  it("keeps what the user set over the defaults", () => {
    expect(withDefaults({ show_belt: false, scale: "true" })).toMatchObject({ show_belt: false, scale: "true" });
  });

  it("saves only what differs from the defaults, with type first", () => {
    const edited = { ...withDefaults({ type: "custom:orrery-card" }), show_belt: false, tilt: 3, title: "" };
    expect(tidyConfig(edited)).toEqual({ type: "custom:orrery-card", show_belt: false, tilt: 3 });
    expect(Object.keys(tidyConfig(edited))[0]).toBe("type");
  });

  it("drops cleared fields", () => {
    expect(tidyConfig({ type: "custom:orrery-card", scale: "", title: "", view: undefined })).toEqual({
      type: "custom:orrery-card",
    });
  });

  it("round-trips an untouched config unchanged", () => {
    const cfg = { type: "custom:orrery-card", view: "inner" };
    expect(tidyConfig(withDefaults(cfg))).toEqual(cfg);
  });

  it("covers every option the card reads", () => {
    const yamlKeys = Object.keys(YAML_DEFAULTS).sort();
    const resolvedKeys = Object.keys(DEFAULTS).filter((k) => k !== "title");
    expect(yamlKeys).toHaveLength(resolvedKeys.length);
  });
});
