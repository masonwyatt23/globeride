<div align="center">

# GlobeRide

**Virtual cycling on a photorealistic 3D Earth — open source, no subscription, ride anywhere.**

[![MIT License](https://img.shields.io/badge/license-MIT-22d3ee?style=flat-square)](LICENSE)
[![Built with Vite](https://img.shields.io/badge/built%20with-Vite%206-646cff?style=flat-square)](https://vitejs.dev/)
[![Cesium](https://img.shields.io/badge/3D%20globe-Cesium%20ion-2e5f9e?style=flat-square)](https://cesium.com)
[![FTMS](https://img.shields.io/badge/trainer-FTMS%20%2F%20Web%20Bluetooth-5eead4?style=flat-square)](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/)

</div>

GlobeRide is a free, browser-based virtual cycling simulator. Upload a GPX route
from Strava, Komoot, or Garmin — or pick one of 19 iconic climbs — and ride it
on a photoreal 3D globe with real-world terrain and OSM 3D buildings. A
Web Bluetooth FTMS smart trainer (Wahoo Kickr Core, Tacx Neo, Elite Suito,
etc.) simulates the live gradient as you ride. When you finish, export a `.FIT`
file and upload it to Strava.

> No accounts. No subscriptions. No closed routes. MIT-licensed and self-hostable.

---

## What it does

- **Photoreal 3D world** — Cesium World Terrain + OSM 3D buildings, cinematic
  post-processing (bloom, ambient occlusion, tone grading), and three
  graphics-quality tiers (Low / Medium / High).
- **Smart trainer integration** — FTMS over Web Bluetooth pushes real-time
  gradient (SIM mode) or ERG target power to any compatible trainer. Demo Mode
  runs full cycling-power physics when no trainer is connected.
- **Structured workouts** — 44 curated workouts across every training zone
  (endurance, tempo, sweet spot, threshold, VO2 max, sprints), 6 multi-week
  training plans, and an AI workout designer. Rides on ERG with a Zwift-style
  power-profile preview.
- **Training platform** — CTL/ATL/TSB Fitness & Form chart, personal records,
  training calendar, segment leaderboards, XP / level / gear garage, 25
  achievements, and local ride history with `.FIT` export and Strava upload.
- **Local-first, no backend** — everything persists in IndexedDB and
  localStorage. No server, no account, no data leaves your device.

---

## Quickstart

```bash
# 1. Clone and install
git clone https://github.com/masonwyatt23/globeride.git
cd globeride
npm install

# 2. Add your free Cesium ion token
#    Get one at https://ion.cesium.com/tokens (free, unlimited personal use)
echo "VITE_CESIUM_ION_TOKEN=your_token_here" > .env.local

# 3. Start the dev server
npm run dev          # → http://localhost:5173
```

The globe will not render without a Cesium ion token. If you skip the `.env.local`
step, the app will prompt you for a token in the browser and save it to
`localStorage` — no restart needed.

### Other commands

```bash
npm run build        # Production build → ./dist  (static, no server needed)
npm run preview      # Serve the production build → :4173
npm run typecheck    # TypeScript strict check (no emit)
npm run test         # Run all unit tests (vitest)
npm run lint         # ESLint (zero errors required)
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite 6 + vite-plugin-cesium |
| 3D globe | CesiumJS 1.131 + Cesium World Terrain |
| State | Zustand 5 |
| Styling | Tailwind CSS 3 + shadcn-style UI primitives |
| Charts | Recharts |
| Persistence | IndexedDB via `idb`, localStorage |
| PWA | vite-plugin-pwa (installable, offline-capable) |
| Trainer | Web Bluetooth FTMS (service `0x1826`) |
| Testing | vitest |

---

## Project structure

```
globeride/
├── src/
│   ├── components/     # All React UI components
│   ├── hooks/          # Custom hooks (ride loop, workout engine, audio, …)
│   ├── lib/            # Core logic: physics, GPX/FIT parsing, FTMS, workouts, …
│   ├── routes/         # Page components (Landing, Home, Ride, Explore)
│   ├── stores/         # Zustand stores (ride, settings, profile, workouts, …)
│   └── types.ts        # Shared TypeScript types
├── public/             # Static assets (icons, audio, glTF models)
├── scripts/            # Dev utilities (avatar glTF generator)
├── index.html
└── vite.config.ts
```

---

## Cesium ion token

The 3D globe requires a Cesium ion access token. Tokens are free for personal
use — sign up at [ion.cesium.com/tokens](https://ion.cesium.com/tokens).

Resolution order:

1. `VITE_CESIUM_ION_TOKEN` in `.env.local` (gitignored — never commit it)
2. `localStorage['globeride.cesiumIonToken']` — set by the in-app prompt
3. The `CesiumTokenPrompt` UI asks for one on first launch

The token is only needed for live globe rendering. `npm install`,
`npm run typecheck`, `npm run build`, and `npm test` all work without it.

---

## Browser support

Web Bluetooth (trainer pairing) requires Chrome or Edge on desktop or Android.
Safari and iOS fall back to Demo Mode automatically — all other features work
everywhere.

---

## License

[MIT](LICENSE) — free to use, fork, and self-host.
