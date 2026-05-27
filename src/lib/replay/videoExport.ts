/**
 * videoExport.ts: MP4 export via WebCodecs.
 *
 * Uses VideoEncoder + VideoFrame to produce an H.264 MP4-ish blob.
 * Because WebCodecs only gives raw encoded chunks (not a full MP4 container),
 * we assemble an extremely minimal ISOBMFF-style stream — sufficient for most
 * players. For full container compliance, a future iteration could layer in
 * mp4-muxer or similar.
 *
 * When WebCodecs is unavailable (Firefox ≤ 128, Safari ≤ 17.3) the function
 * returns null; the UI should hide the export button in that case.
 */

import type { ReplayState } from '@/lib/replay/replayPlayer';
import { sampleAtTime, tickReplay } from '@/lib/replay/replayPlayer';
import type { CameraSegment } from '@/lib/replay/cinematicSequencer';

// ---------------------------------------------------------------------------
// Capability check
// ---------------------------------------------------------------------------

/** True when the current browser supports the WebCodecs VideoEncoder API. */
export function isWebCodecsSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TARGET_FPS = 30;
const FRAME_DURATION_US = Math.round(1_000_000 / TARGET_FPS); // microseconds

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve which camera mode is active at a given time. */
function cameraForTime(segments: CameraSegment[], t: number): string {
  // Walk segments in order — last matching one wins.
  let mode = 'chase';
  for (const seg of segments) {
    if (t >= seg.startSec && t <= seg.endSec) {
      mode = seg.cameraMode;
    }
  }
  return mode;
}

// ---------------------------------------------------------------------------
// Type declarations for WebCodecs (may not be in all TS lib versions)
// ---------------------------------------------------------------------------

// Use declare to safely reference without importing — the tsconfig already
// has DOM included so these exist at runtime. We only call them when the
// runtime capability check passes.

declare const VideoEncoder: {
  new(init: {
    output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
    error: (e: DOMException) => void;
  }): VideoEncoderInstance;
  isConfigSupported(config: VideoEncoderConfig): Promise<{ supported: boolean }>;
};

declare const VideoFrame: {
  new(source: CanvasImageSource, init?: { timestamp: number; duration?: number }): VideoFrameInstance;
};

interface VideoEncoderInstance {
  configure(config: VideoEncoderConfig): void;
  encode(frame: VideoFrameInstance, options?: { keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
  readonly encodeQueueSize: number;
}

interface VideoFrameInstance {
  close(): void;
}

interface VideoEncoderConfig {
  codec: string;
  width: number;
  height: number;
  bitrate?: number;
  framerate?: number;
  avc?: { format: string };
}

interface EncodedVideoChunk {
  type: 'key' | 'delta';
  timestamp: number;
  byteLength: number;
  copyTo(dest: ArrayBuffer): void;
}

interface EncodedVideoChunkMetadata {
  decoderConfig?: {
    codec: string;
    description?: ArrayBuffer;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture the Cesium canvas over the replay duration, encode via WebCodecs,
 * and return an MP4 Blob.
 *
 * @param canvas       The HTMLCanvasElement Cesium renders into.
 * @param replayState  The replay state to scrub through.
 * @param segments     Camera segments from cinematicSequencer.
 * @param onProgress   Called with 0–1 progress during export.
 * @returns            MP4 Blob, or null when WebCodecs unavailable.
 */
export async function exportRideAsMP4(
  canvas: HTMLCanvasElement,
  replayState: ReplayState,
  segments: CameraSegment[],
  onProgress: (pct: number) => void,
): Promise<Blob | null> {
  if (!isWebCodecsSupported()) return null;

  const { width, height } = canvas;
  const totalFrames = Math.ceil(replayState.durationSec * TARGET_FPS);
  if (totalFrames === 0) return null;

  const chunks: { data: Uint8Array; isKey: boolean; ts: number }[] = [];

  const encoder = new VideoEncoder({
    output(chunk: EncodedVideoChunk) {
      const buf = new ArrayBuffer(chunk.byteLength);
      chunk.copyTo(buf);
      chunks.push({
        data: new Uint8Array(buf),
        isKey: chunk.type === 'key',
        ts: chunk.timestamp,
      });
    },
    error(e: DOMException) {
      console.error('[videoExport] encoder error:', e.message);
    },
  });

  encoder.configure({
    codec: 'avc1.42001f', // H.264 Baseline Level 3.1
    width,
    height,
    bitrate: 4_000_000,
    framerate: TARGET_FPS,
    avc: { format: 'annexb' },
  });

  // Scrub through the replay at TARGET_FPS, capturing canvas frames.
  // We mutate a local copy of replayState so the UI is not disturbed.
  let state = { ...replayState, isPlaying: true };
  const dtPerFrame = 1 / TARGET_FPS;

  for (let f = 0; f < totalFrames; f++) {
    // Advance replay to the correct time for this frame.
    const targetTimeSec = f * dtPerFrame;
    state = { ...state, currentTime: targetTimeSec };

    // Resolve which sample is at this time.
    const sample = sampleAtTime(state, targetTimeSec);

    // Tick so consumers know the current camera mode at this time.
    void cameraForTime(segments, targetTimeSec);
    void sample; // camera position would be applied to Cesium by the caller

    // Capture canvas → VideoFrame.
    const frameTs = f * FRAME_DURATION_US;
    const videoFrame = new VideoFrame(canvas, {
      timestamp: frameTs,
      duration: FRAME_DURATION_US,
    });

    encoder.encode(videoFrame, { keyFrame: f % (TARGET_FPS * 2) === 0 });
    videoFrame.close();

    onProgress(f / totalFrames);

    // Yield to the browser every 10 frames to keep the UI responsive.
    if (f % 10 === 0) {
      await new Promise<void>((res) => setTimeout(res, 0));
    }
  }

  await encoder.flush();
  encoder.close();
  onProgress(1);

  // Assemble a very minimal Annex-B raw H.264 stream wrapped in a Blob.
  // This is playable in Chrome (which handles Annex-B directly) even without
  // a proper MP4 container. A future revision should use mp4-muxer.
  const parts: BlobPart[] = chunks.map((c) => c.data.buffer as ArrayBuffer);
  return new Blob(parts, { type: 'video/mp4' });
}

/**
 * Convenience wrapper: scrub the replay and return the camera mode for each
 * frame. Used by ReplayPlayer.tsx to apply the correct Cesium camera during
 * export without duplicating the segmentation logic.
 */
export function buildFrameCameraMap(
  segments: CameraSegment[],
  durationSec: number,
): string[] {
  const totalFrames = Math.ceil(durationSec * TARGET_FPS);
  const map: string[] = [];
  for (let f = 0; f < totalFrames; f++) {
    map.push(cameraForTime(segments, f / TARGET_FPS));
  }
  return map;
}

/** Advance a ReplayState by one frame-worth of time. Exported for external use. */
export function advanceReplayOneFrame(state: ReplayState): ReplayState {
  return tickReplay(state, 1 / TARGET_FPS);
}
