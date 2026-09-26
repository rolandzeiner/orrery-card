/** A stand-in 2D context for node and happy-dom, neither of which paints.
 *  Every method is a recorded no-op; the few with return values the
 *  renderer reads (gradients, measureText) return plausible shapes.
 *  Like a real browser, a gradient rejects an empty colour — the failure
 *  that once left the sky black. */
export interface FakeContext {
  calls: Array<[string, unknown[]]>;
  ctx: CanvasRenderingContext2D;
  texts(): string[];
}

export function fakeContext(): FakeContext {
  const calls: Array<[string, unknown[]]> = [];
  const state: Record<string | symbol, unknown> = {
    createRadialGradient: () => ({
      addColorStop: (_offset: number, color: string) => {
        if (!color) throw new SyntaxError("The value provided ('') could not be parsed as a color.");
      },
    }),
    measureText: (text: string) => ({ width: text.length * 6 }),
    // Present, as in Chromium/Firefox/Safari 18+, so the date's blur runs.
    filter: "none",
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push([String(key), args]);
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return {
    calls,
    ctx,
    texts: () => calls.filter(([name]) => name === "fillText").map(([, args]) => String(args[0])),
  };
}

export function fakeCanvas(fake: FakeContext): HTMLCanvasElement {
  return { getContext: () => fake.ctx, width: 0, height: 0, style: {} } as unknown as HTMLCanvasElement;
}

export const SAMPLE_PALETTE = {
  skyInner: "rgb(17, 23, 42)",
  skyOuter: "rgb(7, 10, 18)",
  star: "rgb(200, 210, 238)",
  orbit: "rgb(148, 160, 190)",
  label: "rgb(128, 138, 164)",
  ink: "rgb(216, 221, 235)",
  accent: "rgb(72, 201, 230)",
  accent2: "rgb(168, 120, 240)",
  accentClear: "rgba(72, 201, 230, 0)",
  accent2Clear: "rgba(168, 120, 240, 0)",
  earthCore: "rgb(233, 251, 255)",
  moon: "rgb(221, 227, 242)",
  plate: "rgb(11, 15, 27)",
  plateClear: "rgba(11, 15, 27, 0)",
  font: "sans-serif",
};
