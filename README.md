<img src="assets/icon.svg" width="64" height="64" alt="Flappy Dash icon">

# Flappy Dash — Sunset Run

A one-button arcade flyer for the browser. Tap, click, or press space to keep your bird
airborne while threading an endless run of neon pipes through a synthwave sunset.
No frameworks, no build step, no assets to download — the whole game is drawn on a
canvas at runtime.

Created in [T3 Code](https://t3.codes).

## Play

Open the deployed site, or run it locally:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Controls

| Input | Action |
| --- | --- |
| `Space` / `↑` / `W` / tap / click | Flap |
| `P` / `Esc` | Pause / resume |
| `M` | Mute |

## Features

- Canvas physics with a forgiving hitbox, procedurally generated pipe gaps, and a
  difficulty curve that speeds up and tightens as you score.
- Synthwave backdrop with parallax ridges, a striped sun, drifting clouds, twinkling
  stars, and a window-lit skyline.
- Locally synthesised sound effects (Web Audio), mute preference, and a persisted
  high score — no audio or image files needed.
- Responsive layout for phones and desktop, pause on tab blur, reduced-motion support.
- Medals at 10 / 20 / 30 / 40 points.

## Structure

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, HUD, and overlay UI |
| `styles.css` | Layout, panels, buttons, responsive rules |
| `game.js` | Game loop, physics, rendering, audio, input |
| `manifest.webmanifest` | Installable web-app metadata |
| `vercel.json` | Static hosting headers for Vercel |
