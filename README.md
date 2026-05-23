<div align="center">

# GlobeRide

**Ride anywhere on Earth. Real photoreal terrain, real smart trainers, real racing — open source, local-first, no account.**

[![MIT License](https://img.shields.io/badge/license-MIT-22d3ee?style=flat-square)](LICENSE)
[![Built with Vite](https://img.shields.io/badge/built%20with-Vite%206-646cff?style=flat-square)](https://vitejs.dev/)
[![Cesium](https://img.shields.io/badge/3D%20globe-Cesium%20ion-2e5f9e?style=flat-square)](https://cesium.com)
[![FTMS](https://img.shields.io/badge/trainer-FTMS%20%2F%20Web%20Bluetooth-5eead4?style=flat-square)](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/)

🌍 Live at **https://globeride.vercel.app** · **https://globeri.de**

</div>

---

## What makes GlobeRide different

- **Photoreal 3D Earth** — Google 3D Tiles + Cesium World Terrain + Bing Aerial imagery, not a cartoon map. Cinematic post-processing: bloom, ambient occlusion, tone grading, 8 atmospheric moods with live weather particle systems.
- **Real smart-trainer integration** — FTMS over Web Bluetooth pushes live gradient (SIM mode) or ERG target power to Wahoo Kickr Core, Tacx Neo, Elite Suito, Saris, Zwift Hub, and any other FTMS-compliant trainer.
- **AI coach and route recommender** — xAI-powered daily ride recommendations, adaptive weekly training review, AI workout designer, and AI scenic route discovery.
- **Permissionless P2P racing** — anyone can publish a race as a signed `.race.json` manifest (or `?race=` URL). No server, no accounts, no backend required.
- **Local-first, zero backend** — everything persists in IndexedDB and localStorage. No account, no subscription, no data leaves your device (except optional Strava upload).

---

## Features at a glance

### World
- 19 iconic climbs built-in: Alpe d'Huez, Mont Ventoux, Stelvio, Mortirolo, Tourmalet, Angliru, Zoncolan, Galibier, Hautacam, Sa Calobra, Trollstigen, Mauna Kea, Pico de Veleta, Col d'Izoard, Willunga Hill, Box Hill, Old La Honda, Central Park Loop, Promenade des Anglais
- 6 curated Grand Tour stages (Tour de France, Giro d'Italia, Vuelta a España) with authentic summits and hero narratives
- Upload any GPX from Strava, Komoot, or Garmin — or draw a route on the map via OSRM real-road cycling routing
- `/explore` — cinematic globe with discovery markers, pulsing pins, and AI route recommendations
- 8 atmospheric scene moods (golden hour, alpine storm, Mediterranean mist, fjord rain, …) auto-assigned per route with weather particle systems

### Riding
- 3D animated cyclist — road, gravel, and TT variants with PBR glTF models and procedural pedalling animation
- Ghost riders — race past attempts as translucent avatars on the same course
- AI pace partners (PaceBots) with named personalities and aerodynamic drafting physics
- Gradient-coloured route line, 2D minimap, climb-name HUD banners, achievement poppers
- Ride audio — synthesised ambient soundscape, effort cues, zone chimes
- ERG mode and SIM mode; Demo Mode with full cycling-power physics when no trainer is connected
- Screen wake-lock, keyboard shortcuts, PWA installable + offline

### Training
- 44 curated workouts across every zone: recovery, Z2 endurance, tempo, sweet spot, threshold, over-under, VO2 max, sprints, Tabata, climbing repeats, FTP ramp test
- 6 multi-week training plans with calendar view, streaks, and today/next-up CTAs
- Zwift-style power-profile preview before every workout
- CTL/ATL/TSB Fitness and Form chart (Performance Management Chart)
- Post-ride analytics: power curve, time-in-zones, per-km splits
- Personal records board, weekly/monthly trend charts
- AI workout designer: describe what you want, get a structured workout

### Social and racing
- P2P race protocol — create or import a signed `.race.json`, share via link, race live, export shareable result cards
- Race Lobby with live leaderboard
- Local segment leaderboards (personal records on every climb)
- Ride finish card: Zwift-style 1080×1350 PNG auto-generated and downloadable

### Hardware and platform
- Web Bluetooth FTMS (SIM + ERG) for any compatible smart trainer
- BLE HR monitor and cadence sensor pairing
- Phone companion screen (`/companion`) — BroadcastChannel HR/cadence bridge and remote ride control
- `.FIT` export (Strava-ready binary) with optional one-tap Strava auto-upload
- Chrome/Edge desktop + Android for trainer pairing; Safari/iOS use Demo Mode automatically

### Customisation and progression
- XP, levels, and a gear garage — road, gravel, and TT bikes with colourways and helmets
- 25 achievements (bronze → platinum) tied to distance, elevation, ride count, and level milestones
- Rider settings: weight, height, FTP, target power
- Three graphics quality tiers (Low / Medium / High)

---

## Quickstart

```bash
# 1. Clone and install
git clone https://github.com/masonwyatt23/globeride.git
cd globeride
npm install

# 2. Add your free Cesium ion token
#    Get one at https://ion.cesium.com/tokens  (free, unlimited personal use)
echo "VITE_CESIUM_ION_TOKEN=your_token_here" > .env.local

# 3. Start the dev server
npm run dev          # → http://localhost:5173
```

The globe won't render without a Cesium ion token. If you skip `.env.local`, the app prompts for a token in-browser and saves it to `localStorage` — no restart needed.

### Commands

```bash
npm run build        # Production build → ./dist  (static, no server needed)
npm run preview      # Serve the production build → :4173
npm run typecheck    # TypeScript strict check (no emit)
npm run test         # Run all unit tests (vitest)
npm run lint         # ESLint (zero errors required)
npm run check        # typecheck + lint + test (all gates)
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
| Routing | OSRM (real-road cycling routes) |
| Testing | vitest |

---

## Routes

| Path | Description |
|---|---|
| `/` | Landing page |
| `/app` | Ride setup — tabs: Ride / Routes / Workouts / Races / History |
| `/ride` | Active ride — HUD, workout panel, 3D globe, controls |
| `/explore` | Cinematic globe explorer — discovery markers, AI route recommendations |
| `/companion` | Phone companion — BLE HR/cadence bridge + remote ride control |

---

## How P2P racing works

1. Create a race: pick a route, set a start time, get a signed `.race.json` manifest.
2. Share the file or a `?race=<base64>` URL — anyone with the link can join.
3. Each rider's app records their effort independently (no server, no real-time sync).
4. Results are compared locally against the manifest after the ride.
5. A 1080×1350 PNG result card is auto-generated and shareable anywhere.

No accounts. No backend. No permission required to publish a race.

---

## Cesium ion token

The 3D globe requires a Cesium ion access token. Tokens are free for personal use — sign up at [ion.cesium.com/tokens](https://ion.cesium.com/tokens).

Resolution order:
1. `VITE_CESIUM_ION_TOKEN` in `.env.local` (gitignored — never commit this)
2. `localStorage['globeride.cesiumIonToken']` — set by the in-app prompt
3. The `CesiumTokenPrompt` UI asks for one on first launch

The token is only needed for live globe rendering. `npm install`, `npm run typecheck`, `npm run build`, and `npm test` all work without it.

---

## Browser support

Web Bluetooth (trainer pairing) requires Chrome or Edge on desktop or Android. Safari and iOS fall back to Demo Mode automatically — all other features work everywhere.

---

## License

[MIT](LICENSE) — free to use, fork, and self-host.
