/**
 * HeroGlobe — real Cesium globe for the landing page hero.
 *
 * Lazy-imported by HeroVisual via React.lazy — Cesium (~3 MB) is NOT part
 * of the initial landing JS bundle. HeroVisual shows HeroGlobeFallback
 * while this chunk loads and whenever WebGL / ion token is unavailable.
 *
 * Behaviour:
 *   - Bing Aerial base imagery (same as Explore page)
 *   - SkyAtmosphere + SkyBox + real-sun lighting (NASA spaceflight aesthetic)
 *   - Camera at 25 000 km looking at the Alps / Northern Italy so the
 *     Mortirolo polyline is visible on first render
 *   - Auto-rotation at 0.4°/s — never paused (no user interaction allowed)
 *   - IntersectionObserver: rotation paused when < 5 % of element is visible
 *   - ResizeObserver: canvas refits when the hero column resizes
 *   - Mortirolo Pass polyline (Giro 2024 S16) draped in aqua PolylineGlow
 *   - resolutionScale ≤ 0.75 on high-DPI to protect mobile GPU budget
 *   - All camera controls disabled — hero is a visual, not an interaction surface
 *   - Clean destroy on unmount
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { setIonToken, setupBaseImagery } from '@/lib/cesiumUtils';
import { tryEnableHDR } from '@/lib/cesiumHDR';

/** Altitude threshold below which Google Photorealistic 3D Tiles are shown. */
const PHOTOREAL_SHOW_ALTITUDE_M = 5_000;

/** Cesium ion asset ID for Google Photorealistic 3D Tiles. */
const GOOGLE_PHOTOREAL_ASSET_ID = 2275207;

/** Auto-rotation speed — 0.4°/s → one full orbit in ~15 minutes. */
const AUTO_ROTATE_DEG_PER_SEC = 0.4;

/**
 * Mortirolo Pass (Giro 2024 S16) control coords [lon, lat, alt_m].
 * Traces the famous climb section visible from the initial camera position
 * looking at northern Italy from ~25 000 km altitude.
 */
const MORTIROLO_COORDS: [number, number, number][] = [
  [10.3030, 46.2580, 530],   // Mazzo di Valtellina — Mortirolo base
  [10.3200, 46.2450, 800],
  [10.3350, 46.2300, 1100],
  [10.3450, 46.2200, 1400],
  [10.3520, 46.2050, 1650],
  [10.3600, 46.1830, 1852],  // Passo del Mortirolo summit
];

export function HeroGlobe({ ionToken }: { ionToken: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Apply the ion token so Cesium can stream imagery + terrain.
    setIonToken(ionToken);

    // ------------------------------------------------------------------ //
    // 1. Construct viewer — minimal chrome, black background.             //
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

    // Deep-space black — atmosphere handles the blue gradient.
    scene.backgroundColor = Cesium.Color.BLACK;

    // ------------------------------------------------------------------ //
    // 2. Disable ALL user interaction — this is a visual, not a tool.    //
    // ------------------------------------------------------------------ //
    scene.screenSpaceCameraController.enableInputs = false;

    // ------------------------------------------------------------------ //
    // 3. Reduce GPU load on high-DPI displays (retina phones).           //
    // ------------------------------------------------------------------ //
    viewer.resolutionScale = window.devicePixelRatio > 2 ? 0.75 : 1.0;

    // ------------------------------------------------------------------ //
    // 4. Bing Aerial base imagery.                                        //
    // ------------------------------------------------------------------ //
    scene.imageryLayers.removeAll();
    setupBaseImagery(viewer).catch(() => undefined);

    // ------------------------------------------------------------------ //
    // 4b. HDR + ACES tonemapping — richer colour on capable platforms.   //
    // ------------------------------------------------------------------ //
    tryEnableHDR(viewer);

    // ------------------------------------------------------------------ //
    // 4c. Google Photorealistic 3D Tiles — hidden above 5 km altitude.   //
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
        tileset.show = false; // altitude gate controls visibility per-frame
        viewer.scene.primitives.add(tileset);
        photorealTileset = tileset;
      })
      .catch(() => undefined); // token may lack photoreal access — that's fine

    // ------------------------------------------------------------------ //
    // 5. Atmosphere — NASA spaceflight limb glow.                        //
    // ------------------------------------------------------------------ //
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

    // ------------------------------------------------------------------ //
    // 6. Stars.                                                           //
    // ------------------------------------------------------------------ //
    if (scene.skyBox) {
      scene.skyBox.show = true;
    }

    // ------------------------------------------------------------------ //
    // 7. Real-time sun lighting.                                          //
    // ------------------------------------------------------------------ //
    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;
    scene.globe.enableLighting = true;

    // ------------------------------------------------------------------ //
    // 8. Camera — 25 000 km, looking at Northern Italy / Alps.           //
    //    The Mortirolo sits around 46°N, 10°E — perfect framing.         //
    // ------------------------------------------------------------------ //
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(10, 45, 25_000_000),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    });

    // ------------------------------------------------------------------ //
    // 9. Mortirolo polyline — aqua PolylineGlow, brand colour.           //
    // ------------------------------------------------------------------ //
    const routePositions = MORTIROLO_COORDS.map(([lon, lat, alt]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat, alt),
    );

    const routeEntity = viewer.entities.add({
      polyline: {
        positions: routePositions,
        width: 4,
        material: new Cesium.PolylineGlowMaterialProperty({
          color: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.85),
          glowPower: 0.25,
        }),
        clampToGround: false,
      },
    });

    // ------------------------------------------------------------------ //
    // 10. Auto-rotation — paused by IntersectionObserver when off-screen.//
    // ------------------------------------------------------------------ //
    let isRotating = true;
    let lastTickMs = performance.now();

    const onPreRender = () => {
      // --- Photoreal altitude gate ---
      if (photorealTileset && !photorealTileset.isDestroyed()) {
        const altM = viewer.camera.positionCartographic.height;
        photorealTileset.show = altM < PHOTOREAL_SHOW_ALTITUDE_M;
      }

      if (!isRotating) return;
      const nowMs = performance.now();
      const dt = (nowMs - lastTickMs) / 1000;
      lastTickMs = nowMs;
      const deltaRad = Cesium.Math.toRadians(AUTO_ROTATE_DEG_PER_SEC * dt);
      viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -deltaRad);
    };

    scene.preRender.addEventListener(onPreRender);

    // Pause rotation while the element is mostly off-screen.
    const io = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 1;
        isRotating = ratio >= 0.05;
        // Keep lastTickMs fresh so we don't get a large dt jump on resume.
        if (isRotating) lastTickMs = performance.now();
      },
      { threshold: [0, 0.05, 1] },
    );
    io.observe(containerRef.current!);

    // ------------------------------------------------------------------ //
    // 11. ResizeObserver — refit canvas when column resizes.             //
    // ------------------------------------------------------------------ //
    const ro = new ResizeObserver(() => {
      if (!viewer.isDestroyed()) viewer.resize();
    });
    ro.observe(containerRef.current!);

    // ------------------------------------------------------------------ //
    // Cleanup                                                              //
    // ------------------------------------------------------------------ //
    return () => {
      io.disconnect();
      ro.disconnect();

      if (!viewer.isDestroyed()) {
        scene.preRender.removeEventListener(onPreRender);
        try {
          viewer.entities.remove(routeEntity);
        } catch {
          // Entity may already be gone if scene is tearing down.
        }
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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
