<div align="center">

# 🌍 GlobeRide

**Virtual cycling on a 3D Earth — open source, no subscription, your routes, your trainer.**

[![MIT License](https://img.shields.io/badge/license-MIT-22d3ee?style=flat-square)](LICENSE)
[![Built with Vite](https://img.shields.io/badge/built%20with-Vite%206-646cff?style=flat-square)](https://vitejs.dev/)
[![Cesium](https://img.shields.io/badge/3D%20globe-Cesium%20ion-2e5f9e?style=flat-square)](https://cesium.com)
[![FTMS](https://img.shields.io/badge/trainer-FTMS%20over%20Web%20Bluetooth-5eead4?style=flat-square)](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/)

</div>

GlobeRide is a free, browser-based virtual cycling simulator. Upload any GPX
from Strava / Komoot / Garmin, see the route in a photorealistic 3D world
(real terrain, real OSM buildings), and your Wahoo Kickr Core (or any
FTMS-compliant smart trainer) automatically simulates the real-world
gradient as you ride. Record the ride, export a `.FIT`, push to Strava.

> No accounts. No subscriptions. No closed routes. MIT-licensed and
> self-hostable.

---

## Phase 1 MVP — what works today

- ✅ GPX upload, parse, and route preview on a 3D globe
- ✅ Cesium World Terrain + OSM 3D Buildings
- ✅ Smooth chase-cam that tracks the bike along the route tangent
- ✅ Real-time gradient calculation, smoothed with an EMA
- ✅ FTMS Simulation Mode — gradient → real trainer resistance
- ✅ Live HUD: speed, power, cadence, HR, distance, elevation, grade, time
- ✅ Connect / disconnect any FTMS smart trainer via Web Bluetooth
- ✅ Start / Pause / Resume / Finish controls + screen wake-lock
- ✅ 1 Hz telemetry recording → `.FIT` download (Strava-ready)
- ✅ Live elevation profile with progress marker (Recharts)
- ✅ Installable PWA, offline cache after first visit
- ✅ **Demo Mode** — no trainer required; solves cycling-power physics so
  you can preview the entire experience

---

## Quick start

```bash
git clone https://github.com/masonwyatt23/globeride
cd globeride
npm install
npm run dev
```

The dev server starts on `http://localhost:5173`. The first time you enter a
ride, you'll be asked for a **Cesium ion access token** — sign up free at
<https://ion.cesium.com/tokens> and paste the default token in. It's saved
to your browser only.

You can also bake the token into a `.env` file:

```bash
echo "VITE_CESIUM_ION_TOKEN=eyJhbGciOi..." > .env.local
```

### Production build

```bash
npm run build      # tsc + vite, output in ./dist
npm run preview    # serve the build at :4173
```

`dist/` is a static site — drop it on Vercel, Netlify, Cloudflare Pages,
your own nginx, anywhere.

---

## Pairing a Wahoo Kickr Core (or any FTMS trainer)

1. Wake the trainer (one pedal stroke usually does it). Make sure it isn't
   already paired with the Wahoo iOS app, Zwift, or another browser tab —
   FTMS only allows one consumer at a time.
2. Open GlobeRide in **Chrome or Edge** on desktop or Android. Safari and
   iOS do not expose Web Bluetooth — use Demo Mode there.
3. Pick a route, then click **Pair trainer**.
4. The native browser chooser appears — select your Kickr / Tacx / Saris /
   Elite trainer and click **Pair**.
5. The status row turns green with a `LIVE` badge. Click **Enter the
   world** and start the ride.

GlobeRide will push the live gradient to the trainer ~once per second using
FTMS opcode `0x11` (Set Indoor Bike Simulation Parameters). When the
gradient ramps up, the resistance ramps up — same physics as Zwift's
Simulation Mode.

> **Tip:** if the trainer feels "ghostly" or laggy, make sure no other
> Bluetooth device (computer head unit, ANT+ bridge, second phone) has it
> claimed.

### What's been tested

| Trainer | Status | Notes |
|---|---|---|
| Wahoo Kickr Core | ✅ Reference target | Tested against `wklenk/web-bluetooth-bike-trainer`'s known-good flow |
| Wahoo Kickr v6 | ✅ Should work | Same FTMS profile |
| Tacx Neo 2T | ✅ Should work | Standard FTMS implementation |
| Saris H3 | ✅ Should work | Standard FTMS implementation |
| Elite Suito | ✅ Should work | Standard FTMS implementation |
| Zwift Hub / Hub One | ✅ Should work | Standard FTMS implementation |

If your trainer doesn't connect, please open an issue with the device name
and any console errors.

---

## Project structure

```
globeride/
├── public/
│   └── icon.svg              # PWA icon
├── src/
│   ├── components/
│   │   ├── ui/               # Button / Card / Badge (shadcn-style)
│   │   ├── CesiumViewer.tsx  # 3D globe + route + follow-cam
│   │   ├── TrainerConnect.tsx
│   │   ├── GPXUploader.tsx
│   │   ├── RideHUD.tsx
│   │   ├── RideControls.tsx
│   │   ├── ElevationProfile.tsx
│   │   └── CesiumTokenPrompt.tsx
│   ├── lib/
│   │   ├── ftms.ts                # Web Bluetooth FTMS client (the load-bearing one)
│   │   ├── gpxParser.ts           # GPX → normalized Route + interpolation
│   │   ├── gradientCalculator.ts  # Window-averaged % slope + EMA smoother
│   │   ├── cesiumUtils.ts         # Camera + entity helpers
│   │   ├── fitExporter.ts         # Hand-rolled .FIT v2 binary writer
│   │   ├── physics.ts             # Cycling-power equation (Demo Mode)
│   │   ├── sampleRoutes.ts        # Built-in demo loop
│   │   └── utils.ts
│   ├── stores/
│   │   └── rideStore.ts           # Zustand — all ride + trainer state
│   ├── hooks/
│   │   ├── useRideLoop.ts         # requestAnimationFrame core loop
│   │   └── useWakeLock.ts
│   ├── routes/
│   │   ├── Home.tsx               # Setup: upload + pair + start
│   │   └── Ride.tsx               # Active ride view
│   ├── App.tsx
│   └── main.tsx
├── vite.config.ts                 # Vite + cesium plugin + PWA
├── tailwind.config.ts
└── package.json
```

---

## How it works (technical notes)

### Web Bluetooth + FTMS

`src/lib/ftms.ts` implements the [Fitness Machine Service](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/)
spec from the Bluetooth SIG. The connection flow is:

1. `navigator.bluetooth.requestDevice` with a filter on UUID `0x1826`.
2. GATT connect → get the `0x1826` service.
3. Subscribe to indications on the **Control Point** (`0x2AD9`).
4. Subscribe to notifications on **Indoor Bike Data** (`0x2AD2`).
5. Send **Request Control** (`0x00`) → wait for `0x80 0x00 0x01` success.
6. Send **Start / Resume** (`0x07`) → wait for `0x80 0x07 0x01` success.
7. From the ride loop, send **Set Indoor Bike Simulation Parameters**
   (`0x11`) every 1–2 seconds. Payload:
   - `int16 LE` wind speed (m/s × 1000) — always 0
   - `int16 LE` grade (% × 100)
   - `uint8` Crr (× 10000) — set to 40 (0.0040)
   - `uint8` Cw (× 100)   — set to 51 (0.51 kg/m, hoods position)

Indoor Bike Data notifications are parsed per spec § 4.9 — variable-length
payload driven by a `uint16` flags field — and pushed into the Zustand
store as live `speed / power / cadence / heartRate`.

Reference implementation: [`wklenk/web-bluetooth-bike-trainer`](https://github.com/wklenk/web-bluetooth-bike-trainer).

### Gradient calculation

For every animation frame:

1. Resolve the rider's current `(lat, lon, ele)` by binary-searching the
   cumulative-distance index of the parsed GPX route.
2. Sample elevation 20 m behind and 20 m ahead, then `(eAhead − eBehind) /
   40 m × 100` → instantaneous grade %.
3. Push through an exponential moving average (`α = 0.18`) to remove GPS
   noise that would otherwise shake the trainer's flywheel motor.
4. Clamp to ±25 % for safety (typical smart-trainer limit).

### `.FIT` export

`src/lib/fitExporter.ts` is a hand-rolled binary encoder for FIT v2. It
emits:

- `file_id` (manufacturer = development, type = activity)
- `record` × N (per-second: lat/lon as semicircles, altitude scaled, speed,
  power, cadence, heart rate)
- one `lap` covering the whole ride
- one `session` with cycling / indoor-cycling sport
- `activity` summary

CRC is computed with the table from the FIT SDK. The resulting `.fit`
uploads cleanly to Strava and most third-party services.

### Demo Mode

When no trainer is connected, GlobeRide solves the cycling-power equation
each frame to derive realistic speed from the rider's grade:

```
P = m·g·(sinθ + Crr·cosθ)·v + ½·ρ·CdA·v³
```

Defaults: 80 kg combined mass, Crr = 0.005, CdA = 0.32 m², ρ = 1.225 kg/m³,
target rider power = 190 W. Newton-Raphson solves for v in a handful of
iterations.

---

## Roadmap

Phase 2 ideas, in rough priority order:

- 🛰️ **Multi-rider** ghost peloton via WebRTC data channels
- 🏁 **Segment leaderboards** — strictly local-first, no central server
- 🧠 **Auto-route from latlon** — draw a line on the map, get an elevation
  profile back from OSM SRTM
- 🚴 **Cadence & HR sensor pairing** as separate BLE devices
- 🎮 **Steering** via the FTMS Steering Service (Kickr v6 + Bolt)
- 🌧️ **Weather overlay** (real precipitation, sun angle for time-of-day)
- 📺 **Strava activity import** by URL
- 🎬 **Ride replay** from any uploaded `.FIT`

PRs welcome.

---

## Contributing

This is a side project that exists because no one should have to pay $20 a
month to ride a fake road. Issues, ideas, and PRs are all welcome.

```bash
npm run dev         # hot-reloading dev server
npm run typecheck   # tsc -b --noEmit
npm run build       # production build
```

---

## Acknowledgements

- [CesiumJS](https://cesium.com) — the 3D globe that makes this possible
- [`wklenk/web-bluetooth-bike-trainer`](https://github.com/wklenk/web-bluetooth-bike-trainer)
  — the proven FTMS reference implementation this project's BLE layer is modelled on
- [Garmin FIT SDK](https://developer.garmin.com/fit/) — file-format spec
- [Bluetooth SIG FTMS spec](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/)

---

## License

MIT © 2026 Mason Wyatt — see [LICENSE](LICENSE).
