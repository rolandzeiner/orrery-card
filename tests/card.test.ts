/**
 * @vitest-environment happy-dom
 *
 * The card element end to end: mounting, the time controls, keyboard,
 * pointer and wheel input, and language switching. happy-dom doesn't paint,
 * so the canvas gets the fake context from fake-canvas.ts and the two
 * observers are replaced by stubs the tests fire by hand.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { fakeContext } from "./fake-canvas";

type ObserverCallback = (entries: Array<{ contentRect: { width: number; height: number }; isIntersecting: boolean }>) => void;
const resizeCallbacks: ObserverCallback[] = [];

class StubResizeObserver {
  constructor(cb: ObserverCallback) {
    resizeCallbacks.push(cb);
  }
  observe(): void {}
  disconnect(): void {}
}
class StubIntersectionObserver {
  constructor(private readonly cb: ObserverCallback) {}
  observe(): void {
    this.cb([{ contentRect: { width: 0, height: 0 }, isIntersecting: true }]);
  }
  disconnect(): void {}
}

/** The card's private surface the tests reach into. */
interface CardInternals extends HTMLElement {
  hass: unknown;
  setConfig(config: unknown): void;
  getCardSize(): number;
  getGridOptions(): Record<string, number>;
  updateComplete: Promise<boolean>;
  _t: number;
  _live: boolean;
  _playing: boolean;
  _selected: string | null;
  _speed: string;
  _cam: { az: number; el: number; zoom: number };
  _renderer?: { pick: (x: number, y: number) => string | null; cssSize: number };
  _frame: (ts: number) => void;
}

beforeAll(async () => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
  HTMLCanvasElement.prototype.getContext = (() => fakeContext().ctx) as unknown as HTMLCanvasElement["getContext"];
  await import("../src/orrery-card");
});

afterEach(() => {
  document.body.innerHTML = "";
  resizeCallbacks.length = 0;
});

const hassEn = { locale: { language: "en", time_format: "24" }, themes: { darkMode: true } };

async function mount(config: Record<string, unknown> = {}, hass: unknown = hassEn): Promise<CardInternals> {
  const card = document.createElement("orrery-card") as unknown as CardInternals;
  card.setConfig({ type: "custom:orrery-card", ambient_motion: false, ...config });
  card.hass = hass;
  document.body.appendChild(card);
  await card.updateComplete;
  for (const cb of resizeCallbacks) cb([{ contentRect: { width: 400, height: 400 }, isIntersecting: true }]);
  return card;
}

const $ = <T extends Element>(card: CardInternals, selector: string): T => {
  const el = card.shadowRoot?.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} not rendered`);
  return el;
};
const button = (card: CardInternals, label: string): HTMLButtonElement =>
  $(card, `button[aria-label="${label}"]`);

describe("the card contract", () => {
  it("sizes itself for both dashboard layouts", async () => {
    const card = await mount();
    expect(card.getCardSize()).toBe(12);
    expect(card.getGridOptions()).toMatchObject({ columns: 12, rows: 10, min_rows: 6 });
    card.setConfig({ type: "custom:orrery-card", show_controls: false });
    expect(card.getCardSize()).toBe(10);
  });

  it("offers a visual editor and an empty starter config", () => {
    const ctor = customElements.get("orrery-card") as unknown as {
      getConfigElement(): HTMLElement;
      getStubConfig(): Record<string, unknown>;
    };
    expect(ctor.getConfigElement().tagName.toLowerCase()).toBe("orrery-card-editor");
    expect(ctor.getStubConfig()).toEqual({});
  });

  it("shows HA's error card for a bad option", async () => {
    const card = await mount();
    expect(() => card.setConfig({ type: "custom:orrery-card", scale: "cubic" })).toThrow(/"scale"/);
  });

  it("measures itself and sizes the canvas to the stage", async () => {
    const card = await mount();
    expect(card._renderer?.cssSize).toBe(400);
  });
});

describe("time controls", () => {
  it("plays and pauses, and playing leaves the live sky", async () => {
    const card = await mount();
    const play = $<HTMLButtonElement>(card, "button.play");
    play.click();
    await card.updateComplete;
    expect(card._playing).toBe(true);
    expect(card._live).toBe(false);
    expect(play.getAttribute("aria-label")).toBe("Pause");
    expect(play.classList.contains("active")).toBe(true);
    play.click();
    await card.updateComplete;
    expect(card._playing).toBe(false);
  });

  it("moves time on while playing and stops at the end of the range", async () => {
    const card = await mount();
    card._playing = true;
    card._speed = "year";
    const t0 = card._t;
    card._frame(1000);
    card._frame(1100);
    expect(card._t).toBeGreaterThan(t0);
    card._t = Date.UTC(2200, 11, 30);
    card._frame(1200);
    expect(card._playing).toBe(false);
  });

  it("steps by a day and a month, and Now returns to the live sky", async () => {
    const card = await mount();
    const t0 = card._t;
    button(card, "Back one day").click();
    expect(card._t).toBe(t0 - 86_400_000);
    expect(card._live).toBe(false);
    button(card, "Forward one month").click();
    button(card, "Back one month").click();
    button(card, "Forward one day").click();
    expect(card._t).toBe(t0);
    $<HTMLButtonElement>(card, "button.now").click();
    expect(card._live).toBe(true);
  });

  it("jumps to a typed date", async () => {
    const card = await mount();
    const input = $<HTMLInputElement>(card, 'input[type="date"]');
    input.value = "2030-01-15";
    input.dispatchEvent(new Event("change"));
    expect(new Date(card._t).getUTCFullYear()).toBe(2030);
    expect(card._live).toBe(false);
  });

  it("changes the playback speed", async () => {
    const card = await mount();
    const select = $<HTMLSelectElement>(card, "select");
    select.value = "decade";
    select.dispatchEvent(new Event("change"));
    expect(card._speed).toBe("decade");
  });

  it("leaves the controls out when they're switched off", async () => {
    const card = await mount({ show_controls: false });
    expect(card.shadowRoot?.querySelector(".controls")).toBeNull();
    expect(card.shadowRoot?.querySelector(".viewbar")).toBeNull();
  });
});

describe("view input", () => {
  const key = (card: CardInternals, k: string): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key: k, cancelable: true });
    $(card, "canvas").dispatchEvent(event);
    return event;
  };

  it("rotates, zooms and resets from the keyboard, and leaves other keys alone", async () => {
    const card = await mount();
    const az = card._cam.az;
    expect(key(card, "ArrowRight").defaultPrevented).toBe(true);
    expect(card._cam.az).toBeGreaterThan(az);
    key(card, "ArrowUp");
    const zoom = card._cam.zoom;
    key(card, "+");
    expect(card._cam.zoom).toBeGreaterThan(zoom);
    key(card, "0");
    expect(card._cam.zoom).toBe(1);
    expect(key(card, "a").defaultPrevented).toBe(false);
  });

  it("turns with a drag and selects with a tap", async () => {
    const card = await mount();
    const canvas = $(card, "canvas");
    const az = card._cam.az;
    const pointer = (type: string, x: number, y: number): void => {
      canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
    };
    pointer("pointerdown", 100, 100);
    pointer("pointermove", 160, 100);
    pointer("pointerup", 160, 100);
    expect(card._cam.az).toBeGreaterThan(az);
    expect(card._selected).toBeNull();

    vi.spyOn(card._renderer!, "pick").mockReturnValue("mars");
    pointer("pointerdown", 200, 200);
    pointer("pointerup", 200, 200);
    await card.updateComplete;
    expect(card._selected).toBe("mars");
    expect($(card, ".readout").textContent).toMatch(/Mars is in \w+/);

    pointer("pointerdown", 200, 200);
    pointer("pointerup", 200, 200);
    expect(card._selected).toBeNull();
  });

  it("drops a Pluto selection when Pluto is switched off", async () => {
    const card = await mount({ show_pluto: true });
    card._selected = "pluto";
    card.setConfig({ type: "custom:orrery-card", ambient_motion: false });
    expect(card._selected).toBeNull();
  });

  it("zooms on Ctrl + scroll and leaves plain scrolling to the page", async () => {
    const card = await mount();
    const canvas = $(card, "canvas");
    const zoom = card._cam.zoom;
    const plain = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
    canvas.dispatchEvent(plain);
    await card.updateComplete;
    expect(plain.defaultPrevented).toBe(false);
    expect(card.shadowRoot?.querySelector(".toast")?.textContent).toMatch(/Ctrl/);
    const ctrl = new WheelEvent("wheel", { deltaY: -100, cancelable: true });
    // happy-dom's WheelEvent drops ctrlKey from its init dict.
    Object.defineProperty(ctrl, "ctrlKey", { value: true });
    canvas.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(true);
    expect(card._cam.zoom).toBeGreaterThan(zoom);
  });

  it("changes angle and zoom from the buttons on the sky", async () => {
    const card = await mount();
    const el = card._cam.el;
    button(card, "Change the viewing angle").click();
    expect(card._cam.el).not.toBe(el);
    const zoom = card._cam.zoom;
    button(card, "Zoom in").click();
    expect(card._cam.zoom).toBeGreaterThan(zoom);
    button(card, "Zoom out").click();
    expect(card._cam.zoom).toBeCloseTo(zoom);
  });
});

describe("language and appearance", () => {
  it("follows the HA language", async () => {
    const card = await mount({}, { ...hassEn, locale: { language: "de" } });
    expect($(card, ".readout").textContent).toMatch(/Tippe auf einen Planeten/);
    card.hass = hassEn;
    await card.updateComplete;
    expect($(card, ".readout").textContent).toMatch(/Tap a planet/);
  });

  it("switches between the space and theme looks", async () => {
    const card = await mount({ appearance: "theme", title: "Sky" });
    expect($(card, "ha-card").classList.contains("theme")).toBe(true);
    expect($(card, ".title").textContent).toBe("Sky");
  });

  it("applies the colour theme to the card", async () => {
    const card = await mount({ color_theme: "spock" });
    const haCard = $(card, "ha-card");
    expect(haCard.classList.contains("ct-spock")).toBe(true);
    card.setConfig({ type: "custom:orrery-card", color_theme: "kenobi" });
    await card.updateComplete;
    expect(haCard.classList.contains("ct-kenobi")).toBe(true);
    expect(haCard.classList.contains("ct-spock")).toBe(false);
  });

  it("survives being moved in the page", async () => {
    const card = await mount();
    card.remove();
    document.body.appendChild(card);
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("canvas")).not.toBeNull();
  });
});
