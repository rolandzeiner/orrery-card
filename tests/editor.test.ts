/**
 * @vitest-environment happy-dom
 *
 * The editor element's round trip: what it shows, and what it saves when a
 * form reports a change. ha-form and ha-expansion-panel aren't registered
 * in happy-dom, so the tests read the data the editor handed each form and
 * fire value-changed from it by hand.
 */
import { beforeAll, describe, expect, it } from "vite-plus/test";

interface Form extends HTMLElement {
  data: Record<string, unknown>;
  schema: Array<{ name: string; type?: string }>;
}
interface Editor extends HTMLElement {
  setConfig(config: Record<string, unknown>): void;
  updateComplete: Promise<boolean>;
}

beforeAll(async () => {
  await import("../src/editor");
});

async function mount(config: Record<string, unknown>): Promise<Editor> {
  const editor = document.createElement("orrery-card-editor") as Editor;
  editor.setConfig(config);
  document.body.appendChild(editor);
  await editor.updateComplete;
  return editor;
}

const forms = (editor: Editor): Form[] => [
  ...(editor.shadowRoot?.querySelectorAll<Form>("ha-form") ?? []),
];

/** Fire a change from `form` and return the config the editor saves. */
function change(editor: Editor, form: Form, patch: Record<string, unknown>): unknown {
  let saved: unknown;
  editor.addEventListener("config-changed", (ev) => (saved = (ev as CustomEvent).detail.config), {
    once: true,
  });
  form.dispatchEvent(
    new CustomEvent("value-changed", { detail: { value: { ...form.data, ...patch } } }),
  );
  return saved;
}

describe("editor", () => {
  it("shows the defaults in the top form", async () => {
    const editor = await mount({ type: "custom:orrery-card" });
    const top = forms(editor)[0]!;
    expect(top.schema.map((f) => f.name)).toEqual(["title", "color_theme", "appearance"]);
    expect(top.data).toMatchObject({ color_theme: "vibe", appearance: "space" });
  });

  it("saves only the key that changed, and keeps keys it has no field for", async () => {
    const editor = await mount({ type: "custom:orrery-card", show_pluto: true, extra: 1 });
    const saved = change(editor, forms(editor)[0]!, { color_theme: "kenobi" });
    expect(saved).toEqual({
      type: "custom:orrery-card",
      show_pluto: true,
      extra: 1,
      color_theme: "kenobi",
    });
  });

  it("drops an option set back to its default", async () => {
    const editor = await mount({ type: "custom:orrery-card", color_theme: "spock" });
    expect(change(editor, forms(editor)[0]!, { color_theme: "vibe" })).toEqual({
      type: "custom:orrery-card",
    });
  });

  it("drops a cleared title", async () => {
    const editor = await mount({ type: "custom:orrery-card", title: "Sky" });
    expect(change(editor, forms(editor)[0]!, { title: "" })).toEqual({
      type: "custom:orrery-card",
    });
  });

  it("offers every group through ha-form until the panels are loaded", async () => {
    const editor = await mount({ type: "custom:orrery-card" });
    const fallback = forms(editor)[1]!;
    expect(fallback.schema.map((g) => g.type)).toEqual(["expandable", "expandable", "expandable"]);
    expect(change(editor, fallback, { show_pluto: true })).toEqual({
      type: "custom:orrery-card",
      show_pluto: true,
    });
  });

  // Last: once the stub panel is registered, every later editor uses it.
  it("draws a panel per group with its summary, and builds a body only once opened", async () => {
    customElements.define("ha-expansion-panel", class extends HTMLElement {});
    const editor = await mount({ type: "custom:orrery-card", show_moon: false });
    const panels = [
      ...(editor.shadowRoot?.querySelectorAll<HTMLElement & { header: string; secondary: string }>(
        "ha-expansion-panel",
      ) ?? []),
    ];
    expect(panels.map((p) => p.header)).toEqual(["Sky", "View", "Controls and readouts"]);
    expect(panels[0]?.secondary).toBe("Without the Moon");
    expect(forms(editor)).toHaveLength(1);

    panels[0]!.dispatchEvent(
      new CustomEvent("expanded-will-change", { detail: { expanded: true } }),
    );
    await editor.updateComplete;
    const [, common, more] = forms(editor);
    expect(common?.schema.map((f) => f.name)).toEqual([
      "show_pluto",
      "show_labels",
      "show_trails",
      "show_moon",
      "show_jupiter_moons",
      "show_home",
    ]);
    expect(more?.schema.map((f) => f.name)).toEqual(["show_belt", "show_ticks", "ambient_motion"]);
    expect(common?.data.show_moon).toBe(false);
    expect(change(editor, common!, { show_moon: true })).toEqual({ type: "custom:orrery-card" });
  });
});
