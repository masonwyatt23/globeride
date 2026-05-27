# GlobeRide — Claude project context

## What this is

Open-source, browser-based **virtual cycling platform**. Upload a GPX route
(Strava/Komoot/Garmin) or record one outdoors via phone GPS. See it on a
photoreal Cesium 3D Earth with real terrain, dynamic sun, volumetric
clouds, atmospheric scattering, spectator crowds on iconic climbs, and
wet-road reflections in rain. A Web-Bluetooth FTMS smart trainer
(Wahoo Kickr Core etc.) simulates the real-world gradient. AI pace bots
ride alongside with drafting physics. Live race commentary in your
earbuds. Ride with friends over WebRTC mesh. Enter VR / AR on Quest 3 or
Vision Pro. Replay any ride with cinematic multi-camera cuts. Export
.FIT to Strava. **No accounts, no subscriptions, no backend.**
MIT-licensed, self-hostable static site.

Live: globeri.de · globeride.vercel.app · Repo: github.com/masonwyatt23/globeride

## Stack

Vite 6 · React 19 · TypeScript strict (project refs) · CesiumJS
(`vite-plugin-cesium`) · Zustand 5 · Tailwind 3 · react-router 7 ·
Recharts · `idb` (IndexedDB) · `vite-plugin-pwa` (installable, offline) ·
Web Speech API (TTS + recognition) · WebRTC · WebXR · WebCodecs.

Everything is client-side and local-first. The only network calls are
the Cesium ion tile fetches (when the user supplies a token), the
Strava OAuth proxy at `/strava-api/*` (the user's own token), and the
xAI proxy at `/xai/*` (for AI commentary + coach output validation).

## Commands

```bash
npm run dev         # Vite dev server → http://localhost:5173
npm run typecheck   # tsc -b --noEmit
npm run lint        # eslint src
npm run test        # vitest run
npm run check       # typecheck + lint + test (the Vercel gate)
npm run build       # tsc -b && vite build → ./dist
npm run preview     # serve the build → :4173
```

Vercel runs `vercel-build = check && vite build`. Pushes to `main`
auto-deploy.

## Cesium ion token (optional but recommended)

The full photoreal globe needs a Cesium ion access token. Resolution
order:

1. `import.meta.env.VITE_CESIUM_ION_TOKEN` — set in gitignored `.env.local`
2. `localStorage['globeride.cesiumIonToken']` — persisted by the in-app
   `CesiumTokenPrompt`
3. Without a token, the landing page falls back to a stylized SVG Earth;
   the ride view shows the token prompt; the Explore page shows the prompt.

Free + unlimited for personal use at ion.cesium.com/tokens. `.env.local`
is gitignored — never commit it.

## Architecture map (current state)

**Ride loop foundation**
- `src/lib/ftms.ts` — Web Bluetooth FTMS client (service 0x1826)
- `src/lib/gpxParser.ts` — GPX → normalized Route + distance interpolation
- `src/lib/gradientCalculator.ts` — windowed slope %, EMA-smoothed
- `src/lib/physics.ts` — steady-state cycling power balance (Martin 1998)
- `src/lib/fitExporter.ts` — FIT v2 binary writer (Strava-ready)
- `src/hooks/useRideLoop.ts` — requestAnimationFrame core loop
- `src/stores/rideStore.ts` — central ride state
- `src/stores/settingsStore.ts` — persisted rider config

**Photoreal Cesium scene**
- `src/components/ride/CesiumViewer.tsx` — main 3D viewer
- `src/lib/cesiumCameras.ts` — 5 modes (chase, firstPerson, overhead,
  sideTracking, cinematic) with eased transitions
- `src/lib/avatar.ts` — animated procedural cyclist (pedaling, wheels,
  corner lean, head turn, climb-mode sway)
- `src/lib/skyAndClouds.ts` — real-time sun position, volumetric clouds,
  per-mood atmospheric scattering
- `src/lib/dynamicShadow.ts` — ground shadow tracking sun azimuth
- `src/lib/wetRoadMaterial.ts` — GLSL custom material for rain rides
- `src/lib/spectatorSystem.ts` — billboard crowds on iconic climbs

**AI**
- `src/lib/ai/provider.ts` — xAI proxy client
- `src/lib/ai/coach.ts` — adaptive training recommendations
- `src/lib/ai/commentator.ts` — live race commentary (8 trigger types,
  throttled, paired with `src/lib/speechSynthesis.ts`)
- `src/lib/paceBots.ts` — 4 personality presets (steady/climber/sprinter/
  attacker), drafting physics in `src/lib/drafting.ts`

**Multiplayer**
- `src/lib/webrtc/multiriderConnection.ts` — 1:1 WebRTC + SDP signaling
- `src/lib/webrtc/meshTopology.ts` — up to 4-peer mesh with room codes
- `src/lib/webrtc/multiriderCodec.ts` — binary state codec (32-byte frames
  at 10 Hz)
- `src/lib/race/raceProtocol.ts` — signed P2P race manifests via Web Crypto

**Strava integration**
- `src/lib/strava.ts` — OAuth + .FIT upload with 429 retry
- `src/lib/strava/segments.ts` — live segments along the route
- `src/lib/segmentOverlay.ts` — in-segment HUD + PR delta + portals

**Pro peloton ghosts**
- `src/lib/proCycling/stageResults.ts` — curated historical finisher data
- `src/lib/proCycling/proPelotonSimulator.ts` — interpolate ghost positions

**WebXR / VR / AR**
- `src/lib/webxr/xrCapability.ts` — `navigator.xr` probing
- `src/lib/webxr/xrSession.ts` — XRWebGLLayer + per-eye projection
- `src/lib/webxr/xrRoomScale.ts` — 6DOF head decoupled from chase-cam
- `src/lib/webxr/xrDomOverlay.ts` — interactive React HUD on Quest 3
- `src/lib/webxr/xrAR.ts` — `'immersive-ar'` for Vision Pro passthrough

**Outdoor mode**
- `src/lib/outdoorGps.ts` — `navigator.geolocation.watchPosition()` wrapper
- `src/lib/outdoorPower.ts` — inverse-physics power estimator

**Voice + gestures**
- `src/lib/voice/voiceControl.ts` — Web Speech recognition + intent parser
- `src/lib/handlebarGestures.ts` — pointer-event gesture engine

**Replay**
- `src/lib/replay/replayPlayer.ts` — playback state machine
- `src/lib/replay/highlightDetector.ts` — climbs/descents/sprints/maxPower
- `src/lib/replay/cinematicSequencer.ts` — assigns cameras per highlight
- `src/lib/replay/videoExport.ts` — WebCodecs MP4 export

**Landing page (real Cesium throughout)**
- `src/components/landing/HeroGlobe.tsx` — auto-rotating Earth + climb arc
- `src/components/landing/DemoRideSection.tsx` — 8× chase-cam autoplay
- `src/components/library/RouteCardPreview.tsx` — mini-globes per card
- `src/lib/landingGates.ts` — shared WebGL/hardware/token gating

## Conventions / constraints

- **No backend, local-first.** Persistence is localStorage + IndexedDB.
  The only network calls are user-supplied (Strava OAuth, Cesium tiles,
  xAI for AI features).
- **Web Bluetooth + WebXR are Chrome/Edge-on-desktop or Quest browser
  only.** Safari/iOS gracefully falls back to Demo Mode + 2D HUD. Always
  preserve the no-BLE path.
- **One FTMS consumer at a time.** Document any change touching the
  connect flow.
- **Cesium primitive lifecycle:** every `viewer.scene.primitives.add()`
  or `viewer.entities.add()` must have a matched cleanup on route change
  AND viewer destroy. Mobile OOM is a real risk.
- **Match existing style:** functional React, Zustand selectors, Tailwind
  + shadcn-style `ui/` primitives, `@/` path alias.
- **Don't add wave-tag comments** (`// Wave 30.A …`). They're noise once
  the wave merges and the simplifier strips them periodically.
- **Polish pattern for new XR / WebRTC / Web Speech features:** start
  with capability detection in a `*Capability.ts` module, then make the
  UI invisible when unsupported. Never prompt for permission on the
  landing page.

## Roadmap (genuinely open)

- WebXR Phase 4 — hand tracking (pinch-to-select on the in-headset HUD)
- 8-peer mesh — requires a lightweight signaling relay or pub-sub layer
- Coach plan editor — manual periodization view alongside the AI Coach
- Wahoo SYSTM-style structured workout library — expand the 15-45 min
  catalog to 50+ workouts with weekly periodization
- Performance audit — Cesium can be heavy on mobile; profile hot paths
- Capacitor mobile shell — native distribution for iPhone/Android
