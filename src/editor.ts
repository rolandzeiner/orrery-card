import { LitElement, css, html, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { tidyConfig, withDefaults } from "./config";
import { CARD_TAG } from "./const";
import { localize, resolveLang } from "./localize/localize";
import { buildSchema } from "./editor-schema";
import type { HomeAssistant } from "./types";

/** Visual editor: ha-form over the card's options, shown with the card's
 *  real defaults filled in and saved back with only what you changed. */
@customElement(`${CARD_TAG}-editor`)
export class OrreryCardEditor extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
  `;

  @property({ attribute: false }) public hass?: HomeAssistant;

  // Start from a valid config so the form renders even before setConfig.
  @state() private _config: Record<string, unknown> = { type: `custom:${CARD_TAG}` };

  public setConfig(config: Record<string, unknown>): void {
    this._config = { ...config };
  }

  private _t = (key: string): string => localize(`editor.${key}`, resolveLang(this.hass));

  private _label = ({ name }: { name: string }): string => this._t(name);

  private _helper = ({ name }: { name: string }): string | undefined => {
    const text = this._t(`${name}_helper`);
    return text === `editor.${name}_helper` ? undefined : text;
  };

  private _onChange(ev: CustomEvent<{ value: Record<string, unknown> }>): void {
    ev.stopPropagation();
    const next = tidyConfig({ ...this._config, ...ev.detail.value });
    // Lovelace won't call setConfig again while the dialog is open, so
    // keep our own copy current or the form snaps back on the next render.
    this._config = next;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: next }, bubbles: true, composed: true }));
  }

  protected override render(): TemplateResult {
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${withDefaults(this._config)}
        .schema=${buildSchema(this._t)}
        .computeLabel=${this._label}
        .computeHelper=${this._helper}
        @value-changed=${this._onChange}
      ></ha-form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "orrery-card-editor": OrreryCardEditor;
  }
}
