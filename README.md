# <sub><sub><img src="https://raw.githubusercontent.com/rolandzeiner/orrery-card/main/brand/icon.png" width="40" height="40" alt=""></sub></sub> Orrery Card

[![Marketplace](https://img.shields.io/badge/Marketplace-Catalog-41BDF5.svg)](https://www.home-assistant.io/integrations/marketplace/)
[![Version](https://img.shields.io/github/v/release/rolandzeiner/orrery-card?label=version&color=blue)](https://github.com/rolandzeiner/orrery-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![vibe-coded](https://img.shields.io/badge/vibe-coded-ff69b4?logo=musicbrainz&logoColor=white)](https://en.wikipedia.org/wiki/Vibe_coding)
[![Live demo](https://img.shields.io/badge/live-demo-2196F3.svg)](https://demo.rolandzeiner.at/#orrery)

The solar system in 3D for your Home Assistant dashboard: where the eight planets are right now, or on any date between 1800 and 2200. It runs entirely in your browser, with no integration to install and nothing fetched from the internet.

## Screenshots

<table>
  <tr>
    <td align="center" valign="top">
      <img src="https://raw.githubusercontent.com/rolandzeiner/orrery-card/main/screenshots/card.webp" height="300" alt="Orrery Card in the Spock colour theme" />
      <br/><em>Spock theme</em>
    </td>
    <td align="center" valign="top">
      <img src="https://raw.githubusercontent.com/rolandzeiner/orrery-card/main/screenshots/card-2.webp" height="300" alt="Orrery Card in the Kenobi colour theme" />
      <br/><em>Kenobi theme</em>
    </td>
    <td align="center" valign="top">
      <img src="https://raw.githubusercontent.com/rolandzeiner/orrery-card/main/screenshots/card-config.webp" height="240" alt="The visual card editor" />
      <br/><em>Card editor</em>
    </td>
  </tr>
</table>

## Features

- **Real positions for any date**, within 1 arcminute of NASA JPL data, calculated by [Astronomy Engine](https://github.com/cosinekitty/astronomy) (VSOP87).
- **A 3D view you can turn**: drag to rotate, pinch to zoom, or switch between tilted, from above and edge-on.
- **Time travel**: step a day or a month, jump to a date, or play time forward or back at up to 10 years a second.
- **Tap a planet** to see its constellation, its distance from Earth and the Sun, and how long its light takes to reach you.
- **Time marks on every orbit**, in equal steps of time, so Mercury visibly speeds up near the Sun. Earth's orbit shows the months.
- **Readouts and extras**: Moon phase and planet distances in the corners, the Moon, the asteroid belt, Saturn's ring, and Pluto if you want it.
- **Four colour themes on two backgrounds**: an always-dark sky, or your theme's card in light or dark mode.
- **Light on wall tablets**: redraws only when something changes and pauses off screen. Works by keyboard and screen reader, in English and German.

## Installation

### Marketplace (recommended)

The Marketplace is HACS, built into Home Assistant since 2026.11.

1. In Home Assistant, go to **Settings → Marketplace** and search for **Orrery Card**.
2. Select it, then select **Install**. Then reload your browser.

[![Open this repository in the Marketplace of your Home Assistant.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=rolandzeiner&repository=orrery-card&category=plugin)

On Home Assistant older than 2026.11, use HACS instead: search for **Orrery Card**, select **Download**, then reload the browser.

### Manual

1. Download `orrery-card.js` from the [latest release](https://github.com/rolandzeiner/orrery-card/releases).
2. Copy it to `<config>/www/orrery-card.js`.
3. Go to **Settings → Dashboards → ⋮ → Resources** and add `/local/orrery-card.js` as a **JavaScript module**.
4. Reload your browser.

## Configuration

Add the card from the dashboard's card picker and set it up in the visual editor, or in YAML. Every option is optional, so this is a complete card:

```yaml
type: custom:orrery-card
```

| Option | Default | What it does |
| --- | --- | --- |
| `title` | none | Heading above the card. |
| `scale` | `log` | How distances are drawn. `log` fits every planet on the card. `sqrt` compresses less. `true` is to scale, so you zoom in to see the inner planets. |
| `tilt` | `1` | Orbit tilt, from `1` to `8`. At `1` the tilts are real, and they're small: 7° at most for the planets, 17° for Pluto. Higher values exaggerate them. |
| `view` | `all` | Zoom the card opens at: `all` planets or the `inner` four. |
| `color_theme` | `vibe` | Colours for the planets, the Sun and the controls: `vibe`, `ha`, `kenobi` or `spock`. See *Colour themes*. |
| `appearance` | `space` | Background. `space` is always dark. `theme` draws on your dashboard theme's card background. |
| `show_controls` | `true` | Time controls below the sky. |
| `show_date` | `true` | The date in the lower part of the sky. |
| `show_readouts` | `true` | The four readouts in the corners. Hidden automatically on cards narrower than 280 px. |
| `show_labels` | `true` | Planet names. |
| `show_ticks` | `true` | Time marks and month or year labels on the orbits. |
| `show_trails` | `true` | A fading trail behind each planet. |
| `show_belt` | `true` | The asteroid belt. It leaves the Kirkwood gaps open. |
| `show_moon` | `true` | The Moon next to Earth. Its distance is exaggerated so you can see it; its direction is real. |
| `show_pluto` | `false` | Pluto, the dwarf planet, on its tilted, stretched orbit. Its orbit reaches past Neptune's, so on the `sqrt` and `true` scales part of it runs off the card until you zoom out. |
| `ambient_motion` | `true` | Slowly rotates the Sun. Turn it off to save power on a wall tablet. It's always off if your device asks for reduced motion. |

The card follows your Home Assistant language and falls back to English.

### Colour themes

| Theme | Planets | Sun and selection | On the dark background |
| --- | --- | --- | --- |
| `vibe` | cyan | violet | deep navy sky |
| `ha` | your theme's primary colour | your theme's accent colour | deep navy sky |
| `kenobi` | bright yellow | red | black sky, pale gold text |
| `spock` | orange | lavender blue | black sky, peach text |

The colour theme and the background combine freely. With `appearance: theme` on a light dashboard, each theme switches to darker shades of its colours, so small text stays readable on white.

*Kenobi* and *Spock* are fan-made colour schemes. They aren't affiliated with or endorsed by the owners of those characters.

Set these variables in a theme, or with card-mod, to override any colour theme:

| Variable | Default | Used for |
| --- | --- | --- |
| `--orrery-accent-color` | cyan | Planets, trails, the current month and year |
| `--orrery-accent-2-color` | violet | The Sun and the selected planet |
| `--orrery-font` | your theme's font | All text on the card |

### Controls

| Action | What happens |
| --- | --- |
| Drag | Rotates the view. |
| Ctrl + scroll, or pinch | Zooms. Plain scrolling scrolls the dashboard. |
| Double-click | Resets the view. |
| Tap a planet | Shows its details below the sky. Tap it again to deselect. |
| Arrow keys (card focused) | Rotate and tilt the view. |
| `+` / `-` / `0` (card focused) | Zoom in, zoom out, reset. |

Below the sky, the time controls step back or forward by a month or a day, play and pause, set the playback speed, and jump to a date. **Now** returns to the present; its dot glows while the card shows the live sky.

The small bar at the top of the sky changes the viewing angle and zooms in or out, so everything you can do by dragging also works with a tap. Every control is a real button or input, the sky has a label with the date shown, and screen readers announce a planet's details when you select it. In forced-colours mode, focus rings use the system colour.

## Examples

A display-only card for a wall tablet:

```yaml
type: custom:orrery-card
show_controls: false
ambient_motion: false
```

The inner planets, with exaggerated tilts, drawn on your theme:

```yaml
type: custom:orrery-card
view: inner
tilt: 4
appearance: theme
```

## Known limitations

- **Distances are compressed** on the `log` and `sqrt` scales. Use `scale: true` for true distances.
- **Planet sizes are not to scale.** At true size, every planet would be smaller than a pixel.
- **The Moon's distance from Earth is exaggerated.** Its direction is real.
- **Orbit tilts are real only at `tilt: 1`.**
- **Dates run from 1800 to 2200.**

## Removal

1. Remove the card from your dashboards.
2. In **Settings → Marketplace**, open **Orrery Card**, then ⋮ → **Uninstall**. Reload your browser.

After a manual install, delete `<config>/www/orrery-card.js` and its dashboard resource instead.

## Attribution

- [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT) calculates the positions. It's based on the VSOP87 planetary theory by P. Bretagnon and G. Francou, and models Pluto with its own numerical integration.
- [Lit](https://lit.dev) by Google (BSD-3-Clause) runs the card.

Both notices ship inside the released `orrery-card.js`.

## License

[MIT](https://github.com/rolandzeiner/orrery-card/blob/main/LICENSE) © Roland Zeiner.

To build from source, add a language or contribute, see [CONTRIBUTING.md](https://github.com/rolandzeiner/orrery-card/blob/main/CONTRIBUTING.md).

## Disclaimer

This card is provided as is, without warranty of any kind. It is not affiliated with or endorsed by Home Assistant or the Open Home Foundation. **Positions are calculated, not observed, and the drawing is not to scale.** Use at your own risk.

---

Diese Karte wird ohne jede Gewährleistung bereitgestellt. Sie steht in keiner Verbindung zu Home Assistant oder der Open Home Foundation und wird von diesen nicht unterstützt. **Die Positionen sind berechnet, nicht beobachtet, und die Darstellung ist nicht maßstabsgetreu.** Nutzung auf eigene Verantwortung.
