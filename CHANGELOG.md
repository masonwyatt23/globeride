# Changelog

All notable changes to GlobeRide, in reverse chronological order.

---

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
