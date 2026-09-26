import { LitElement, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";

import { PLANET_BY_KEY, type PlanetKey } from "./astro/bodies";
import { helio, planetDetails } from "./astro/ephemeris";
import { DEFAULTS, resolveConfig } from "./config";
import { CARD_NAME, CARD_TAG, CARD_VERSION, DAY_MS, MAX_TIME, MIN_TIME } from "./const";
import "./editor";
import { CardFormat, DEFAULT_SPEED, resolveHour12, resolveTimeZone, SPEEDS, type SpeedKey } from "./format";
import { resolveLang } from "./localize/localize";
import {
  azimuthFacing,
  clampElevation,
  clampZoom,
  DEFAULT_ELEVATION,
  fitSquare,
  VIEW_PRESETS,
  type Camera,
} from "./render/camera";
import { readPalette } from "./render/palette";
import { OrreryRenderer, type RenderOptions } from "./render/renderer";
import { cardStyles } from "./styles";
import type { HomeAssistant, ResolvedConfig } from "./types";

console.info(
  `%c ORRERY-CARD %c ${CARD_VERSION} `,
  "color:#0a0e18;background:#48c9e6;font-weight:600",
  "color:#48c9e6;background:#0a0e18",
);

/** Frame budget for the ambient Sun spin when nothing else is moving. */
const AMBIENT_FRAME_MS = 50;
/** How often live mode checks the clock. The date line shows minutes. */
const LIVE_TICK_MS = 15_000;
const ROTATE_PER_PX = 0.008;
const TILT_PER_PX = 0.006;
const KEY_STEP = (5 * Math.PI) / 180;

@customElement(CARD_TAG)
export class OrreryCard extends LitElement {
  static override styles = cardStyles;

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config: ResolvedConfig = DEFAULTS;
  @state() private _playing = false;
  @state() private _live = true;
  @state() private _selected: PlanetKey | null = null;
  @state() private _speed: SpeedKey = DEFAULT_SPEED;
  @state() private _toast = false;
  /** Bumped when the date input or readout needs re-rendering. */
  @state() private _uiRevision = 0;

  @query("canvas") private _canvas?: HTMLCanvasElement;
  @query(".stage") private _stage?: HTMLElement;
  @query(".probe") private _probe?: HTMLElement;

  private _t = OrreryCard._liveTime();
  private _cam: Camera = { az: 0, el: DEFAULT_ELEVATION, zoom: 1 };
  private _viewPreset = 0;
  private _renderer?: OrreryRenderer;
  private _format?: CardFormat;
  private _formatKey = "";
  private _hassKey = "";
  private _paletteKey = "";
  private _uiKey = "";

  private _resizeObserver?: ResizeObserver;
  private _intersection?: IntersectionObserver;
  private _visible = true;
  private _raf = 0;
  private _dirty = true;
  private _lastFrame = 0;
  private _lastDraw = 0;
  private _lastUiSync = 0;
  private _liveTimer?: ReturnType<typeof setInterval>;
  private _toastTimer?: ReturnType<typeof setTimeout>;
  private readonly _reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  private readonly _pointers = new Map<number, { x: number; y: number }>();
  private _drag: { x0: number; y0: number; az0: number; el0: number; moved: boolean } | null = null;
  private _pinch: { d0: number; z0: number } | null = null;

  // ── HA card contract ───────────────────────────────────────────────────

  public setConfig(config: unknown): void {
    const next = resolveConfig(config);
    const prev = this._config;
    this._config = next;
    if (next.scale !== prev.scale || next.tilt !== prev.tilt || next.view !== prev.view) {
      this._applyOptions();
      this._cam.zoom = this._openingZoom();
    } else {
      this._applyOptions();
    }
    this._requestDraw();
  }

  public getCardSize(): number {
    return this._config.showControls ? 12 : 10;
  }

  public getGridOptions(): Record<string, number> {
    return {
      columns: 12,
      rows: this._config.showControls ? 10 : 8,
      min_columns: 6,
      min_rows: 6,
    };
  }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  public static getConfigElement(): HTMLElement {
    // Synchronous on purpose: the editor module is imported at the top of
    // this file, so the element is always registered by now.
    return document.createElement(`${CARD_TAG}-editor`);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  override connectedCallback(): void {
    super.connectedCallback();
    this._liveTimer = setInterval(() => {
      if (!this._live || this._playing) return;
      const t = OrreryCard._liveTime();
      if (t !== this._t) {
        this._t = t;
        this._requestDraw();
      }
    }, LIVE_TICK_MS);
    document.addEventListener("visibilitychange", this._onVisibility);
    this._reducedMotion.addEventListener("change", this._onMotionPref);
    if (this._renderer) {
      this._observe();
      // The theme may have changed while the card was detached, and a card
      // moved before its first update never got a palette at all.
      void this.updateComplete.then(() => this._refreshPalette(true));
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._liveTimer);
    clearTimeout(this._toastTimer);
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._lastFrame = 0;
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._reducedMotion.removeEventListener("change", this._onMotionPref);
    this._resizeObserver?.disconnect();
    this._intersection?.disconnect();
  }

  /** Re-render the template only when something the card shows changed.
   *  HA reassigns `hass` on every state change in the house. */
  protected override shouldUpdate(changed: PropertyValues<this>): boolean {
    if (changed.size === 1 && changed.has("hass")) {
      const key = this._hassFingerprint();
      if (key === this._hassKey) return false;
    }
    return true;
  }

  protected override firstUpdated(): void {
    const canvas = this._canvas;
    if (!canvas) return;
    this._renderer = new OrreryRenderer(canvas, this._fmt());
    this._applyOptions();
    const earth = helio(PLANET_BY_KEY.earth.body, this._t);
    this._cam.az = azimuthFacing(Math.atan2(earth[1], earth[0]));
    this._cam.zoom = this._openingZoom();
    this._observe();
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has("hass")) this._hassKey = this._hassFingerprint();
    this._refreshPalette(false);
    // The formatter depends on hass (language, zone, clock); swap it in.
    if (this._renderer && changed.has("hass")) {
      this._renderer.setTexts(this._fmt());
      this._requestDraw();
    }
  }

  /** Re-read the canvas colours when the appearance or theme changed, or
   *  when an earlier read failed. The key is only stored on success, so a
   *  read that happened while the card was detached is retried. */
  private _refreshPalette(force: boolean): void {
    const renderer = this._renderer;
    const probe = this._probe;
    if (!renderer || !probe) return;
    const key = `${this._config.appearance}|${this._hassKey}`;
    if (!force && key === this._paletteKey && renderer.hasPalette) return;
    const palette = readPalette(probe);
    if (!palette) {
      this._paletteKey = "";
      return;
    }
    this._paletteKey = key;
    renderer.setPalette(palette);
    this._requestDraw();
  }

  private _observe(): void {
    const stage = this._stage;
    if (!stage) return;
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || !this._renderer) return;
      // Being laid out means being in the document: a good moment to retry
      // a palette read that failed earlier.
      if (!this._renderer.hasPalette) this._refreshPalette(true);
      const size = Math.floor(fitSquare(box.width, box.height));
      if (size > 0 && Math.abs(size - this._renderer.cssSize) >= 1) {
        this._renderer.resize(size, window.devicePixelRatio);
        this._draw(performance.now());
      }
    });
    this._resizeObserver.observe(stage);
    this._intersection?.disconnect();
    this._intersection = new IntersectionObserver((entries) => {
      this._visible = entries.some((e) => e.isIntersecting);
      if (this._visible) this._requestDraw();
    });
    this._intersection.observe(stage);
  }

  // ── Drawing ────────────────────────────────────────────────────────────

  private static _liveTime(): number {
    // Minute resolution: the date line shows minutes, and a steady t lets
    // the sky snapshot stay cached while the Sun spins.
    return Math.floor(Date.now() / 60_000) * 60_000;
  }

  private _ambient(): boolean {
    return this._config.ambientMotion && !this._reducedMotion.matches;
  }

  private _loopWanted(): boolean {
    return this._visible && !document.hidden && (this._playing || this._ambient());
  }

  private _requestDraw(): void {
    this._dirty = true;
    if (!this._raf && this.isConnected) this._raf = requestAnimationFrame(this._frame);
  }

  private readonly _frame = (ts: number): void => {
    this._raf = 0;
    const dt = this._lastFrame ? Math.min(ts - this._lastFrame, 100) : 16;
    this._lastFrame = ts;
    if (this._playing) {
      const speed = SPEEDS.find((s) => s.key === this._speed)?.days ?? 30.44;
      const next = this._t + speed * DAY_MS * (dt / 1000);
      this._t = Math.max(MIN_TIME, Math.min(MAX_TIME, next));
      if (this._t === MIN_TIME || this._t === MAX_TIME) this._playing = false;
    }
    if (this._dirty || this._playing || ts - this._lastDraw >= AMBIENT_FRAME_MS) {
      this._draw(ts);
    }
    if (this._loopWanted()) {
      this._raf = requestAnimationFrame(this._frame);
    } else {
      this._lastFrame = 0;
    }
  };

  private _draw(ts: number): void {
    const renderer = this._renderer;
    if (!renderer) return;
    this._dirty = false;
    this._lastDraw = ts;
    const fmt = this._fmt();
    renderer.draw({
      t: this._t,
      ts,
      cam: this._cam,
      selected: this._selected,
      date: fmt.dateLine(this._t, {
        live: this._live,
        playing: this._playing,
        speed: this._speed,
        now: Date.now(),
      }),
    });
    this._syncUi(ts, fmt);
  }

  /** Throttled bridge from the canvas clock to the Lit template: the date
   *  input and the readout sentence. */
  private _syncUi(ts: number, fmt: CardFormat): void {
    if (this._playing && ts - this._lastUiSync < 100) return;
    this._lastUiSync = ts;
    const key = `${fmt.isoDate(this._t)}|${this._selected}|${Math.floor(this._t / 3_600_000)}|${this._live}`;
    if (key !== this._uiKey) {
      this._uiKey = key;
      this._uiRevision++;
    }
  }

  private _renderOptions(): RenderOptions {
    const c = this._config;
    return {
      scale: c.scale,
      tilt: c.tilt,
      showDate: c.showDate,
      showReadouts: c.showReadouts,
      showLabels: c.showLabels,
      showTicks: c.showTicks,
      showTrails: c.showTrails,
      showBelt: c.showBelt,
      showMoon: c.showMoon,
      ambient: this._ambient(),
    };
  }

  private _applyOptions(): void {
    this._renderer?.setOptions(this._renderOptions());
  }

  private _openingZoom(): number {
    return this._config.view === "inner" && this._renderer ? this._renderer.innerZoom() : 1;
  }

  private _fmt(): CardFormat {
    const lang = resolveLang(this.hass);
    const tz = resolveTimeZone(this.hass);
    const hour12 = resolveHour12(this.hass);
    const key = `${lang}|${tz}|${hour12}`;
    if (!this._format || key !== this._formatKey) {
      this._format = new CardFormat(lang, tz, hour12);
      this._formatKey = key;
    }
    return this._format;
  }

  private _hassFingerprint(): string {
    const h = this.hass;
    return [
      resolveLang(h),
      resolveTimeZone(h),
      resolveHour12(h),
      h?.themes?.darkMode,
      h?.themes?.theme,
      h?.selectedTheme?.theme,
    ].join("|");
  }

  private _isDark(): boolean {
    return this.hass?.themes?.darkMode ?? window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // ── Events ─────────────────────────────────────────────────────────────

  private readonly _onVisibility = (): void => {
    if (!document.hidden) this._requestDraw();
  };

  private readonly _onMotionPref = (): void => {
    this._applyOptions();
    this._requestDraw();
  };

  private _onPointerDown(e: PointerEvent): void {
    const canvas = e.currentTarget as HTMLCanvasElement;
    canvas.setPointerCapture(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 1) {
      this._drag = { x0: e.clientX, y0: e.clientY, az0: this._cam.az, el0: this._cam.el, moved: false };
    } else if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      if (a && b) this._pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: this._cam.zoom };
      this._drag = null;
    }
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pinch && this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      if (a && b) this._setZoom((this._pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / this._pinch.d0);
    } else if (this._drag) {
      const dx = e.clientX - this._drag.x0;
      const dy = e.clientY - this._drag.y0;
      if (Math.abs(dx) + Math.abs(dy) > 4) this._drag.moved = true;
      this._cam.az = this._drag.az0 + dx * ROTATE_PER_PX;
      this._cam.el = clampElevation(this._drag.el0 + dy * TILT_PER_PX);
      this._requestDraw();
    }
  }

  private _onPointerUp(e: PointerEvent): void {
    // Pointer cancellation (WCAG 2.5.2): selection fires on the up event,
    // and only for a tap that didn't turn into a drag.
    if (e.type === "pointerup" && this._drag && !this._drag.moved && this._renderer) {
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const hit = this._renderer.pick(e.clientX - rect.left, e.clientY - rect.top);
      this._selected = hit && hit !== this._selected ? hit : null;
      this._uiKey = "";
      this._requestDraw();
    }
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 2) this._pinch = null;
    if (this._pointers.size === 0) this._drag = null;
  }

  private readonly _wheel = {
    handleEvent: (e: WheelEvent): void => {
      // Plain scrolling belongs to the dashboard. Zoom only with Ctrl (a
      // trackpad pinch arrives as Ctrl + wheel, so that works too).
      if (!(e.ctrlKey || e.metaKey)) {
        this._toast = true;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => (this._toast = false), 1400);
        return;
      }
      e.preventDefault();
      this._setZoom(this._cam.zoom * Math.exp(-e.deltaY * 0.004));
    },
    passive: false,
  };

  private _onKeyDown(e: KeyboardEvent): void {
    let handled = true;
    if (e.key === "ArrowLeft") this._cam.az -= KEY_STEP;
    else if (e.key === "ArrowRight") this._cam.az += KEY_STEP;
    else if (e.key === "ArrowUp") this._cam.el = clampElevation(this._cam.el + KEY_STEP);
    else if (e.key === "ArrowDown") this._cam.el = clampElevation(this._cam.el - KEY_STEP);
    else if (e.key === "+" || e.key === "=") this._setZoom(this._cam.zoom * 1.15);
    else if (e.key === "-") this._setZoom(this._cam.zoom / 1.15);
    else if (e.key === "0") this._resetView();
    else handled = false;
    if (handled) {
      e.preventDefault();
      this._requestDraw();
    }
  }

  private _setZoom(z: number): void {
    this._cam.zoom = clampZoom(z);
    this._requestDraw();
  }

  private _resetView(): void {
    const earth = helio(PLANET_BY_KEY.earth.body, this._t);
    this._cam.az = azimuthFacing(Math.atan2(earth[1], earth[0]));
    this._cam.el = DEFAULT_ELEVATION;
    this._cam.zoom = this._openingZoom();
    this._viewPreset = 0;
    this._requestDraw();
  }

  private _cycleView(): void {
    this._viewPreset = (this._viewPreset + 1) % VIEW_PRESETS.length;
    this._cam.el = VIEW_PRESETS[this._viewPreset] ?? DEFAULT_ELEVATION;
    this._requestDraw();
  }

  private _togglePlay(): void {
    this._playing = !this._playing;
    if (this._playing) this._live = false;
    this._requestDraw();
  }

  private _goNow(): void {
    this._playing = false;
    this._live = true;
    this._t = OrreryCard._liveTime();
    this._requestDraw();
  }

  private _step(days: number, months: number): void {
    const d = new Date(this._t);
    if (months) d.setUTCMonth(d.getUTCMonth() + months);
    const t = d.getTime() + days * DAY_MS;
    this._t = Math.max(MIN_TIME, Math.min(MAX_TIME, t));
    this._live = false;
    this._requestDraw();
  }

  private _onDateInput(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return;
    // Shift by whole days so the time of day stays put.
    const [y, mo, d] = this._fmt().ymd(this._t);
    const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const shift = target - Date.UTC(y, mo - 1, d);
    this._t = Math.max(MIN_TIME, Math.min(MAX_TIME, this._t + shift));
    this._live = false;
    this._playing = false;
    this._requestDraw();
  }

  private _onSpeed(e: Event): void {
    const key = (e.target as HTMLSelectElement).value;
    const match = SPEEDS.find((s) => s.key === key);
    if (match) this._speed = match.key;
  }

  // ── Template ───────────────────────────────────────────────────────────

  protected override render(): TemplateResult {
    const c = this._config;
    const fmt = this._fmt();
    const dark = this._isDark();
    return html`
      <ha-card
        class=${classMap({ space: c.appearance === "space", theme: c.appearance === "theme", dark })}
      >
        <span class="probe" aria-hidden="true"></span>
        ${c.title ? html`<h2 class="title">${c.title}</h2>` : nothing}
        <div class="stage">
          <canvas
            tabindex="0"
            role="img"
            aria-label=${fmt.t("card.canvas_label", { date: fmt.isoDate(this._t) })}
            @pointerdown=${this._onPointerDown}
            @pointermove=${this._onPointerMove}
            @pointerup=${this._onPointerUp}
            @pointercancel=${this._onPointerUp}
            @dblclick=${this._resetView}
            @wheel=${this._wheel}
            @keydown=${this._onKeyDown}
          ></canvas>
          ${c.showControls ? this._renderViewBar(fmt) : nothing}
          ${this._toast ? html`<div class="toast" role="status">${fmt.t("card.zoom_hint")}</div>` : nothing}
        </div>
        <p class="readout" aria-live="polite">${this._readout(fmt)}</p>
        ${c.showControls ? this._renderControls(fmt) : nothing}
      </ha-card>
    `;
  }

  private _readout(fmt: CardFormat): TemplateResult | string {
    const key = this._selected;
    if (!key) return fmt.t("card.readout_idle");
    const def = PLANET_BY_KEY[key];
    const details = planetDetails(def.body, this._t);
    const name = fmt.planetName(key);
    // Split the sentence on the name so it can be emphasised without
    // putting markup into the translation.
    const MARK = "\u0000";
    const text =
      key === "earth"
        ? fmt.t("card.readout_earth", { sun: fmt.au(details.sunAu, 4), light: fmt.lightTime(details.sunAu) })
        : fmt.t("card.readout_planet", {
            name: MARK,
            constellation: details.constellation,
            earth: fmt.au(details.earthAu),
            sun: fmt.au(details.sunAu),
            light: fmt.lightTime(details.earthAu),
          });
    if (key === "earth") return html`<strong class="home">${name}</strong> · ${text}`;
    const [before = "", after = ""] = text.split(MARK);
    return html`${before}<strong>${name}</strong>${after}`;
  }

  private _iconButton(label: string, icon: string, onClick: () => void): TemplateResult {
    return html`
      <button type="button" class="icon" aria-label=${label} title=${label} @click=${onClick}>
        <ha-icon icon=${icon} aria-hidden="true"></ha-icon>
      </button>
    `;
  }

  /** Viewing controls sit on the sky they act on: the single-pointer
   *  alternative to dragging and pinching (WCAG 2.5.1, 2.5.7). */
  private _renderViewBar(fmt: CardFormat): TemplateResult {
    return html`
      <div class="viewbar" role="group" aria-label=${fmt.t("controls.view_group")}>
        ${this._iconButton(fmt.t("controls.view"), "mdi:rotate-3d-variant", () => this._cycleView())}
        ${this._iconButton(fmt.t("controls.zoom_out"), "mdi:minus", () => this._setZoom(this._cam.zoom / 1.3))}
        ${this._iconButton(fmt.t("controls.zoom_in"), "mdi:plus", () => this._setZoom(this._cam.zoom * 1.3))}
      </div>
    `;
  }

  /** Time controls: a transport strip around one play button, and a quieter
   *  line underneath for speed, date and the way back to now. */
  private _renderControls(fmt: CardFormat): TemplateResult {
    const playLabel = fmt.t(this._playing ? "controls.pause" : "controls.play");
    return html`
      <div class="controls">
        <div class="transport" role="group" aria-label=${fmt.t("controls.time_group")}>
          ${this._iconButton(fmt.t("controls.back_month"), "mdi:chevron-double-left", () => this._step(0, -1))}
          ${this._iconButton(fmt.t("controls.back_day"), "mdi:chevron-left", () => this._step(-1, 0))}
          <button
            type="button"
            class=${classMap({ play: true, active: this._playing })}
            aria-label=${playLabel}
            title=${playLabel}
            @click=${this._togglePlay}
          >
            <ha-icon icon=${this._playing ? "mdi:pause" : "mdi:play"} aria-hidden="true"></ha-icon>
          </button>
          ${this._iconButton(fmt.t("controls.forward_day"), "mdi:chevron-right", () => this._step(1, 0))}
          ${this._iconButton(fmt.t("controls.forward_month"), "mdi:chevron-double-right", () => this._step(0, 1))}
        </div>
        <div class="timeline">
          <label class="chip">
            <select aria-label=${fmt.t("controls.speed")} title=${fmt.t("controls.speed")} @change=${this._onSpeed}>
              ${SPEEDS.map(
                (s) => html`<option value=${s.key} ?selected=${s.key === this._speed}>${fmt.speedLabel(s.key)}</option>`,
              )}
            </select>
            <ha-icon class="chevron" icon="mdi:chevron-down" aria-hidden="true"></ha-icon>
          </label>
          <label class="chip">
            <input
              type="date"
              aria-label=${fmt.t("controls.go_to_date")}
              title=${fmt.t("controls.go_to_date")}
              min="1800-01-01"
              max="2200-12-31"
              .value=${fmt.isoDate(this._t)}
              @change=${this._onDateInput}
            />
          </label>
          <button
            type="button"
            class="now"
            title=${fmt.t("controls.now_label")}
            aria-pressed=${this._live ? "true" : "false"}
            @click=${this._goNow}
          >
            <span class="dot" aria-hidden="true"></span>${fmt.t("controls.now")}
          </button>
        </div>
      </div>
    `;
  }
}

// ── Picker registration ──────────────────────────────────────────────────

interface CustomCardEntry {
  type: string;
  name: string;
  description?: string;
  preview?: boolean;
  documentationURL?: string;
}
const registry = window as unknown as { customCards?: CustomCardEntry[] };
registry.customCards ??= [];
if (!registry.customCards.some((c) => c.type === CARD_TAG)) {
  registry.customCards.push({
    type: CARD_TAG,
    name: CARD_NAME,
    description: "The solar system in 3D, with real planet positions for any date.",
    preview: true,
    documentationURL: "https://github.com/rolandzeiner/orrery-card",
  });
}

declare global {
  interface HTMLElementTagNameMap {
    "orrery-card": OrreryCard;
  }
}
