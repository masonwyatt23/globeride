<div align="center">

# GlobeRide

**Ride anywhere on Earth — real terrain, real smart trainers, real racing. No account, no backend, open source.**

[![MIT License](https://img.shields.io/badge/license-MIT-22d3ee?style=flat-square)](LICENSE)
[![Built with Vite](https://img.shields.io/badge/built%20with-Vite%206-646cff?style=flat-square)](https://vitejs.dev/)
[![Cesium](https://img.shields.io/badge/3D%20globe-Cesium%20ion-2e5f9e?style=flat-square)](https://cesium.com)
[![FTMS](https://img.shields.io/badge/trainer-FTMS%20%2F%20Web%20Bluetooth-5eead4?style=flat-square)](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/)

Live at **https://globeride.vercel.app** · **https://globeri.de**

</div>

---

## What it is

GlobeRide is a browser-based virtual cycling simulator that renders your route on a photoreal Cesium 3D Earth — real satellite imagery, real terrain, real OSM buildings — and drives any FTMS-compatible smart trainer (Wahoo Kickr Core, Tacx Neo, Elite Suito, Zwift Hub, …) with live gradient simulation. Load a GPX, pick a curated climb, draw a route on the map, or record one outdoors via phone GPS. No account, no subscription, no data leaves your device.

---

## Feature matrix

### Cesium scene
- Photoreal globe: Bing Aerial imagery + Cesium World Terrain + Google 3D Tiles
- 8 cinematic atmospheric moods (golden hour, alpine storm, Mediterranean mist, fjord rain, …) auto-assigned per route
- Weather particle systems: rain, snow, dust, mist; wind speed/direction HUD
- Real-time sun position from wall clock + route GPS; dynamic ground shadow tracking sun azimuth
- Volumetric cumulus clouds drifting with wind
- Wet-road GLSL custom material on rain rides
- Tour-style spectator crowds on the final 2 km of named climbs
- Post-processing: bloom, ambient occlusion, vignette, tone grading, FXAA/MSAA

### 3D avatar and cameras
- Animated procedural cyclist — pedaling legs sync to cadence, wheels spin at speed, body leans into corners, head turns toward heading, forward sway above 8% grade
- Road, gravel, and TT glTF 2.0 models with PBR materials and colourway picker
- 5 camera modes with eased transitions: chase, first-person POV, overhead, side-tracking, cinematic orbit

### AI
- xAI-powered live race commentary — 8 trigger types, throttled at 45 s, punchy play-by-play via Web Speech TTS; auto-pauses against voice control
- AI coach — daily ride recommendations and adaptive weekly training review
- AI workout designer — describe what you want, get a structured interval session
- AI scenic route discovery on the Explore globe

### Multiplayer and racing
- WebRTC mesh pelotons — up to 4 peers via shareable room codes; binary state codec at 10 Hz; aerodynamic drafting extends to real peers
- Signed P2P race manifests (`.race.json` / `?race=` URL) — no server, no accounts required to publish or join a race
- Race Lobby with live leaderboard and 1080x1350 PNG shareable result cards
- Pro Peloton Ghosts — ride alongside actual finishers of curated Grand Tour stages at their real-world pace
- AI pace partners (PaceBots) with personality presets: steady / climber / sprinter / attacker

### Strava integration
- Live segment overlay — fetches your actual Strava segments, renders 3D portal gates, shows live "vs PR" delta, celebrates PRs on exit
- One-tap `.FIT` export and Strava auto-upload; 429-retry with exponential backoff; upload deduplication

### Sensors and hardware
- Web Bluetooth FTMS — SIM mode (live gradient) and ERG mode (target power) for any FTMS-compliant trainer
- BLE heart-rate monitor and cadence sensor pairing
- Phone companion screen (`/companion`) — BroadcastChannel HR/cadence bridge and remote ride control

### Outdoor mode
- `navigator.geolocation.watchPosition()` real-ride recording — turns the app into a GPS bike computer
- Inverse-physics power estimation from speed + grade; same `.FIT` exporter as indoor rides

### WebXR — VR and AR
- VR on Quest 3 and Chromium desktop — stereo rendering, full 6DOF room-scale head tracking decoupled from chase-cam, interactive DOM-overlay HUD in-headset
- AR passthrough on Quest 3 and Vision Pro — `immersive-ar` session overlays your route on the real world
- Graceful no-op on unsupported browsers; no permission prompt on the landing page

### Replay
- Record any ride; replay at 0.5x-8x speed with a scrubbable timeline
- Auto-detected highlight reel: climbs, descents, sprints, max-power moments
- Cinematic sequencer assigns camera modes per highlight type
- MP4 export via WebCodecs

### Routes and library
- 19 iconic climbs built-in: Alpe d'Huez, Mont Ventoux, Stelvio, Mortirolo, Tourmalet, Angliru, Zoncolan, Galibier, Hautacam, Sa Calobra, Trollstigen, Mauna Kea, Pico de Veleta, Col d'Izoard, Willunga Hill, Box Hill, Old La Honda, Central Park Loop, Promenade des Anglais
- 6 curated Grand Tour stages (Tour de France, Giro, Vuelta) with authentic summit data and hero narratives
- Upload any GPX from Strava, Komoot, or Garmin
- Draw a route on the map via OSRM real-road cycling routing

### Training
- 44 curated workouts across every zone: recovery, Z2, tempo, sweet spot, threshold, over-under, VO2 max, sprints, Tabata, climbing repeats, FTP ramp test
- 6 multi-week training plans with calendar view, streaks, and today/next-up CTAs
- Power-profile preview before every workout (Zwift-style interval graph)
- CTL/ATL/TSB Performance Management Chart
- Post-ride analytics: power curve, time-in-zones, per-km splits; personal records board; weekly/monthly trend charts

### Voice and gestures
- Voice control: "pause", "resume", "lap", "switch camera", "first person", "end ride" with verbal confirmation
- Handlebar gestures: double-tap pause/resume, long-press quick actions, two-finger swipe ±10 W ERG adjust

### Gamification and UX
- XP, levels, and gear garage with road/gravel/TT bikes and helmets; 25 achievements (bronze to platinum)
- Ghost riders — translucent avatars of past attempts on the same course
- Gradient-coloured route line, 2D minimap, climb-name HUD banners, achievement poppers
- Synthesised ambient soundscape with effort cues and zone chimes
- PWA installable + offline; screen wake-lock; keyboard shortcuts

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

If you skip `.env.local`, the app prompts for a token in-browser and saves it to `localStorage` — no restart needed. The landing page shows a stylised SVG Earth fallback when no token is present. `npm install`, `npm run typecheck`, `npm run build`, and `npm test` all work without a token.

### Commands

```bash
npm run dev          # Vite dev server → :5173
npm run build        # Production build → ./dist (static, no server needed)
npm run preview      # Serve the production build → :4173
npm run typecheck    # TypeScript strict check (no emit)
npm run test         # vitest run
npm run lint         # ESLint (zero errors required)
npm run check        # typecheck + lint + test (the CI gate)
```

### Strava setup (optional)

The Vercel deployment includes edge proxy routes at `/strava-api/*` for the Strava OAuth callback. For local development, set `VITE_STRAVA_CLIENT_ID` and `VITE_STRAVA_CLIENT_SECRET` in `.env.local` and register `http://localhost:5173` as a redirect domain in your [Strava API app](https://www.strava.com/settings/api).

---

## Browser support

| Feature | Chrome / Edge desktop | Firefox | Safari desktop | Chrome Android | Safari iOS | Quest 3 | Vision Pro |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Core ride (Demo Mode) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Web Bluetooth trainer | Yes | No | No | Yes | No | No | No |
| BLE HR / cadence | Yes | No | No | Yes | No | No | No |
| VR (WebXR immersive-vr) | Yes | No | No | No | No | Yes | No |
| AR (WebXR immersive-ar) | No | No | No | No | No | Yes | Yes |
| Outdoor GPS recording | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Voice control | Yes | No | Partial | Yes | Partial | Yes | Partial |
| MP4 export (WebCodecs) | Yes | Partial | No | Yes | No | Yes | No |
| PWA install | Yes | No | Yes | Yes | Yes | Yes | Yes |

Safari and iOS always fall back to Demo Mode for trainer pairing. All non-BLE features work across every listed browser.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript strict (project refs) |
| Build | Vite 6 + vite-plugin-cesium |
| 3D globe | CesiumJS 1.131 + Cesium World Terrain |
| State | Zustand 5 |
| Styling | Tailwind CSS 3 + shadcn-style UI primitives |
| Charts | Recharts |
| Persistence | IndexedDB via `idb`, localStorage |
| PWA | vite-plugin-pwa (installable, offline-capable) |
| Trainer | Web Bluetooth FTMS (service `0x1826`) |
| Road routing | OSRM |
| Multiplayer | WebRTC DataChannel mesh |
| XR | WebXR Device API |
| Voice | Web Speech API (TTS + recognition) |
| Video export | WebCodecs |
| Testing | vitest |

---

## Architecture

For a full subsystem map — FTMS client, physics model, Cesium scene layers, AI modules, WebRTC codec, WebXR session lifecycle, replay pipeline, outdoor GPS mode, and coding conventions — see [CLAUDE.md](CLAUDE.md).

---

## Contributing

Bug reports, route additions, and PRs are welcome. Before opening a PR:

1. Run `npm run check` — typecheck + lint + tests must all pass.
2. Match existing conventions: functional React, Zustand selectors, Tailwind + `ui/` primitives, `@/` path alias.
3. No backend, no new accounts, no data leaving the device — local-first is a hard constraint.
4. Every `viewer.scene.primitives.add()` or `viewer.entities.add()` must have a matched cleanup on route change and viewer destroy.

---

## License

[MIT](LICENSE) — free to use, fork, and self-host.

Repo: [github.com/masonwyatt23/globeride](https://github.com/masonwyatt23/globeride)
