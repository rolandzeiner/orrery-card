# Orrery Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![Version](https://img.shields.io/github/v/release/rolandzeiner/orrery-card?label=version&color=blue)](https://github.com/rolandzeiner/orrery-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![vibe-coded](https://img.shields.io/badge/vibe-coded-ff69b4?logo=musicbrainz&logoColor=white)](https://en.wikipedia.org/wiki/Vibe_coding)

The solar system in 3D for your Home Assistant dashboard. The card shows where the eight planets are right now, or on any date between 1800 and 2200. Drag it to turn the view, tap a planet to see how far away it is, and play time forward to watch the orbits move.

It runs entirely in your browser. There's no integration to install and nothing is fetched from the internet.

## Features

- **Real positions for any date.** Planet positions come from [Astronomy Engine](https://github.com/cosinekitty/astronomy) (VSOP87) and are within 1 arcminute of NASA JPL data.
- **3D view you can turn.** Drag to rotate, pinch or Ctrl + scroll to zoom, double-click to reset. The view button at the top of the sky switches between tilted, from above and edge-on.
- **Time travel.** Step a day or a month at a time, jump to a date, or play time forward or back at up to 10 years a second. **Now** brings you back to the present.
- **Tap a planet** to see which constellation it's in, how far it is from Earth and from the Sun, and how long its light takes to reach you.
- **Time marks on every orbit.** Each tick is an equal step of time (10 days on Mercury, a year on Jupiter), so Mercury's uneven spacing shows it speeding up near the Sun. Earth's orbit is labelled with the months, and the current month is highlighted.
- **Readouts in the corners:** Moon phase, the Sun–Earth distance, and how far away Mars and Jupiter are.
- **Moon, asteroid belt, Saturn's ring.** The belt leaves the Kirkwood gaps open, and Saturn's ring is tilted at its real angle.
- **Two looks.** *Space* is always dark, like a window onto the sky. *Follow the theme* draws onto your theme's card background, in light or dark mode.
- **Visual editor**, and English and German built in.
- **Easy on wall tablets.** The card only redraws when something changes and pauses when it's off screen.

## Installation

### HACS (recommended)

1. In HACS, open the menu (⋮) and choose **Custom repositories**.
2. Add `https://github.com/rolandzeiner/orrery-card` with the type **Dashboard**.
3. Find **Orrery Card** in HACS and download it.
4. Reload your browser.

### Manual

1. Download `orrery-card.js` from the [latest release](https://github.com/rolandzeiner/orrery-card/releases).
2. Copy it to `<config>/www/orrery-card.js`.
3. Go to **Settings → Dashboards → ⋮ → Resources** and add `/local/orrery-card.js` as a **JavaScript module**.
4. Reload your browser.

## Quick start

Add the card from the dashboard's card picker, or in YAML:

```yaml
type: custom:orrery-card
```

That's all it needs. Every option below is optional.

## Configuration

| Option | Default | What it does |
| --- | --- | --- |
| `title` | none | Heading above the card. |
| `scale` | `log` | How distances are drawn. `log` fits every planet on the card. `sqrt` compresses less. `true` is to scale, so you zoom in to see the inner planets. |
| `tilt` | `1` | Orbit tilt, from `1` to `8`. At `1` the tilts are real, and they're small (7° at most). Higher values exaggerate them. |
| `view` | `all` | Zoom the card opens at: `all` planets or the `inner` four. |
| `appearance` | `space` | `space` is always dark. `theme` follows your dashboard theme. |
| `show_controls` | `true` | Time controls below the sky. |
| `show_date` | `true` | The date in the lower part of the sky. |
| `show_readouts` | `true` | The four readouts in the corners. Hidden automatically on cards narrower than 280 px. |
| `show_labels` | `true` | Planet names. |
| `show_ticks` | `true` | Time marks and month or year labels on the orbits. |
| `show_trails` | `true` | A fading trail behind each planet. |
| `show_belt` | `true` | The asteroid belt. |
| `show_moon` | `true` | The Moon next to Earth. Its distance is exaggerated so you can see it; its direction is real. |
| `ambient_motion` | `true` | Slowly rotates the Sun. Turn it off to save power on a wall tablet. It's always off if your device asks for reduced motion. |

### Examples

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

### Theme variables

Set these in a theme (or with card-mod) to restyle the card:

| Variable | Default | Used for |
| --- | --- | --- |
| `orrery-accent-color` | cyan | Planets, trails, the current month and year |
| `orrery-accent-2-color` | violet | The Sun and the selected planet |
| `orrery-font` | your theme's font | All text on the card |

## Controls

| Action | What happens |
| --- | --- |
| Drag | Rotates the view. |
| Ctrl + scroll, or pinch | Zooms. Plain scrolling scrolls the dashboard. |
| Double-click | Resets the view. |
| Tap a planet | Shows its details below the sky. Tap it again to deselect. |
| Arrow keys (card focused) | Rotate and tilt the view. |
| `+` / `-` / `0` (card focused) | Zoom in, zoom out, reset. |

Below the sky, the time controls step back or forward by a month or a day, play and pause, set the playback speed, and jump to a date. **Now** returns to the present; its dot glows while the card shows the live sky.

The small bar at the top of the sky changes the viewing angle and zooms in or out, so everything you can do by dragging also works with a single tap.

## What's real and what isn't

- Planet positions and the Moon's direction are real.
- Distances are compressed on the `log` and `sqrt` scales. Use `scale: true` for true distances.
- Orbit tilts are real at `tilt: 1`.
- Planet sizes are not to scale. At true size, every planet would be smaller than a pixel.
- The Moon's distance from Earth is exaggerated.

## Accessibility

- **Keyboard:** every control is a real button or input. The sky can be focused and turned with the arrow keys.
- **Screen readers:** the sky has a label with the date shown, and planet details are announced when you select one.
- **Reduced motion:** the rotating Sun and the button animations stop when your device asks for reduced motion.
- **Contrast:** the light-theme accents are darker so small labels stay readable on white.
- **Forced colors:** focus rings use the system colour.

## Translations

The card follows your Home Assistant language, and falls back to English. English and German are built in. To add a language, see [CONTRIBUTING.md](CONTRIBUTING.md#translations).

## Build from source

```bash
npm install
npm run build       # → dist/orrery-card.js
npm run dev         # rebuild on save
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

Positions are calculated with [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT).

## License

[MIT](LICENSE) © Roland Zeiner.
