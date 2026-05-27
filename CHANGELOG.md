# Changelog

All notable changes to GlobeRide, in reverse chronological order.

---

## Wave 35 — Replay system + mesh pelotons + WebXR Phase 3 + AR mode
Record any ride and replay it at 0.5×-8× speed with scrubbable timeline, 5 cinematic camera modes, auto-detected highlight reel (climbs / descents / sprints / max-power), MP4 export via WebCodecs. WebRTC mesh extended from 1:1 to 4-peer rooms with shareable codes. WebXR Phase 3 ships full 6DOF room-scale tracking decoupled from the chase-cam plus interactive DOM-overlay HUD on Quest 3. `immersive-ar` session variant for Vision Pro / Quest 3 passthrough rides your route overlaid on the real living room.

## Wave 34 — Onboarding + WebXR Phase 2 + pro peloton + voice control
Five bespoke SVG onboarding scenes match the Wave 33 hero quality bar. WebXR Phase 2 wires full stereo rendering via XRWebGLLayer + per-eye projection matrix recovery. Pro Peloton Ghosts let you ride alongside the actual finishers of curated stages (Mortirolo 2024, Isola 2000 2024, Vuelta 2023 S13) at their real-world pace. Voice control via Web Speech API — "pause", "resume", "lap", "switch camera", "first person", "end ride" with verbal confirmation. Auto-pauses against the AI commentator to avoid crosstalk.

## Wave 33 — WebXR Phase 1 + Strava segments + landing polish
WebXR capability detection + session lifecycle ("Enter VR" button on Quest 3 / Vision Pro). Strava live segments overlay fetches the user's actual segments along the loaded route, renders aqua 3D portal gates, shows live "vs PR" delta during the segment and a "+12s" or "NEW PR" celebration on exit. FeatureGrid replaced with 22 bespoke SVG illustrations covering every Wave 1-32 capability; GallerySection rewritten with 6 evocative scene cards. Zero mockups anywhere.

## Wave 32 — Demo-ride autoplay + route-card mini-globes + photoreal share card
Below the hero, a Cesium demo-ride scene flies down into Mont Ventoux and runs the route at 8× chase-cam, loops infinitely, IntersectionObserver-gated. Every route-library card lazy-mounts a real Cesium mini-globe when scrolled into view (max 5 concurrent, LRU-evicted). The post-ride share card replaces the 2D minimap with a real Cesium scene; html-to-image now waits for `tilesLoaded` so the captured PNG actually shows photoreal Earth, not gray squares.

## Wave 31 — Real photoreal Earth hero
The abstract dark-circle hero on the landing page is gone. The right side now renders a real Cesium globe with Bing Aerial imagery, atmospheric scattering, real-time sun, and the Mortirolo Pass climb polyline draped on the surface in aqua glow. Slow 0.4°/s auto-rotation. Lazy-loaded, IntersectionObserver-gated, silent SVG fallback when WebGL or token is unavailable.

## Wave 30 — Cinematic graphics overhaul
Five camera modes (chase, **first-person POV**, overhead, side-tracking, cinematic orbit) with eased transitions. Animated procedural cyclist — pedaling legs sync to cadence, wheels spin at ride speed, body leans into corners (centripetal physics), head turns toward heading, climb-mode tilts forward + sways above 8% grade. Real-time sun position based on wall clock + route GPS. Volumetric `CumulusCloud` primitives drift with wind. Dynamic ground shadow tracks sun azimuth. Wet road GLSL custom material on rain rides. Tour-style spectator crowds on the final 2 km of named climbs (Isola 2000, Mortirolo, Tourmalet).

## Wave 29 — Live multi-rider + UX gaps
WebRTC DataChannel multi-rider with copy-paste SDP signaling (reuses the race protocol's manifest pattern). Drafting extends to real peers. Handlebar gestures: double-tap to pause/resume, long-press for quick actions, two-finger swipe for ±10W ERG adjust. Low-light HUD auto-engages 18:00-06:00 local. Workout voice cues during structured intervals. Sustained-climb auto-segmentation with optional voice announcements.

## Wave 28 — AI commentary + outdoor GPS + debt cleanup
Live AI race commentator via xAI + Web Speech API — 8 trigger types, throttled at 45s, ~15-word punchy play-by-play with cached static lines for common milestones to keep cost down. Outdoor GPS Mode turns the app into a Strava-replacement bike computer: `navigator.geolocation.watchPosition()` records a real outdoor ride, power estimated from speed + grade via inverse physics, FIT exporter unchanged. RaceResultCard now imports real types from raceProtocol. Strava `uploadFit` retries on 429 with exponential backoff. Orphan glTF generation scripts deleted (-100 KB).

## Wave 24-27 — Elite initiative round
Ride graphics push (motion blur on descents, screen-space DOM lens flare, route glow, refined avatar materials). UX polish across 6 screens. Data export panel (CSV rides + JSON achievements / records / races). Lazy-loaded `/ride` `/explore` `/companion` (~138 KB bundle reduction). 12 new achievements. Strava `rate_limited` error kind + upload deduplication. 7-step onboarding refresh with inline SVG hero illustrations.

## Wave 23 — Phone companion screen
BroadcastChannel bridge lets a phone act as a paired HR/cadence sensor and remote ride control via `/companion`.

## Wave 22 — Adaptive AI coach
xAI-powered daily ride recommendation and weekly training review, surfaced on the Home screen.

## Wave 21 — P2P race protocol
Permissionless racing via signed `.race.json` manifests (or `?race=` URL). Race Lobby UI, live leaderboard, and 1080×1350 PNG result cards.

## Wave 20 — Weather particle systems + wind HUD
Live particle systems (rain, snow, dust, mist) driven by the cinematic mood; wind speed and direction indicator in the HUD.

## Wave 19 — Explore globe rebuild + cinematic mood library
Eight atmospheric scene moods (golden hour, alpine storm, Mediterranean mist, fjord rain, …) auto-assigned per route; `/explore` rebuilt with discovery markers and pulsing globe pins.

## Wave 18 — Ride-feel cinematics + finish card story arc
Climb-name HUD banners, achievement poppers, mobile glass wrap; finish card redesigned as a vertical hero with opt-in analytics.

## Wave 17 — AI pace partners + drafting physics
Named PaceBot riders with personality-driven power models; aerodynamic drafting physics and a HUD proximity indicator.

## Wave 16 — Gear Garage rebuild + helmets
Elite SVG bike visuals, colour customisation modal, XP-gated tabs, and a helmets category with new `.glb` gear assets.

## Wave 15 — World Tour Stages
Six curated Grand Tour stages (TdF, Giro, Vuelta) with authentic summits, key-climb metadata, and hero narratives.

## Wave 14 — AI route recommender + auto-Strava + share card
xAI scenic route suggestions on `/explore`; one-tap Strava auto-upload on ride finish; Zwift-style PNG share card.

## Wave 13 — Ride essentials hardening
Fixed scene void on load, Strava re-auth on scope errors, Home button on finish card, one-tap ride start.

## Wave 12 — Code health + repo hygiene
All 269 vitest tests passing; deleted dead `StravaConnect` component; ESLint 9 flat config; DRY extraction into shared utilities; 47 components reorganised into 7 domain folders.

## Wave 11 — Deeper training platform
CTL/ATL/TSB Performance Management Chart; training-plan calendar with streaks and today CTA; personal records board; weekly/monthly trend charts.

## Wave 10 — Real 3D avatar + Gear Garage
Three authored glTF 2.0 cyclist models (road/gravel/TT) with PBR materials and animatable nodes; procedural avatar kept as offline fallback; selectable bike models and colourways.

## Wave 9 — Final production polish
Empty/loading/error states and WCAG 2.1 Level A accessibility across every screen; micro-interactions and cross-screen visual cohesion pass.

## Wave 8 — Home tabs + deep QA
Home reorganised into Ride / Routes / Workouts / History tabs; fixed four real bugs (sample mutation, viewer guards, PR race condition, timer leak).

## Wave 7 — Cinematic rendering + post-ride analytics
Bloom, ambient occlusion, vignette/grade, richer atmosphere; post-ride power curve, time-in-zones, per-km splits; expanded to 19 iconic routes and 44 curated workouts.

## Wave 6 — Hardening + visual cohesion
Bug hunt and correctness pass across the ride and setup experiences; spacing, typography, and state consistency audit.

## Wave 5 — Immersion + gamification
Ghost riders (translucent past-attempt avatars); synthesised ambient ride audio with effort cues; 25 achievements tied to the rider profile.

## Wave 4 — Cohesion + performance
First-run onboarding flow and motion-design micro-interactions; mobile/tablet responsiveness pass; Low/Medium/High graphics quality tiers.

## Wave 3 — Maps + worlds
10 curated iconic climbs bundled in-app; rich pre-ride route preview with gradient zones, climb categorisation, and difficulty rating; local-first segment leaderboards.

## Wave 2 — Graphics + 3D assets
Route line gradient-coloured by steepness with distance and start/finish markers; 45-part procedural cyclist avatar with drivetrain, cockpit, and hands; 2D minimap overlay; weather and time-of-day scene moods.

## Wave 1 — UX depth + finish open items
Strava connect component; rich ride history with per-ride detail, stats, and trends; in-ride HUD overhaul with refined metrics and workout panel; 31-workout catalog and 6 multi-week training plans.

## Pre-Wave — Foundation
Vercel deploy with edge proxies and PWA; cinematic eased camera with FXAA/MSAA/shadows and golden-hour lighting; photorealistic 3D-tile maps with route clamped to real terrain; procedural animated rider avatar; route looping; elite landing page; local-first profile with XP and Gear Garage; categorised workout picker.
