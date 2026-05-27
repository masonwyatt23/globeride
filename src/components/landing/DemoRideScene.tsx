/**
 * DemoRideScene — cinematic autoplay Cesium demo for the landing page.
 *
 * Plays a looping "real GlobeRide ride" along Mont Ventoux at 8× speed.
 * Non-interactive, autoplay-safe, lazy-loaded by DemoRideSection.
 *
 * Phase state machine (runs in preRender):
 *   0 · globeOverview  — 3 s slow auto-rotation at 25 000 km
 *   1 · flyToStart     — 4 s ease-out fly from space to route base
 *   2 · riding         — chase-cam follows rider up the climb at 8× speed
 *   3 · fadeOut        — 1 s hold at summit then camera pulls back to space
 *   → loop back to 0
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { setIonToken, setupBaseImagery } from '@/lib/cesiumUtils';

// ---------------------------------------------------------------------------
// Route — Mont Ventoux (different from HeroGlobe's Mortirolo)
// Coords: [lon, lat, alt_m]
// ---------------------------------------------------------------------------
const VENTOUX_COORDS: [number, number, number][] = [
  [5.1790, 44.1238, 295],   // Bédoin base
  [5.2060, 44.1470, 480],   // Saint-Estève
  [5.2340, 44.1680, 750],   // Chalet Reynard approach
  [5.2590, 44.1840, 1265],  // Above treeline
  [5.2720, 44.1990, 1650],  // Final 3 km
  [5.2785, 44.2100, 1912],  // Observatory summit
];

/** Total approximate route length in metres (used for speed calculation). */
const ROUTE_LENGTH_M = 21_500;

/** 8× real-time at ~4.5 m/s average cycling pace → 36 m/s effective. */
const PLAYBACK_SPEED = 8;
const AVG_SPEED_MS = 4.5; // m/s — realistic climbing pace
const EFFECTIVE_SPEED = AVG_SPEED_MS * PLAYBACK_SPEED;

/** Phase durations in seconds. */
const PHASE_OVERVIEW_S = 3;
const PHASE_FLY_S = 4;
const PHASE_FADE_S = 1.2;

/** Auto-rotation speed during globe overview. */
const ROTATE_DEG_PER_SEC = 0.5;

/** Chase-cam parameters. */
const FOLLOW_CAM_BACK_M = 80;
const FOLLOW_CAM_UP_M = 25;
const FOLLOW_CAM_PITCH_DEG = -12;

/** Easing — ease-out cubic. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Linear interpolation between two [lon, lat, alt] positions. */
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

/**
 * Given a fractional progress [0, 1] along the sparse control-point array,
 * returns the interpolated [lon, lat, alt] position.
 */
function sampleRoute(progress: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, progress));
  const n = VENTOUX_COORDS.length - 1;
  const scaled = clamped * n;
  const lo = Math.floor(scaled);
  const hi = Math.min(lo + 1, n);
  const t = scaled - lo;
  return lerpCoord(VENTOUX_COORDS[lo], VENTOUX_COORDS[hi], t);
}

/** Build Cartesian3 from [lon, lat, alt]. */
function toC3(coord: [number, number, number]): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2]);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DemoRideScene({ ionToken }: { ionToken: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    setIonToken(ionToken);

    // ------------------------------------------------------------------ //
    // 1. Viewer — same minimal chrome as HeroGlobe.                       //
    // ------------------------------------------------------------------ //
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

    // Non-interactive — demo only.
    scene.screenSpaceCameraController.enableInputs = false;
    scene.backgroundColor = Cesium.Color.BLACK;

    // ------------------------------------------------------------------ //
    // 2. GPU budget — reduce resolution on high-DPI / mobile.             //
    // ------------------------------------------------------------------ //
    const isMobile = (navigator.hardwareConcurrency ?? 8) < 4;
    viewer.resolutionScale = isMobile ? 0.6 : window.devicePixelRatio > 2 ? 0.75 : 1.0;

    // ------------------------------------------------------------------ //
    // 3. Imagery + atmosphere — same brand config as HeroGlobe.           //
    // ------------------------------------------------------------------ //
    scene.imageryLayers.removeAll();
    setupBaseImagery(viewer).catch(() => undefined);

    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.hueShift = 0.0;
      scene.skyAtmosphere.saturationShift = 0.15;
      scene.skyAtmosphere.brightnessShift = 0.05;
      scene.skyAtmosphere.perFragmentAtmosphere = true;
      if ('atmosphereLightIntensity' in scene.skyAtmosphere) {
        // atmosphereLightIntensity is a Cesium private field not yet in @types/cesium.
        (scene.skyAtmosphere as Cesium.SkyAtmosphere & { atmosphereLightIntensity?: number }).atmosphereLightIntensity = 60;
      }
    }

    if (scene.skyBox) scene.skyBox.show = true;

    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;
    scene.globe.enableLighting = true;

    // ------------------------------------------------------------------ //
    // 4. Route polyline — aqua PolylineGlow, brand colour.                //
    // ------------------------------------------------------------------ //
    const routePositions = VENTOUX_COORDS.map(toC3);

    const routeEntity = viewer.entities.add({
      polyline: {
        positions: routePositions,
        width: 5,
        material: new Cesium.PolylineGlowMaterialProperty({
          color: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.9),
          glowPower: 0.3,
        }),
        clampToGround: false,
      },
    });

    // ------------------------------------------------------------------ //
    // 5. Rider avatar — simple glowing sphere billboard at current pos.   //
    // ------------------------------------------------------------------ //
    const startCoord = VENTOUX_COORDS[0];
    const riderEntity = viewer.entities.add({
      position: toC3(startCoord),
      ellipsoid: {
        radii: new Cesium.Cartesian3(12, 12, 12),
        material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.95),
        outline: false,
      },
    });

    // ------------------------------------------------------------------ //
    // 6. Initial camera — 25 000 km looking at Southern France.           //
    // ------------------------------------------------------------------ //
    const OVERVIEW_LON = 5.23;
    const OVERVIEW_LAT = 44.17;
    const OVERVIEW_ALT = 25_000_000;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(OVERVIEW_LON, OVERVIEW_LAT, OVERVIEW_ALT),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });

    // ------------------------------------------------------------------ //
    // 7. State machine                                                     //
    // ------------------------------------------------------------------ //
    type Phase = 'globeOverview' | 'flyToStart' | 'riding' | 'fadeOut';

    let phase: Phase = 'globeOverview';
    let phaseElapsed = 0;   // seconds since phase start
    let rideProgress = 0;   // [0, 1] along VENTOUX_COORDS
    let lastTickMs = performance.now();

    // Chase-cam easing state (mirrors applyFollowCam's approach locally).
    let lastCamPos: Cesium.Cartesian3 | null = null;
    let lastHeading: number | null = null;
    let lastPitch: number | null = null;

    function resetChaseCamState() {
      lastCamPos = null;
      lastHeading = null;
      lastPitch = null;
    }

    function applyChaseCam(progress: number, dt: number) {
      const LOOKAHEAD = 0.02;
      const currentCoord = sampleRoute(progress);
      const nextCoord = sampleRoute(Math.min(1, progress + LOOKAHEAD));

      const current = toC3(currentCoord);
      const next = toC3(nextCoord);

      // Derive heading in ENU frame.
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(current);
      const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
      const localNext = Cesium.Matrix4.multiplyByPoint(inv, next, new Cesium.Cartesian3());
      const targetHeading = Math.atan2(localNext.x, localNext.y);

      // Camera offset behind & above the rider.
      const offsetLocal = new Cesium.Cartesian3(
        -Math.sin(targetHeading) * FOLLOW_CAM_BACK_M,
        -Math.cos(targetHeading) * FOLLOW_CAM_BACK_M,
        FOLLOW_CAM_UP_M,
      );
      const targetCamPos = Cesium.Matrix4.multiplyByPoint(enu, offsetLocal, new Cesium.Cartesian3());
      const targetPitch = Cesium.Math.toRadians(FOLLOW_CAM_PITCH_DEG);

      const clampedDt = Math.min(Math.max(dt, 0), 0.1);
      const posBlend = 1 - Math.exp(-3.0 * clampedDt);
      const rotBlend = 1 - Math.exp(-2.5 * clampedDt);

      const camPos =
        lastCamPos === null
          ? Cesium.Cartesian3.clone(targetCamPos, new Cesium.Cartesian3())
          : Cesium.Cartesian3.lerp(lastCamPos, targetCamPos, posBlend, new Cesium.Cartesian3());

      function angleDelta(a: number, b: number): number {
        let d = b - a;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d;
      }

      const heading =
        lastHeading === null
          ? targetHeading
          : lastHeading + angleDelta(lastHeading, targetHeading) * rotBlend;
      const pitch =
        lastPitch === null ? targetPitch : lastPitch + (targetPitch - lastPitch) * rotBlend;

      lastCamPos = Cesium.Cartesian3.clone(camPos, new Cesium.Cartesian3());
      lastHeading = heading;
      lastPitch = pitch;

      viewer.camera.setView({
        destination: camPos,
        orientation: { heading, pitch, roll: 0 },
      });

      // Update rider entity position.
      (riderEntity.position as Cesium.ConstantPositionProperty).setValue(toC3(currentCoord));
    }

    const onPreRender = () => {
      const nowMs = performance.now();
      const dt = Math.min((nowMs - lastTickMs) / 1000, 0.1);
      lastTickMs = nowMs;
      phaseElapsed += dt;

      // ---- Phase 0: globe overview — slow rotation ---- //
      if (phase === 'globeOverview') {
        const deltaRad = Cesium.Math.toRadians(ROTATE_DEG_PER_SEC * dt);
        viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -deltaRad);

        if (phaseElapsed >= PHASE_OVERVIEW_S) {
          phase = 'flyToStart';
          phaseElapsed = 0;
        }
        return;
      }

      // ---- Phase 1: fly to route start ---- //
      if (phase === 'flyToStart') {
        const t = easeOutCubic(Math.min(phaseElapsed / PHASE_FLY_S, 1));

        // Interpolate from overview altitude down to just above route start.
        const startCoord = VENTOUX_COORDS[0];
        const flyTargetAlt = startCoord[2] + 2000; // 2 km above base
        const alt = OVERVIEW_ALT + (flyTargetAlt - OVERVIEW_ALT) * t;

        // Lat/lon pan toward start.
        const lon = OVERVIEW_LON + (startCoord[0] - OVERVIEW_LON) * t;
        const lat = OVERVIEW_LAT + (startCoord[1] - OVERVIEW_LAT) * t;
        const pitchDeg = -90 + 70 * t; // from straight-down → slightly forward
        const pitch = Cesium.Math.toRadians(pitchDeg);

        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
          orientation: { heading: 0, pitch, roll: 0 },
        });

        if (phaseElapsed >= PHASE_FLY_S) {
          phase = 'riding';
          phaseElapsed = 0;
          rideProgress = 0;
          resetChaseCamState();
        }
        return;
      }

      // ---- Phase 2: riding — chase cam ---- //
      if (phase === 'riding') {
        const distanceCovered = EFFECTIVE_SPEED * phaseElapsed;
        rideProgress = Math.min(distanceCovered / ROUTE_LENGTH_M, 1);

        applyChaseCam(rideProgress, dt);

        if (rideProgress >= 1) {
          phase = 'fadeOut';
          phaseElapsed = 0;
        }
        return;
      }

      // ---- Phase 3: fade out — hold at summit, pull back ---- //
      if (phase === 'fadeOut') {
        // Keep chase cam locked at summit.
        applyChaseCam(1, dt);

        if (phaseElapsed >= PHASE_FADE_S) {
          // Reset to globe overview.
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(OVERVIEW_LON, OVERVIEW_LAT, OVERVIEW_ALT),
            orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
          });
          rideProgress = 0;
          resetChaseCamState();
          phase = 'globeOverview';
          phaseElapsed = 0;
          // Reset rider to start.
          (riderEntity.position as Cesium.ConstantPositionProperty).setValue(toC3(VENTOUX_COORDS[0]));
        }
        return;
      }
    };

    scene.preRender.addEventListener(onPreRender);

    // ------------------------------------------------------------------ //
    // 8. ResizeObserver — refit canvas on container resize.               //
    // ------------------------------------------------------------------ //
    const ro = new ResizeObserver(() => {
      if (!viewer.isDestroyed()) viewer.resize();
    });
    ro.observe(containerRef.current!);

    // ------------------------------------------------------------------ //
    // Cleanup                                                              //
    // ------------------------------------------------------------------ //
    return () => {
      ro.disconnect();
      if (!viewer.isDestroyed()) {
        scene.preRender.removeEventListener(onPreRender);
        try { viewer.entities.remove(routeEntity); } catch { /* already gone */ }
        try { viewer.entities.remove(riderEntity); } catch { /* already gone */ }
        viewer.destroy();
      }
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
