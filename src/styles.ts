import { css } from "lit";

// Card styles, isolated in the card's shadow root. Theme variables pierce
// the boundary, so var(--primary-text-color) etc. follow the HA theme.
//
// Token tiers (ha-portfolio-design §4): HA design-system tokens first, then
// this card's own --orr-* namespace. Two user-facing overrides are read from
// a theme or card-mod:
//   --orrery-accent-color    planets, "now" state         (default cyan)
//   --orrery-accent-2-color  the Sun, the selected planet (default violet)
//   --orrery-font            canvas + controls font        (default: HA font)
export const cardStyles = css`
  :host {
    color-scheme: light dark;
    display: block;

    /* Fill the grid cell the dashboard hands us. A sections view gives the
       cell WRAPPER a fixed pixel height whenever rows is numeric -- which a
       user causes just by dragging the row handle -- and styles nothing
       inside it. With display: block above, this element is ha-card's
       containing block, so ha-card's block-size: 100% resolves against this
       line; without it that percentage computes to auto and the card paints
       over the card below. The pair is guarded by tests/grid-cell.test.ts. */
    block-size: 100%;

    container-type: inline-size;
    container-name: orrery-card;

    --orr-pad-x: var(--ha-space-4, 16px);
    --orr-pad-y: var(--ha-space-3, 12px);
    --orr-gap: var(--ha-space-2, 8px);
    --orr-radius-md: var(--ha-border-radius-md, 8px);
    --orr-control-size: 40px;
  }

  ha-card {
    /* overflow: hidden keeps a card taller than its cell clipped inside its
       own bounds instead of painting over its neighbour. */
    overflow: hidden;
    block-size: 100%;
    display: flex;
    flex-direction: column;
    font-family: var(--orrery-font, inherit);
  }

  /* ── Appearance: space (default) ─────────────────────────────────────
     A window onto a dark sky, whatever the theme. The whole card goes dark
     so the controls read as part of the same instrument. */
  ha-card.space {
    --orr-sky-inner: #11172a;
    --orr-sky-outer: #070a12;
    --orr-star: #c8d2ee;
    --orr-orbit: #94a0be;
    --orr-label: #808aa4;
    --orr-ink: #d8ddeb;
    --orr-muted: #8b94ad;
    --orr-earth: #e9fbff;
    --orr-moon: #dde3f2;
    --orr-raise: #111728;
    --orr-line: #222a3f;
    --orr-accent: var(--orrery-accent-color, #48c9e6);
    --orr-accent-2: var(--orrery-accent-2-color, #a878f0);
    background: #0a0e18;
    color: var(--orr-ink);
  }

  /* ── Appearance: theme ───────────────────────────────────────────────
     Drawn straight onto the theme's card background. The light-theme
     accents are darker so small labels keep 4.5:1 on white. */
  ha-card.theme {
    --orr-sky-inner: transparent;
    --orr-sky-outer: transparent;
    --orr-star: transparent;
    --orr-orbit: var(--secondary-text-color, #727272);
    --orr-label: var(--secondary-text-color, #727272);
    --orr-ink: var(--primary-text-color, #212121);
    --orr-muted: var(--secondary-text-color, #727272);
    --orr-earth: var(--orr-accent);
    --orr-moon: var(--secondary-text-color, #727272);
    --orr-raise: var(--secondary-background-color, #f5f5f5);
    --orr-line: var(--divider-color, rgba(0, 0, 0, 0.12));
    --orr-accent: var(--orrery-accent-color, #0b7fa0);
    --orr-accent-2: var(--orrery-accent-2-color, #7a45d6);
    color: var(--orr-ink);
  }
  ha-card.theme.dark {
    --orr-accent: var(--orrery-accent-color, #48c9e6);
    --orr-accent-2: var(--orrery-accent-2-color, #a878f0);
  }

  .title {
    margin: 0;
    padding: var(--orr-pad-y) var(--orr-pad-x) 0;
    font-size: var(--ha-font-size-l, 1.143rem);
    font-weight: var(--ha-font-weight-medium, 500);
    line-height: var(--ha-line-height-condensed, 1.2);
  }

  /* The sky. Square by default (aspect-ratio gives it a height in an
     auto-height cell); in a fixed-height cell it grows or shrinks with the
     flex column. The canvas is absolutely positioned and sized from JS to
     the smaller side, so it never feeds back into this box's size. */
  .stage {
    position: relative;
    flex: 1 1 auto;
    min-block-size: 0;
    inline-size: 100%;
    aspect-ratio: 1;
  }
  canvas {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    transform: translate(-50%, -50%);
    display: block;
    touch-action: none;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
  }
  canvas:active {
    cursor: grabbing;
  }
  canvas:focus-visible {
    outline: 2px solid var(--orr-accent);
    outline-offset: -2px;
  }

  .toast {
    position: absolute;
    inset-block-start: var(--ha-space-3, 12px);
    inset-inline-start: 50%;
    transform: translateX(-50%);
    padding: var(--ha-space-1, 4px) var(--ha-space-3, 12px);
    border-radius: var(--ha-border-radius-pill, 9999px);
    border: 1px solid var(--orr-line);
    background: var(--orr-raise);
    color: var(--orr-ink);
    font-size: var(--ha-font-size-s, 0.857rem);
    white-space: nowrap;
    pointer-events: none;
  }

  .readout {
    margin: 0;
    padding: var(--orr-pad-y) var(--orr-pad-x);
    border-block-start: 1px solid var(--orr-line);
    color: var(--orr-muted);
    font-size: var(--ha-font-size-s, 0.857rem);
    line-height: var(--ha-line-height-normal, 1.6);
    font-variant-numeric: tabular-nums;
    text-wrap: pretty;
  }
  .readout strong {
    color: var(--orr-accent-2);
    font-weight: var(--ha-font-weight-medium, 500);
  }
  .readout strong.home {
    color: var(--orr-accent);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--orr-gap) var(--ha-space-3, 12px);
    padding: var(--orr-pad-y) var(--orr-pad-x);
    border-block-start: 1px solid var(--orr-line);
  }
  .group {
    display: flex;
    align-items: center;
    gap: var(--ha-space-1, 4px);
  }
  .spacer {
    flex: 1 1 auto;
  }
  button,
  select,
  input {
    box-sizing: border-box;
    block-size: var(--orr-control-size);
    border: 1px solid var(--orr-line);
    border-radius: var(--orr-radius-md);
    background: var(--orr-raise);
    color: var(--orr-ink);
    font: inherit;
    font-size: var(--ha-font-size-s, 0.857rem);
    font-variant-numeric: tabular-nums;
  }
  select,
  input {
    padding: 0 var(--ha-space-2, 8px);
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ha-space-1, 4px);
    min-inline-size: var(--orr-control-size);
    padding: 0 var(--ha-space-2, 8px);
    cursor: pointer;
    transition:
      border-color var(--ha-animation-duration-fast, 150ms) ease,
      color var(--ha-animation-duration-fast, 150ms) ease;
  }
  button:hover:not(:disabled) {
    border-color: var(--orr-muted);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  button ha-icon {
    --mdc-icon-size: 20px;
  }
  .play {
    min-inline-size: 92px;
    padding-inline-end: var(--ha-space-3, 12px);
  }
  .play.active,
  .now[aria-pressed="true"] {
    color: var(--orr-accent);
    border-color: var(--orr-accent);
  }

  /* ── Narrow cards ─────────────────────────────────────────────────── */
  @container orrery-card (inline-size < 360px) {
    :host {
      --orr-pad-x: var(--ha-space-3, 12px);
      --orr-pad-y: var(--ha-space-2, 8px);
    }
    .play {
      min-inline-size: var(--orr-control-size);
      padding-inline-end: var(--ha-space-2, 8px);
    }
    .play span {
      display: none;
    }
  }

  /* ── Accessibility primitives ─────────────────────────────────────── */
  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--orr-accent);
    outline-offset: 2px;
  }
  @media (forced-colors: active) {
    button:focus-visible,
    select:focus-visible,
    input:focus-visible,
    canvas:focus-visible {
      outline-color: CanvasText;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  .probe {
    position: absolute;
    inline-size: 0;
    block-size: 0;
    overflow: hidden;
  }
`;
