# `src/lib/replay/` — Cinematic replay engine and MP4 export

## What's here

- `replayPlayer.ts` — Pure replay state machine: playback cursor, binary-search sample interpolation, speed multiplier, camera mode. No React, no Cesium, no stores.
- `highlightDetector.ts` — Scans telemetry for climbs, descents, sprints, max-power moments, and segment crossings; scores and ranks them; pads short rides with equally-spaced time slices
- `cinematicSequencer.ts` — Maps `Highlight[]` to a `CameraSegment[]` timeline with intro/outro bookends and per-highlight camera mode assignments
- `videoExport.ts` — MP4 export via WebCodecs (`VideoEncoder` + `VideoFrame`); falls back gracefully when WebCodecs is absent (Firefox ≤ 128, Safari ≤ 17.3)

## Public API

```ts
// replayPlayer.ts
createReplayPlayer(samples: TelemetrySample[]): ReplayState
tickReplay(state: ReplayState, dt: number): ReplayState       // dt in seconds
sampleAtTime(state: ReplayState, t: number): TelemetrySample  // interpolated
jumpToTime(state: ReplayState, t: number): ReplayState
togglePlayback(state: ReplayState): ReplayState
setCameraMode(state: ReplayState, mode: CameraMode): ReplayState
setPlaybackSpeed(state: ReplayState, speed: number): ReplayState
// ReplayState: { samples, currentTime, durationSec, isPlaying, playbackSpeed, cameraMode }

// highlightDetector.ts
detectHighlights(samples: TelemetrySample[]): Highlight[]
// Highlight: { startSec, endSec, type: HighlightType, score }
// HighlightType: 'climb' | 'descent' | 'sprint' | 'maxPower' | 'segment'

// cinematicSequencer.ts
buildCameraTimeline(highlights: Highlight[], totalDuration: number): CameraSegment[]
// CameraSegment: { startSec, endSec, cameraMode: CameraMode }

// videoExport.ts
isWebCodecsSupported(): boolean
exportRideAsMP4(state: ReplayState, segments: CameraSegment[], ...): Promise<Blob | null>
buildFrameCameraMap(segments: CameraSegment[], durationSec: number): string[]
advanceReplayOneFrame(state: ReplayState): ReplayState
```

## How it's consumed

- `src/components/replay/ReplayPlayer.tsx` — drives the replay loop, calls `tickReplay` each rAF frame, uses `buildFrameCameraMap` and `exportRideAsMP4` for export

## Constraints / gotchas

- **WebCodecs**: `isWebCodecsSupported()` must be called before showing the export button. Returns false on Firefox ≤ 128, Safari ≤ 17.3, and all iOS browsers.
- **MP4 container**: the output is a minimal ISOBMFF-style stream (raw H.264 chunks with a hand-assembled container), sufficient for most players but not fully spec-compliant. A future iteration could use `mp4-muxer`.
- **Pure modules**: `replayPlayer`, `highlightDetector`, and `cinematicSequencer` have no DOM or Cesium dependencies — safe to import in Node/vitest tests.
- **Allocation discipline**: `tickReplay` and `sampleAtTime` use binary search and return new state objects; no per-frame heap allocations inside the hot path.
- **Telemetry order**: `createReplayPlayer` assumes `samples` are sorted ascending by `sample.t`. Unsorted input produces undefined interpolation behavior.
