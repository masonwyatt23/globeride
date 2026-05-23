import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { setIonToken, setupBaseImagery } from '@/lib/cesiumUtils';

/**
 * Altitude threshold (metres above the ellipsoid) below which the Google
 * Photorealistic 3D Tiles are shown on the explore globe.  Above this the
 * photoreal mesh produces hexagonal LOD artifacts at planet-scale zoom, so
 * we hide it and let the Bing Aerial imagery carry the globe appearance.
 *
 * 5 km gives a crisp handoff: photoreal appears once you've zoomed into a
 * city neighbourhood, which is exactly when it looks impressive.
 */
const PHOTOREAL_SHOW_ALTITUDE_M = 5_000;

/** Google Photorealistic 3D Tiles — Cesium ion asset 2275207. */
const GOOGLE_PHOTOREAL_ASSET_ID = 2275207;

/**
 * Degrees the globe rotates per second when idle auto-rotation is active.
 * 0.5° s⁻¹ ≈ one full rotation in 12 minutes — slow enough to feel alive,
 * fast enough to notice immediately.
 */
const AUTO_ROTATE_DEG_PER_SEC = 0.5;

/**
 * Milliseconds of no user interaction before auto-rotation resumes after a
 * drag / zoom / click.
 */
const IDLE_RESUME_MS = 5_000;

/**
 * Full-bleed Cesium globe for the Explore page.
 *
 * Rendering decisions vs the ride CesiumViewer:
 * - Bing Aerial (ion asset 2) is the always-on base layer.
 * - Google Photorealistic 3D Tiles are loaded but hidden above
 *   PHOTOREAL_SHOW_ALTITUDE_M to avoid the polygon-void artifacts at
 *   planet-scale zoom.  They reveal automatically as the user zooms in.
 * - SkyAtmosphere limb glow is enabled with a NASA-spaceflight tuning.
 * - SkyBox stars are shown.
 * - Sun lighting uses a real solar angle (clock time not pinned to noon).
 * - Cinematic intro: camera starts at 50 000 km and flies to 25 000 km
 *   over 3 seconds with a smooth easing curve.
 * - Idle auto-rotation at 0.5° s⁻¹, paused on interaction, resumes after
 *   5 s idle.
 *
 * The component intentionally does NOT call setActiveViewer — that registry
 * is for the ride view and RouteDrawer; the explore globe is independent.
 */
export function ExploreGlobe({ ionToken }: { ionToken: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    setIonToken(ionToken);

    // ------------------------------------------------------------------ //
    // 1. Construct viewer — minimal UI chrome, black background.           //
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

    // Remove Cesium's default Bing layer so setupBaseImagery can add its own
    // without doubling the layer — the idempotency guard in setupBaseImagery
    // keys on the viewer reference, so we must clear here first.
    viewer.scene.imageryLayers.removeAll();

    const scene = viewer.scene;

    // Outer space is black; the atmosphere handles the blue gradient.
    viewer.scene.backgroundColor = Cesium.Color.BLACK;

    // ------------------------------------------------------------------ //
    // 2. Bing Aerial base imagery — always-on, works at any zoom level.   //
    // ------------------------------------------------------------------ //
    setupBaseImagery(viewer).catch(() => undefined);

    // ------------------------------------------------------------------ //
    // 3. Atmosphere — NASA-spaceflight limb glow.                         //
    // ------------------------------------------------------------------ //
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      // Slightly more vivid blue limb — as seen from the ISS.
      scene.skyAtmosphere.hueShift = 0.0;
      scene.skyAtmosphere.saturationShift = 0.12;
      scene.skyAtmosphere.brightnessShift = 0.05;
      scene.skyAtmosphere.perFragmentAtmosphere = true;
      // Richer Rayleigh scattering → deeper blue limb at high altitude.
      if ('atmosphereLightIntensity' in scene.skyAtmosphere) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (scene.skyAtmosphere as any).atmosphereLightIntensity = 60;
      }
    }

    // ------------------------------------------------------------------ //
    // 4. Stars background.                                                 //
    // ------------------------------------------------------------------ //
    if (scene.skyBox) {
      scene.skyBox.show = true;
    }

    // ------------------------------------------------------------------ //
    // 5. Sun — real solar angle (clock ticks at real wall-clock speed).   //
    // ------------------------------------------------------------------ //
    // Set the clock to now so the sun is positioned at the actual current
    // UTC time; tick is multiplier 1 (real-time).  This is different from
    // the ride viewer which pins a mood-based time.
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;
    scene.globe.enableLighting = true;

    // ------------------------------------------------------------------ //
    // 6. Terrain — Cesium World Terrain for realistic mountains.          //
    // ------------------------------------------------------------------ //
    Cesium.createWorldTerrainAsync()
      .then((terrain) => {
        if (viewer.isDestroyed()) return;
        viewer.scene.terrainProvider = terrain;
      })
      .catch(() => undefined);

    // ------------------------------------------------------------------ //
    // 7. Google Photorealistic 3D Tiles — hidden at high altitude.        //
    // ------------------------------------------------------------------ //
    let photorealTileset: Cesium.Cesium3DTileset | null = null;

    Cesium.Cesium3DTileset.fromIonAssetId(GOOGLE_PHOTOREAL_ASSET_ID, {
      maximumScreenSpaceError: 16,
    })
      .then((tileset) => {
        if (viewer.isDestroyed()) {
          tileset.destroy?.();
          return;
        }
        // Start hidden — the preRender handler will show/hide based on altitude.
        tileset.show = false;
        viewer.scene.primitives.add(tileset);
        photorealTileset = tileset;
      })
      .catch(() => undefined); // token may not have photoreal access — that's fine

    // ------------------------------------------------------------------ //
    // 8. Cinematic intro — start far out, ease in to comfortable orbit.   //
    // ------------------------------------------------------------------ //
    // Place the initial camera at 50 000 km looking at the prime meridian /
    // equator — a good "space overview" starting point.
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 50_000_000),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });

    // Fly to a comfortable globe-view altitude (~25 000 km) over 3 seconds.
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(10, 25, 25_000_000),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
      duration: 3.0,
      easingFunction: Cesium.EasingFunction.CUBIC_OUT,
    });

    // ------------------------------------------------------------------ //
    // 9. Idle auto-rotation.                                               //
    // ------------------------------------------------------------------ //
    let isAutoRotating = true;

    // Interaction listeners — pause rotation, schedule resume.
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    const pauseRotation = () => {
      isAutoRotating = false;
      if (resumeTimer !== null) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        isAutoRotating = true;
        resumeTimer = null;
      }, IDLE_RESUME_MS);
    };

    // Cesium's screen space event handler lets us listen inside the canvas.
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.WHEEL);
    handler.setInputAction(pauseRotation, Cesium.ScreenSpaceEventType.PINCH_START);

    let lastTickMs = performance.now();

    const onPreRender = () => {
      const nowMs = performance.now();
      const dt = (nowMs - lastTickMs) / 1000; // seconds
      lastTickMs = nowMs;

      // --- Photoreal altitude gate ---
      if (photorealTileset && !photorealTileset.isDestroyed()) {
        const altM = viewer.camera.positionCartographic.height;
        photorealTileset.show = altM < PHOTOREAL_SHOW_ALTITUDE_M;
      }

      // --- Auto-rotation ---
      // Don't rotate while the intro fly-in is running (first ~3 s).
      // Use lastInteractionMs === 0 as "never touched" flag; the intro
      // camera flight will have landed by the time IDLE_RESUME_MS elapses,
      // so we simply pause for 3 s after mount via a one-shot flag.
      if (!isAutoRotating) return;

      // Rotate around the globe's north pole axis.
      // camera.rotate(axis, angle) rotates the camera AROUND the given
      // world-space axis passing through the scene origin.
      const deltaRad = Cesium.Math.toRadians(AUTO_ROTATE_DEG_PER_SEC * dt);
      viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -deltaRad);
    };

    scene.preRender.addEventListener(onPreRender);

    // Delay auto-rotation start until after the intro fly-in (3 s + buffer).
    isAutoRotating = false;
    const introTimer = setTimeout(() => {
      isAutoRotating = true;
    }, 3_500);

    // ------------------------------------------------------------------ //
    // 10. ResizeObserver so the canvas refits on layout changes.          //
    // ------------------------------------------------------------------ //
    const ro = new ResizeObserver(() => {
      if (!viewer.isDestroyed()) viewer.resize();
    });
    ro.observe(containerRef.current!);

    // ------------------------------------------------------------------ //
    // Cleanup                                                              //
    // ------------------------------------------------------------------ //
    return () => {
      clearTimeout(introTimer);
      if (resumeTimer !== null) clearTimeout(resumeTimer);
      ro.disconnect();
      handler.destroy();

      if (!viewer.isDestroyed()) {
        scene.preRender.removeEventListener(onPreRender);

        if (photorealTileset && !photorealTileset.isDestroyed()) {
          try {
            viewer.scene.primitives.remove(photorealTileset);
            photorealTileset.destroy();
          } catch {
            // Scene may already be torn down — ignore.
          }
        }

        viewer.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}
