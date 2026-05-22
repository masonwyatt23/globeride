# GlobeRide — Elite Roadmap

Goal: make GlobeRide a genuinely elite virtual-cycling product — top-tier
graphics, 3D assets, photorealistic maps, deep workouts, best-in-class UI/UX.

Driven by `/loop`: each iteration advances the next unchecked wave —
parallel sub-agents → integrate → typecheck + build → verify → commit/push
(auto-deploys to globeride.vercel.app).

## Done
- [x] Vercel deploy — edge proxies, PWA, env
- [x] Cinematic eased camera, scene polish (FXAA/MSAA/shadows, golden-hour light)
- [x] Photorealistic 3D-tile maps; route clamped to the real surface
- [x] Procedural animated rider avatar (pedalling legs, lean, spin)
- [x] Route looping when a workout outlasts the map
- [x] Elite landing page; local-first profile + XP + gear garage
- [x] Categorized workout picker

## Wave 1 — UX depth + finish open items  ✅
- [x] StravaConnect component + hardened Strava lib (component built; lib in use)
- [x] Ride history — rich history view: per-ride detail, stats, trends
- [x] In-ride HUD/UX overhaul — refined metrics, workout panel, ride controls
- [x] Workout depth — 31-workout catalog + 6 multi-week training plans

## Wave 2 — Graphics & 3D assets  ✅
- [x] Route line gradient-coloured by steepness; distance + start/finish markers
- [x] Avatar polish — 45-part procedural cyclist (drivetrain, cockpit, hands)
- [x] 2D minimap overlay on the ride screen
- [x] Weather + time-of-day scene moods

## Wave 3 — Maps & worlds  ✅
- [x] 10 curated iconic climbs bundled in-app (Alpe d'Huez, Ventoux, Stelvio…)
- [x] Rich pre-ride route preview — gradient zones, climb categorisation, difficulty
- [x] Local-first segment leaderboards — personal records on route climbs

## Wave 4 — Cohesion & performance  ✅
- [x] First-run onboarding flow + motion-design micro-interactions
- [x] Mobile / tablet responsiveness pass
- [x] Graphics-quality tiers (low / medium / high) for the 3D globe

## Wave 5 — Immersion & life  ✅
- [x] Ghost riders — race past attempts as translucent ghost avatars
- [x] Ride audio — synthesised ambient soundscape, effort cues, chimes
- [x] Achievements & badges — 25 milestones tied to the rider profile

## Wave 6 — Hardening & cohesion
- [ ] Correctness pass — bug hunt + fixes across the 5 feature waves
- [ ] Visual cohesion pass — consistency of spacing / type / states

## Hardware-gated (needs the user's trainer)
- [ ] Cadence — confirm FTMS flags from the Kickr; add a Cycling Power fallback
