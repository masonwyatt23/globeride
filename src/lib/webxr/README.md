# `src/lib/webxr/` — WebXR VR and AR session pipeline

## What's here

- `webxr.d.ts` — Ambient TypeScript declarations for WebXR Device API types not yet in `lib.dom.d.ts` (XRSession, XRWebGLLayer, XRDOMOverlayState, XRInputSource, etc.)
- `xrCapability.ts` — Async capability detection for `immersive-vr` and `immersive-ar`; result is module-cached after first call
- `xrSession.ts` — Full VR session lifecycle: WebGL layer binding, per-eye Cesium rendering, 6DOF room-scale, DOM overlay HUD wiring
- `xrAR.ts` — AR (`immersive-ar`) session variant using passthrough cameras; transparent Cesium background, lower resolution scale (0.6)
- `xrDomOverlay.ts` — Reads the session's `domOverlayState` to determine overlay type after entering VR/AR
- `xrRoomScale.ts` — Converts headset orientation quaternion to Cesium camera heading/pitch on every XR frame

## Public API

```ts
// xrCapability.ts
detectXR(): Promise<XRCapability>
// { vrSupported, arSupported, reason? } — safe on all browsers including Safari

// xrSession.ts
enterVR(viewer: Cesium.Viewer, overlayRoot?: HTMLElement): Promise<XRHandle>
exitVR(handle: XRHandle): Promise<void>
isInVR(): boolean
getActiveSession(): XRSession | null
// Also: getCesiumWebGLContext, createXRWebGLLayer, requestXRReferenceSpace, runXRFrameLoop

// xrAR.ts
enterAR(viewer: Cesium.Viewer, overlayRoot?: HTMLElement): Promise<XRARHandle>
exitAR(handle: XRARHandle): Promise<void>
isInAR(): boolean

// xrDomOverlay.ts
getDomOverlayType(session: XRSession): 'screen' | 'floating' | 'head-locked' | null

// xrRoomScale.ts
(helpers consumed internally by xrSession.ts — no public API surface exposed to callers)
```

## How it's consumed

- `src/components/ride/EnterVRButton.tsx` — calls `detectXR`, `enterVR`, `exitVR`
- `src/components/ride/EnterARButton.tsx` — calls `detectXR`, `enterAR`, `exitAR`
- `src/components/ride/VRHud.tsx` — calls `getActiveSession`, `getDomOverlayType`

## Constraints / gotchas

- **Browser support**: Chrome 79+ on desktop; Quest 2/3 via Chrome or Wolvic; Vision Pro Safari (visionOS 2+, partial). Firefox and Safari on desktop: `detectXR` returns `{ vrSupported: false, arSupported: false }` silently.
- **Cesium coupling**: `enterVR`/`enterAR` take a live `Cesium.Viewer` and override `resolutionScale` (0.85 VR, 0.6 AR) and the camera frustum. Both are restored on exit.
- **One session at a time**: module-level `_activeHandle` / `_activeARHandle` enforce a single concurrent session. Calling `enterVR` while already in AR (or vice versa) will throw.
- **DOM overlay**: `overlayRoot` must be in the document before `requestSession` is called; the browser requires it in the initial `XRSessionInit`.
- **Cleanup**: always call `exitVR`/`exitAR` — they restore `viewer.useDefaultRenderLoop`, reset camera frustum, and cancel the rAF loop.
