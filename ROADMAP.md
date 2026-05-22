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

## Wave 6 — Hardening & cohesion  ✅
- [x] Correctness pass — bug hunt + fixes across the ride + setup experiences
- [x] Visual cohesion pass — consistency of spacing / type / states

## Wave 7 — Cinematic & analytical  ✅
- [x] Cinematic 3D rendering — bloom, ambient occlusion, vignette/grade, richer atmosphere
- [x] Post-ride analytics — power curve, time-in-zones, per-km splits
- [x] Expanded content — 19 iconic routes total + ~44 curated workouts

## Wave 8 — Refinement  ✅
- [x] Home reorganised into clean Ride / Routes / Workouts / History tabs
- [x] Deep QA pass — fixed 4 real bugs (sample mutation, viewer guards, PR race, timer leak)

## Wave 9 — Final production polish  ✅
- [x] Empty / loading / error states + accessibility across every screen
- [x] Micro-interactions + final cross-screen visual cohesion

## Wave 10 — Real 3D avatar & gear  ✅
- [x] Authored 3 glTF models (road / gravel / TT cyclist) — PBR materials,
      animatable nodes — via a from-scratch glTF generator, bundled + precached
- [x] glTF rendering integrated into the avatar system — node animation,
      procedural avatar kept as the offline fallback
- [x] Garage 2.0 — selectable bike models + colourways

## Wave 11 — Deeper training platform  ✅
- [x] Fitness / Form — CTL / ATL / TSB Performance Management Chart
- [x] Training-plan progression — calendar view with streaks + today/next-up
- [x] Personal records board + weekly/monthly trend charts

## Wave 12 — Code health & repo hygiene  ✅
- [x] Fixed the failing vitest (preset-workout duration window) — 269/269 pass
- [x] Deleted `StravaConnect.tsx` (430 lines of confirmed dead code)
- [x] ESLint 9 flat config + `npm run lint` — 0 errors
- [x] README rewritten to reflect the current product
- [x] DRY extraction — shared `SectionHeader`/`Section`, consolidated `format.ts`, `useRideHistory` hook
- [x] 47 flat components reorganised into 7 domain folders (`ride/setup/workouts/training/routes/profile/trainer`)

## Hardware-gated (needs the user's trainer)
- [ ] Cadence — confirm FTMS flags from the Kickr; add a Cycling Power fallback
