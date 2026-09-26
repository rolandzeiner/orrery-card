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
    --orr-plate: #0b0f1b;
    --orr-raise: #111728;
    --orr-line: #222a3f;
    --orr-accent: var(--orrery-accent-color, #48c9e6);
    --orr-accent-2: var(--orrery-accent-2-color, #a878f0);
    --orr-on-accent: #0a0e18;
    background: #0a0e18;
    color: var(--orr-ink);
    /* Native pickers (speed list, calendar) open dark to match. */
    color-scheme: dark;
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
    --orr-plate: var(--ha-card-background, var(--card-background-color, #fff));
    --orr-raise: var(--secondary-background-color, #f5f5f5);
    --orr-line: var(--divider-color, rgba(0, 0, 0, 0.12));
    --orr-accent: var(--orrery-accent-color, #0b7fa0);
    --orr-accent-2: var(--orrery-accent-2-color, #7a45d6);
    --orr-on-accent: var(--ha-card-background, var(--card-background-color, #fff));
    color: var(--orr-ink);
    color-scheme: light;
  }
  ha-card.theme.dark {
    --orr-accent: var(--orrery-accent-color, #48c9e6);
    --orr-accent-2: var(--orrery-accent-2-color, #a878f0);
    color-scheme: dark;
  }

  /* ── Colour themes ───────────────────────────────────────────────────
     Layered over the appearance above: every theme sets the two accents;
     in the space appearance it also sets the sky and the neutrals. Vibe is
     the base, so it needs no rules of its own. Each theme's light-card
     accents are darker, to keep small labels at 4.5:1 on white. The
     --orrery-accent-color / --orrery-accent-2-color overrides still win. */

  /* HA theme: the active theme's primary and accent colours, on Vibe's
     sky. Placed after .theme.dark, which has the same specificity. */
  ha-card.ct-ha.space,
  ha-card.ct-ha.theme {
    --orr-accent: var(--orrery-accent-color, var(--primary-color, #03a9f4));
    --orr-accent-2: var(--orrery-accent-2-color, var(--accent-color, #ff9800));
    --orr-on-accent: var(--text-primary-color, #fff);
  }

  /* Kenobi: black sky, crawl-yellow planets, a lightsaber-red Sun, and
     pale gold type. */
  ha-card.ct-kenobi.space {
    --orr-sky-inner: #0c0c0e;
    --orr-sky-outer: #000000;
    --orr-star: #ffffff;
    --orr-orbit: #8f8e96;
    --orr-label: #8f8a73;
    --orr-ink: #f4ebc4;
    --orr-muted: #a29c84;
    --orr-earth: #fff8cc;
    --orr-moon: #e8e3cc;
    --orr-plate: #050506;
    --orr-raise: #151517;
    --orr-line: #29292d;
    --orr-accent: var(--orrery-accent-color, #ffe81f);
    --orr-accent-2: var(--orrery-accent-2-color, #ff4b3a);
    --orr-on-accent: #000000;
    background: #050506;
  }
  ha-card.ct-kenobi.theme {
    --orr-accent: var(--orrery-accent-color, #8a6a00);
    --orr-accent-2: var(--orrery-accent-2-color, #c0392b);
  }
  ha-card.ct-kenobi.theme.dark {
    --orr-accent: var(--orrery-accent-color, #ffe81f);
    --orr-accent-2: var(--orrery-accent-2-color, #ff5a4a);
    --orr-on-accent: #000000;
  }

  /* Spock: a starship console — black, with orange, lavender-blue and
     peach panels. */
  ha-card.ct-spock.space {
    --orr-sky-inner: #080a1c;
    --orr-sky-outer: #000000;
    --orr-star: #e4e2ff;
    --orr-orbit: #8b86b8;
    --orr-label: #9c8fb6;
    --orr-ink: #ffd9b0;
    --orr-muted: #b3a5c8;
    --orr-earth: #ffe3c2;
    --orr-moon: #e9ddf2;
    --orr-plate: #03040c;
    --orr-raise: #14142a;
    --orr-line: #2a2945;
    --orr-accent: var(--orrery-accent-color, #ff9900);
    --orr-accent-2: var(--orrery-accent-2-color, #9999ff);
    --orr-on-accent: #000000;
    background: #03040c;
  }
  ha-card.ct-spock.theme {
    --orr-accent: var(--orrery-accent-color, #b35900);
    --orr-accent-2: var(--orrery-accent-2-color, #5252c7);
  }
  ha-card.ct-spock.theme.dark {
    --orr-accent: var(--orrery-accent-color, #ff9900);
    --orr-accent-2: var(--orrery-accent-2-color, #9999ff);
    --orr-on-accent: #000000;
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
    inset-block-start: calc(var(--ha-space-2, 8px) + 48px);
    inset-inline-start: 50%;
    transform: translateX(-50%);
    padding: var(--ha-space-1, 4px) var(--ha-space-3, 12px);
    border-radius: var(--ha-border-radius-pill, 9999px);
    background: color-mix(in srgb, var(--orr-raise) 85%, transparent);
    color: var(--orr-ink);
    font-size: var(--ha-font-size-s, 0.857rem);
    white-space: nowrap;
    pointer-events: none;
  }

  .readout {
    margin: 0 auto;
    padding: var(--ha-space-2, 8px) var(--orr-pad-x) 0;
    max-inline-size: 46ch;
    text-align: center;
    color: var(--orr-muted);
    font-size: var(--ha-font-size-s, 0.857rem);
    line-height: var(--ha-line-height-normal, 1.6);
    font-variant-numeric: tabular-nums;
    text-wrap: balance;
  }
  .readout strong {
    color: var(--orr-accent-2);
    font-weight: var(--ha-font-weight-medium, 500);
  }
  .readout strong.home {
    color: var(--orr-accent);
  }

  /* ── Controls ────────────────────────────────────────────────────────
     Ghost controls: no border or fill at rest, a soft round wash on hover.
     The play button is the one solid shape, in the accent colour. */
  button {
    appearance: none;
    display: inline-grid;
    place-items: center;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--ha-border-radius-pill, 9999px);
    background: transparent;
    color: var(--orr-muted);
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      color var(--ha-animation-duration-fast, 150ms) ease,
      background-color var(--ha-animation-duration-fast, 150ms) ease,
      box-shadow var(--ha-animation-duration-fast, 150ms) ease,
      transform var(--ha-animation-duration-fast, 150ms) ease;
  }
  button:hover {
    color: var(--orr-ink);
    background: color-mix(in srgb, var(--orr-ink) 9%, transparent);
  }
  button:active {
    transform: scale(0.92);
  }
  button.icon {
    inline-size: var(--orr-control-size);
    block-size: var(--orr-control-size);
  }
  button.icon ha-icon {
    --mdc-icon-size: 22px;
  }

  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ha-space-1, 4px);
    padding: var(--ha-space-3, 12px) var(--orr-pad-x) var(--ha-space-4, 16px);
  }
  .transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ha-space-1, 4px);
  }
  button.play {
    inline-size: 52px;
    block-size: 52px;
    margin-inline: var(--ha-space-3, 12px);
    color: var(--orr-accent);
    box-shadow: inset 0 0 0 1.5px var(--orr-accent);
  }
  button.play ha-icon {
    --mdc-icon-size: 26px;
  }
  button.play:hover {
    color: var(--orr-accent);
    background: color-mix(in srgb, var(--orr-accent) 14%, transparent);
  }
  button.play.active {
    color: var(--orr-on-accent);
    background: var(--orr-accent);
    box-shadow: 0 0 20px color-mix(in srgb, var(--orr-accent) 45%, transparent);
  }

  .timeline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--ha-space-1, 4px) var(--ha-space-2, 8px);
  }
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    block-size: 32px;
    border-radius: var(--ha-border-radius-pill, 9999px);
    color: var(--orr-muted);
    font-size: var(--ha-font-size-s, 0.857rem);
    font-variant-numeric: tabular-nums;
    transition:
      color var(--ha-animation-duration-fast, 150ms) ease,
      background-color var(--ha-animation-duration-fast, 150ms) ease;
  }
  .chip:hover,
  .chip:focus-within {
    color: var(--orr-ink);
    background: color-mix(in srgb, var(--orr-ink) 9%, transparent);
  }
  .chip select,
  .chip input {
    appearance: none;
    box-sizing: border-box;
    block-size: 100%;
    margin: 0;
    padding: 0 var(--ha-space-3, 12px);
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .chip select {
    padding-inline-end: 30px;
    /* Size to the chosen speed, not the longest option (Chromium, Safari
       26+). Elsewhere the chip is just a little wider. */
    field-sizing: content;
  }
  .chip .chevron {
    position: absolute;
    inset-inline-end: 10px;
    pointer-events: none;
    --mdc-icon-size: 16px;
  }
  .chip input::-webkit-calendar-picker-indicator {
    opacity: 0.55;
    cursor: pointer;
  }
  button.now {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2, 8px);
    block-size: 32px;
    padding: 0 var(--ha-space-3, 12px);
    font-size: var(--ha-font-size-s, 0.857rem);
    letter-spacing: 0.02em;
  }
  .now .dot {
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px currentColor;
  }
  button.now[aria-pressed="true"] {
    color: var(--orr-accent);
  }
  button.now[aria-pressed="true"] .dot {
    background: var(--orr-accent);
    box-shadow: 0 0 8px var(--orr-accent);
  }

  /* View controls float on the sky, in the empty band above the orbits. */
  .viewbar {
    position: absolute;
    inset-block-start: var(--ha-space-2, 8px);
    inset-inline-start: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--ha-border-radius-pill, 9999px);
    background: color-mix(in srgb, var(--orr-raise) 70%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--orr-ink) 10%, transparent);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    opacity: 0.75;
    transition: opacity var(--ha-animation-duration-fast, 150ms) ease;
  }
  .viewbar:hover,
  .viewbar:focus-within {
    opacity: 1;
  }
  .viewbar button.icon {
    inline-size: 36px;
    block-size: 36px;
  }
  .viewbar button.icon ha-icon {
    --mdc-icon-size: 18px;
  }

  /* ── Narrow cards ─────────────────────────────────────────────────── */
  @container orrery-card (inline-size < 360px) {
    :host {
      --orr-pad-x: var(--ha-space-3, 12px);
      --orr-control-size: 36px;
    }
    button.play {
      inline-size: 46px;
      block-size: 46px;
      margin-inline: var(--ha-space-1, 4px);
    }
  }

  /* ── Accessibility primitives ─────────────────────────────────────── */
  button:focus-visible,
  .chip:has(:focus-visible) {
    outline: 2px solid var(--orr-accent);
    outline-offset: 2px;
  }
  .chip select:focus-visible,
  .chip input:focus-visible {
    outline: none;
  }
  @media (forced-colors: active) {
    /* Ghost controls have no edge of their own; give them one. */
    button,
    .chip {
      border: 1px solid ButtonText;
    }
    button:focus-visible,
    .chip:has(:focus-visible),
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
