# `src/lib/proCycling/` — Pro peloton ghost riders

## What's here

- `stageResults.ts` — Hand-curated World Tour finishing data (TdF 2024 S19, Giro 2024 S16, Vuelta 2023 S13); type definitions for `ProRider`, `StageFinisher`, `StageResults`
- `proPelotonSimulator.ts` — Pure tick-based simulator: advances ghost rider positions each frame at constant pace derived from their official finish time; allocation-free per frame

## Public API

```ts
// stageResults.ts
findStageResults(stageId: string): StageResults | null
// stageId keys: 'wt-tdf-2024-s19' | 'wt-giro-2024-s16' | 'wt-vuelta-2023-s13'
// StageResults: { stageName, routeId, totalDistanceM, finishers: StageFinisher[] }
// StageFinisher: { rider: ProRider, finishTimeSec }
// ProRider: { id, name, team, nationality, avatarColors: AvatarColors }

// proPelotonSimulator.ts
createProPelotonFromStage(results: StageResults): ProPelotonState
tickProPeloton(state: ProPelotonState, dt: number): ProPelotonState
proPelotonFinished(state: ProPelotonState, routeTotalDistanceM: number): boolean
// ProPelotonState: { riders: ProRiderState[] }
// ProRiderState: { rider: ProRider, distance: number, speedMs: number }
```

## How it's consumed

- `src/stores/rideStore.ts` — holds `ProPelotonState`; ticked each frame
- `src/components/ride/ProPelotonAvatars.tsx` — renders Cesium billboard avatars at each `ProRiderState.distance` position on the route polyline
- `src/components/setup/ProPelotonSetup.tsx` — stage selection UI; calls `findStageResults` to populate the picker

## Constraints / gotchas

- **Constant-pace model**: ghost riders ride at exactly `routeTotalDistanceM / finishTimeSec` m/s throughout. Real race pacing is non-linear — this is a game-feel approximation, not a simulation.
- **No live data**: results are static and hand-curated. Official finish times are public record; no proprietary or scraped content.
- **Route coupling**: `ProPelotonState` tracks distance-along-route. The avatar component must map that distance to a lat/lon via `src/lib/gpxParser.sampleRouteAtDistance`. No coordinates are stored in the simulator.
- **Pure functions**: `tickProPeloton` and `proPelotonFinished` have no side effects. Safe to test in Node/vitest without Cesium.
- **Expansion**: add new stages by appending to `STAGE_RESULTS` in `stageResults.ts` with a matching route id from the route library.
