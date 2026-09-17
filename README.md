# ARGUS — Live World Event Monitor

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://analogarcade.github.io/argus-world-monitor/)
[![GitHub release](https://img.shields.io/github/v/release/analogarcade/argus-world-monitor)](https://github.com/analogarcade/argus-world-monitor/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[➤ Open the live app](https://analogarcade.github.io/argus-world-monitor/)** — no install, no signup, no API keys.

A lightweight, single-file world event monitor. Open `index.html` in any modern
browser — no build step, no backend, no accounts, no API keys.

Every panel shows **live data from free public sources**. If a source can't be
reached, the panel says so instead of showing fake data. No demo data, ever.

![ARGUS dashboard](docs/screenshot.png)

## Quick start

1. **[Use it live](https://analogarcade.github.io/argus-world-monitor/)** — hosted with GitHub Pages.
2. Or clone/download this folder and open `index.html` in Chrome, Edge, or Firefox.
3. All map layers load automatically — just explore.

Internet is required for live data (map tiles + APIs). Offline, the app still
opens and says so honestly.

## Features

- **Fullscreen live world map** (Leaflet + Esri dark canvas, fixed single-world
   view, no zoom/pan) with all layers always on: earthquakes M4.5+, micro-quakes
   M2.5–4.5, storms, volcanoes, floods, airports, air quality, night shade,
   **ISS with labeled marker + ±90 min full-orbit track (SGP4)**
- **Fused alerts** derived only from live feeds (never fabricated)
- **Global news** across 9 BBC regions via RSS (World, Africa, Asia, Europe,
  Middle East, Americas, Business, Tech, Science)
- **Wikipedia current-events log**, worldwide public holidays, world clocks
- **Upcoming rocket launches** with countdowns and pad weather
- **City weather, airport weather, FX rates, crypto + indices**
- UTC clock, live cursor coordinates, About guide
- **Mobile + desktop optimized**: full-bleed map on desktop, world-hugging map
  on phones, 40px+ touch targets, horizontal legend, touch-neutral copy

## Live sources (all keyless)

| Data | Source |
|---|---|
| Map tiles | Esri + OpenStreetMap |
| Earthquakes M4.5+ | USGS |
| Micro-quakes M2.5–4.5 | EMSC (FDSN) |
| Storms, volcanoes, floods | NASA EONET |
| City/airport weather, air quality | Open-Meteo |
| Launches | RocketLaunch.Live |
| ISS orbit + track (±90 min) | CelesTrak TLE + SGP4 (satellite.js), wheretheiss.at live anchor |
| News | BBC RSS (rss2json fallback) |
| Event log | Wikipedia API |
| Holidays | Nager.Date |
| FX rates | Frankfurter |
| Crypto | CoinGecko · Indices: Stooq |

## ISS tracking

- Orbit model: CelesTrak TLE for NORAD 25544 propagated locally with SGP4
  (satellite.js 4.1.4 CDN), ±90 min full-orbit track at 1 min steps.
- TLE cached in `localStorage` (12h TTL, 7-day max age) plus a bundled fallback
  TLE, so the track draws instantly even offline; refreshed every 6h.
- `wheretheiss.at` remains as a live calibration anchor (polled every ~15s once
  the orbit model is up) with the legacy 2-fix vector as offline fallback.
- Track style: past grey dashed, next 60 min bright, 60–90 min faint forecast.

## Project structure

```text
world-signal/  (repo: argus-world-monitor)
├── index.html          # shell (HTML + CSP, loads satellite.js / styles.css / app.js)
├── styles.css          # app styles (CSP-strict: no inline <style>)
├── app.js              # app logic (CSP-strict: no inline <script>/onclick)
├── docs/
│   ├── screenshot.png  # dashboard screenshot (README)
│   └── og-preview.png  # 1280×640 social preview (upload in repo Settings)
├── README.md
├── LICENSE
└── .gitignore
```

## Keywords

world event monitor, earthquake map live, ISS tracker, live flight/storm/volcano
map, open-meteo weather dashboard, USGS earthquake feed, EONET events, single-file
web app, no-api-key dashboard, github pages live map.

## Data policy

- Real data only — no simulated events, prices, or alerts.
- Every external source has loading / error / retry states.
- Statuses reflect reality; stale data is labeled STALE.

## License

MIT — see [LICENSE](LICENSE).
