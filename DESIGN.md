# Design

## Scene
A trainee at a desk monitor, lights dimmed like a plant control room, switching between a lit 3D production hall and dense ERP screens for an hour. Dark graphite chrome keeps the bright factory and status lights the brightest thing on screen.

## Color (OKLCH, restrained strategy)
Neutrals tinted 0.008–0.014 chroma toward hue 250 (steel blue).

| Token | Value | Role |
|---|---|---|
| `--bg` | oklch(0.165 0.010 250) | app background |
| `--surface-1` | oklch(0.205 0.011 250) | panels, sidebar |
| `--surface-2` | oklch(0.245 0.012 250) | raised rows, inputs |
| `--surface-3` | oklch(0.29 0.013 250) | hover |
| `--line` | oklch(0.32 0.012 250) | borders, dividers |
| `--ink` | oklch(0.95 0.005 250) | primary text (≥ 13:1) |
| `--ink-2` | oklch(0.80 0.010 250) | secondary text (≥ 7:1) |
| `--ink-3` | oklch(0.66 0.012 250) | muted labels (≥ 4.6:1 on surface-1) |
| `--accent` | oklch(0.70 0.135 248) | industrial blue: primary actions, selection |
| `--warn-accent` | oklch(0.80 0.14 80) | safety amber: mission HUD, hazard marks |

Machine/status semantics (always with icon + label): running `oklch(0.74 0.16 150)`, warning `oklch(0.83 0.15 85)`, stopped `oklch(0.66 0.19 25)`, setup/maintenance `oklch(0.72 0.12 220)` (cyan-blue, distinct from the accent).

## Typography
IBM Plex Sans for all UI (400/500/600), IBM Plex Mono for document numbers, T-codes, bins and numeric columns. Fixed rem scale, ratio ~1.18: 11.5 / 12.5 / 13.5 / 15 / 17.5 / 21 / 26px. Tabular numerals everywhere data is shown.

## Components
- Panels: 1px `--line` border, 8px radius, no drop shadows on flat surfaces; overlays use one shadow token.
- Tables: 32px rows, sticky header, mono for IDs, right-aligned numbers.
- Buttons: 32px (default) / 28px (compact); primary = accent fill, secondary = surface-2 with border, danger = stopped tone. `:active` scale 0.97.
- Status pills: dot + label, tinted background at 14% alpha.
- No side-stripe borders, no gradient text, no glass by default. Blur only for overlays above the 3D canvas.

## Motion
150–220ms, `cubic-bezier(0.23, 1, 0.32, 1)` for enter, exits ~70% of enter. No animation on keyboard-triggered palette open. Reduced motion: opacity-only.

## 3D
Physically based materials (painted steel, galvanized racking, epoxy floor with safety lines), one shadow-casting key light, procedural environment lighting (no network HDRIs), instanced meshes for racks and pallets, status beacons on every machine colored by engine state.
