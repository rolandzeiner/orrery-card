/**
 * Visual editor.
 *
 * The title and the two colour choices sit bare at the top; the rest is in
 * three collapsed groups that each say what they are set to. What goes
 * where is data, in editor-fields.ts; this file only draws it.
 *
 * Every field goes through ha-form, so it inherits theme, i18n, dark mode
 * and a11y. Several forms share one config, so each reports only the keys
 * the user touched, and the result is saved without the defaults.
 */
import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { tidyConfig, withDefaults } from "./config";
import { CARD_TAG } from "./const";
import {
  type EditorField,
  fallbackSchema,
  type Group,
  type GroupId,
  GROUPS,
  groupSummary,
  schemaOf,
  topFields,
  type Translate,
} from "./editor-fields";
import { localize, resolveLang } from "./localize/localize";
import type { HomeAssistant } from "./types";

type Data = Record<string, unknown>;

@customElement(`${CARD_TAG}-editor`)
export class OrreryCardEditor extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    .ed {
      display: grid;
      gap: 16px;
    }
    .ed-groups {
      display: grid;
      gap: 8px;
    }
    .ed-body {
      display: grid;
      gap: 8px;
      padding: 4px 0 8px;
    }
    .ed-body hr {
      inline-size: 100%;
      margin: 0;
      border: none;
      border-block-start: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }
    ha-expansion-panel ha-icon[slot="leading-icon"] {
      color: var(--secondary-text-color);
    }
  `;

  @property({ attribute: false }) public hass?: HomeAssistant;

  // Start from a valid config so the form renders even before setConfig.
  @state() private _config: Data = { type: `custom:${CARD_TAG}` };

  /**
   * Groups whose panel is open, so their bodies are built only then. A
   * record of what the panel did, never an instruction to it: see
   * _renderGroup for why `expanded` is not bound.
   */
  @state() private _open = new Set<GroupId>();

  /**
   * Whether ha-expansion-panel is registered. Home Assistant loads it
   * lazily, so a card editor can't count on it. Until it is there the
   * groups are ha-form expandables, which load it; then they switch to
   * panels that can carry a summary line.
   */
  @state() private _panels = customElements.get("ha-expansion-panel") !== undefined;

  public setConfig(config: Data): void {
    this._config = { ...config };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._panels) {
      void customElements.whenDefined("ha-expansion-panel").then(() => {
        this._panels = true;
      });
    }
  }

  private get _lang(): string {
    return resolveLang(this.hass);
  }

  private _t: Translate = (key, vars) => localize(key, this._lang, vars);

  private _label = ({ name }: { name: string }): string => {
    const key = `editor.${name}`;
    const text = this._t(key);
    return text === key ? name : text;
  };

  private _helper = ({ name }: { name: string }): string | undefined => {
    const key = `editor.${name}_helper`;
    const text = this._t(key);
    // localize echoes the key when there is none; undefined draws nothing.
    return text === key ? undefined : text;
  };

  /** Merge `changes` in and save the tidy result. */
  private _apply(changes: Data): void {
    const next = tidyConfig({ ...this._config, ...changes });
    // Lovelace won't call setConfig again while the dialog is open, so
    // keep our own copy current or the form snaps back on the next render.
    this._config = next;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** One ha-form over some of the config's keys, reporting only the keys
   *  the user changed, diffed against what it was given. */
  private _renderForm(fields: readonly EditorField[]): TemplateResult {
    const shown = withDefaults(this._config);
    const data: Data = Object.fromEntries(fields.map((f) => [f.name, shown[f.name]]));
    return html`<ha-form
      .hass=${this.hass}
      .data=${data}
      .schema=${schemaOf(fields)}
      .computeLabel=${this._label}
      .computeHelper=${this._helper}
      @value-changed=${(ev: CustomEvent<{ value: Data }>) => {
        ev.stopPropagation();
        const next = ev.detail.value;
        const changes = Object.fromEntries(
          fields.filter((f) => next[f.name] !== data[f.name]).map((f) => [f.name, next[f.name]]),
        );
        if (Object.keys(changes).length > 0) this._apply(changes);
      }}
    ></ha-form>`;
  }

  /**
   * A collapsible group, its body built only while it is open.
   *
   * `expanded` is deliberately not bound. The panel owns it: on a click it
   * fires expanded-will-change, renders its slot, measures it, pins that
   * height in pixels and animates to it, and only transitionend unpins it.
   * Bound, the re-render that expanded-will-change triggers sets `expanded`
   * before the panel measures, nothing animates, the pixel height stays,
   * and whatever the body grows by afterwards spills over the panels below.
   */
  private _renderGroup(group: Group): TemplateResult {
    return html`<ha-expansion-panel
      outlined
      .header=${this._t(`editor.groups.${group.id}`)}
      .secondary=${groupSummary(group.id, this._config, this._t, this._lang)}
      @expanded-will-change=${(ev: CustomEvent<{ expanded: boolean }>) => {
        ev.stopPropagation();
        const open = new Set(this._open);
        if (ev.detail.expanded) open.add(group.id);
        else open.delete(group.id);
        this._open = open;
      }}
    >
      <ha-icon slot="leading-icon" icon=${group.icon} aria-hidden="true"></ha-icon>
      ${this._open.has(group.id) ? this._renderGroupBody(group) : nothing}
    </ha-expansion-panel>`;
  }

  private _renderGroupBody(group: Group): TemplateResult {
    return html`<div class="ed-body">
      ${this._renderForm(group.common(this._t))}
      ${group.more.length > 0 ? html`<hr />${this._renderForm(group.more)}` : nothing}
    </div>`;
  }

  /** Before ha-expansion-panel exists: the same groups, through ha-form. */
  private _renderFallback(): TemplateResult {
    return html`<ha-form
      .hass=${this.hass}
      .data=${withDefaults(this._config)}
      .schema=${fallbackSchema(this._t)}
      .computeLabel=${this._label}
      .computeHelper=${this._helper}
      @value-changed=${(ev: CustomEvent<{ value: Data }>) => {
        ev.stopPropagation();
        this._apply(ev.detail.value);
      }}
    ></ha-form>`;
  }

  protected override render(): TemplateResult {
    return html`<div class="ed">
      ${this._renderForm(topFields(this._config, this._t))}
      <div class="ed-groups">
        ${this._panels ? GROUPS.map((group) => this._renderGroup(group)) : this._renderFallback()}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "orrery-card-editor": OrreryCardEditor;
  }
}
