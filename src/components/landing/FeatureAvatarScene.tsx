/**
 * FeatureAvatarScene — the actual Cesium viewer for the "Animated 45-part 3D
 * avatar" feature card. Lazy-imported by FeatureAvatarPreview.
 *
 * Behaviour:
 *   - Short flat demo route (5 control points, ~1 km loop) near Girona.
 *   - createAvatar() from src/lib/avatar.ts — same 45-part rig used in-app.
 *   - Chase-cam (80 m back, 25 m up, -12° pitch).
 *   - Loops every ~10 s (8× speed over ~1 km route).
 *   - avatar.update() called each frame so pedals spin, wheels turn.
 *   - No Google Photorealistic 3D Tiles — card too small and no benefit.
 *   - resolutionScale 0.75 — card is small.
 *   - Concurrent-scene cap via claimSceneSlot / releaseSceneSlot.
 *   - Clean avatar.dispose() + viewer.destroy() on unmount.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { setIonToken, setupBaseImagery } from '@/lib/cesiumUtils';
import { tryEnableHDR } from '@/lib/cesiumHDR';
import { createAvatar } from '@/lib/avatar';
import { claimSceneSlot, releaseSceneSlot } from './FeatureGlobePreview';

// ---------------------------------------------------------------------------
// Demo route — short loop near Girona, Spain (flat rolling terrain).
// [lon, lat, alt_m]
// ---------------------------------------------------------------------------
const DEMO_ROUTE: [number, number, number][] = [
  [2.8220, 41.9770, 70],
  [2.8310, 41.9790, 78],
  [2.8390, 41.9760, 82],
  [2.8440, 41.9720, 76],
  [2.8380, 41.9680, 70],
  [2.8290, 41.9700, 68],
  [2.8220, 41.9770, 70], // close the loop
];

/** Approximate route length in metres (used for speed calculation). */
const ROUTE_LENGTH_M = 1_000;

/** 8× speed at ~5 m/s → route completes in ~25 s real time. */
const EFFECTIVE_SPEED_MS = 5 * 8; // 40 m/s effective

/** Chase-cam parameters. */
const CAM_BACK_M = 80;
const CAM_UP_M = 25;
const CAM_PITCH_DEG = -12;

function lerpCoord(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function sampleRoute(progress: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, progress));
  const n = DEMO_ROUTE.length - 1;
  const scaled = clamped * n;
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, n);
  const t = scaled - lo;
  return lerpCoord(DEMO_ROUTE[lo], DEMO_ROUTE[hi], t);
}

function toC3(coord: [number, number, number]): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2]);
}

export function FeatureAvatarScene({ ionToken }: { ionToken: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!claimSceneSlot()) return;

    setIonToken(ionToken);

    // ---------------------------------------------------------------------- //
    // 1. Viewer.                                                               //
    // ---------------------------------------------------------------------- //
    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
    });

    const scene = viewer.scene;
    scene.backgroundColor = Cesium.Color.BLACK;
    scene.screenSpaceCameraController.enableInputs = false;
    viewer.resolutionScale = 0.75;

    // ---------------------------------------------------------------------- //
    // 2. Imagery + atmosphere.                                                 //
    // ---------------------------------------------------------------------- //
    scene.imageryLayers.removeAll();
    setupBaseImagery(viewer).catch(() => undefined);
    tryEnableHDR(viewer);

    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.saturationShift = 0.15;
      scene.skyAtmosphere.brightnessShift = 0.05;
      scene.skyAtmosphere.perFragmentAtmosphere = true;
    }

    if (scene.skyBox) scene.skyBox.show = true;

    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;
    scene.globe.enableLighting = true;

    // ---------------------------------------------------------------------- //
    // 3. Route polyline.                                                       //
    // ---------------------------------------------------------------------- //
    const routeEntity = viewer.entities.add({
      polyline: {
        positions: DEMO_ROUTE.map(toC3),
        width: 4,
        material: new Cesium.PolylineGlowMaterialProperty({
          color: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.85),
          glowPower: 0.25,
        }),
        clampToGround: false,
      },
    });

    // ---------------------------------------------------------------------- //
    // 4. Avatar — actual 45-part procedural cyclist.                          //
    // ---------------------------------------------------------------------- //
    const avatar = createAvatar(viewer);

    // ---------------------------------------------------------------------- //
    // 5. Initial camera — low altitude, looking at route start.              //
    // ---------------------------------------------------------------------- //
    const startCoord = DEMO_ROUTE[0];
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(startCoord[0], startCoord[1], 500),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-30), roll: 0 },
    });

    // ---------------------------------------------------------------------- //
    // 6. State machine — ride loop.                                           //
    // ---------------------------------------------------------------------- //
    let rideProgress = 0;      // [0, 1] along DEMO_ROUTE
    let lastTickMs = performance.now();
    let lastCamPos: Cesium.Cartesian3 | null = null;
    let lastHeading: number | null = null;
    let lastPitch: number | null = null;

    function angleDelta(a: number, b: number): number {
      let d = b - a;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    }

    const onPreRender = () => {
      // Belt-and-suspenders: skip the frame if Cesium is torn down (h:0 race).
      if (viewer.isDestroyed()) return;

      const nowMs = performance.now();
      const dt = Math.min((nowMs - lastTickMs) / 1000, 0.1);
      lastTickMs = nowMs;

      // Advance progress; loop seamlessly.
      rideProgress += (EFFECTIVE_SPEED_MS * dt) / ROUTE_LENGTH_M;
      if (rideProgress >= 1) rideProgress -= 1;

      const currentCoord = sampleRoute(rideProgress);
      const nextCoord = sampleRoute(Math.min(1, rideProgress + 0.02));

      const current = toC3(currentCoord);
      const next = toC3(nextCoord);

      // Heading from current to next in ENU frame.
      // Guard: if current is degenerate (NaN components from bad coords),
      // eastNorthUpToFixedFrame produces an invalid matrix — skip the frame.
      if (!Cesium.Cartesian3.equals(current, current)) {
        // NaN check: NaN !== NaN, so Cartesian3.equals fails on NaN input.
        if (import.meta.env.DEV) {
          console.warn('[FeatureAvatarScene] frame skipped — degenerate position');
        }
        return;
      }
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(current);
      const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
      const localNext = Cesium.Matrix4.multiplyByPoint(inv, next, new Cesium.Cartesian3());
      const targetHeading = Math.atan2(localNext.x, localNext.y);

      // Grade: approximate from alt difference over ~20 m horizontal.
      const altDelta = nextCoord[2] - currentCoord[2];
      const grade = (altDelta / 20) * 100; // rough %

      // Avatar update — drives wheel spin, pedalling, body pitch.
      avatar.update({
        lon: currentCoord[0],
        lat: currentCoord[1],
        ele: currentCoord[2],
        heading: targetHeading,
        speed: EFFECTIVE_SPEED_MS / 8, // back to real speed for physics
        cadence: 0, // estimate from speed
        grade,
        dt,
        riderPosition: 'hoods',
      });

      // Chase cam.
      const offsetLocal = new Cesium.Cartesian3(
        -Math.sin(targetHeading) * CAM_BACK_M,
        -Math.cos(targetHeading) * CAM_BACK_M,
        CAM_UP_M,
      );
      const targetCamPos = Cesium.Matrix4.multiplyByPoint(
        enu,
        offsetLocal,
        new Cesium.Cartesian3(),
      );
      const targetPitch = Cesium.Math.toRadians(CAM_PITCH_DEG);
      const clampedDt = Math.max(0, Math.min(dt, 0.1));
      const posBlend = 1 - Math.exp(-3.0 * clampedDt);
      const rotBlend = 1 - Math.exp(-2.5 * clampedDt);

      const camPos =
        lastCamPos === null
          ? Cesium.Cartesian3.clone(targetCamPos, new Cesium.Cartesian3())
          : Cesium.Cartesian3.lerp(lastCamPos, targetCamPos, posBlend, new Cesium.Cartesian3());
      const heading =
        lastHeading === null
          ? targetHeading
          : lastHeading + angleDelta(lastHeading, targetHeading) * rotBlend;
      const camPitch =
        lastPitch === null
          ? targetPitch
          : lastPitch + (targetPitch - lastPitch) * rotBlend;

      lastCamPos = Cesium.Cartesian3.clone(camPos, new Cesium.Cartesian3());
      lastHeading = heading;
      lastPitch = camPitch;

      viewer.camera.setView({
        destination: camPos,
        orientation: { heading, pitch: camPitch, roll: 0 },
      });
    };

    scene.preRender.addEventListener(onPreRender);

    // ---------------------------------------------------------------------- //
    // 7. ResizeObserver.                                                       //
    // ---------------------------------------------------------------------- //
    const ro = new ResizeObserver(() => {
      if (!viewer.isDestroyed()) viewer.resize();
    });
    ro.observe(containerRef.current!);

    // ---------------------------------------------------------------------- //
    // Cleanup                                                                   //
    // ---------------------------------------------------------------------- //
    return () => {
      ro.disconnect();
      if (!viewer.isDestroyed()) {
        scene.preRender.removeEventListener(onPreRender);
        try { avatar.dispose(); } catch { /* already gone */ }
        try { viewer.entities.remove(routeEntity); } catch { /* already gone */ }
        viewer.destroy();
      }
      releaseSceneSlot();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
