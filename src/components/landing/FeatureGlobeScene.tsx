/**
 * FeatureGlobeScene — the actual Cesium viewer for the "3D photoreal world"
 * feature card. Lazy-imported by FeatureGlobePreview so Cesium stays out of
 * the initial landing bundle.
 *
 * Behaviour:
 *   - Bing Aerial + atmosphere (same brand as HeroGlobe).
 *   - 25 000 km altitude, auto-rotation at 0.5°/s.
 *   - No Google Photorealistic 3D Tiles (pointless at card size / altitude).
 *   - No user interaction.
 *   - resolutionScale 0.75 (card is small — no need for full res).
 *   - Respects concurrent-scene cap via claimSceneSlot / releaseSceneSlot.
 *   - Clean destroy + slot release on unmount.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { setIonToken, setupBaseImagery } from '@/lib/cesiumUtils';
import { tryEnableHDR } from '@/lib/cesiumHDR';
import { claimSceneSlot, releaseSceneSlot } from './FeatureGlobePreview';
import { waitForContainerSize } from '@/lib/landing/waitForContainerSize';

const AUTO_ROTATE_DEG_PER_SEC = 0.5;

export function FeatureGlobeScene({ ionToken }: { ionToken: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let viewer: Cesium.Viewer | null = null;
    let roResize: ResizeObserver | null = null;
    let onPreRender: (() => void) | null = null;
    let slotClaimed = false;

    async function init() {
      if (!containerRef.current) return;

      // Respect concurrent-scene cap before awaiting dimensions.
      if (!claimSceneSlot()) return;
      slotClaimed = true;

      // Defer Cesium construction until the container has non-zero dimensions.
      const size = await waitForContainerSize(containerRef.current);
      if (cancelled || !size || !containerRef.current) return;

      setIonToken(ionToken);

      // ---------------------------------------------------------------------- //
      // 1. Viewer — minimal chrome.                                              //
      // ---------------------------------------------------------------------- //
      viewer = new Cesium.Viewer(containerRef.current, {
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

      // Card is small — keep GPU load modest.
      viewer.resolutionScale = 0.75;

      // ---------------------------------------------------------------------- //
      // 2. Imagery + atmosphere.                                                 //
      // ---------------------------------------------------------------------- //
      scene.imageryLayers.removeAll();
      setupBaseImagery(viewer).catch(() => undefined);
      tryEnableHDR(viewer);

      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.show = true;
        scene.skyAtmosphere.hueShift = 0.0;
        scene.skyAtmosphere.saturationShift = 0.15;
        scene.skyAtmosphere.brightnessShift = 0.05;
        scene.skyAtmosphere.perFragmentAtmosphere = true;
        if ('atmosphereLightIntensity' in scene.skyAtmosphere) {
          (scene.skyAtmosphere as Cesium.SkyAtmosphere & { atmosphereLightIntensity?: number }).atmosphereLightIntensity = 60;
        }
      }

      if (scene.skyBox) scene.skyBox.show = true;

      viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
      viewer.clock.multiplier = 1;
      viewer.clock.shouldAnimate = true;
      scene.globe.enableLighting = true;

      // ---------------------------------------------------------------------- //
      // 3. Camera — 25 000 km, similar framing to HeroGlobe.                   //
      // ---------------------------------------------------------------------- //
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(10, 30, 25_000_000),
        orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
      });

      // ---------------------------------------------------------------------- //
      // 4. Auto-rotation.                                                        //
      // ---------------------------------------------------------------------- //
      let lastTickMs = performance.now();

      onPreRender = () => {
        if (!viewer || viewer.isDestroyed()) return;
        const nowMs = performance.now();
        const dt = Math.min((nowMs - lastTickMs) / 1000, 0.1);
        lastTickMs = nowMs;
        const deltaRad = Cesium.Math.toRadians(AUTO_ROTATE_DEG_PER_SEC * dt);
        viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -deltaRad);
      };

      scene.preRender.addEventListener(onPreRender);

      // ---------------------------------------------------------------------- //
      // 5. ResizeObserver — refit canvas when card resizes.                     //
      // ---------------------------------------------------------------------- //
      roResize = new ResizeObserver(() => {
        if (viewer && !viewer.isDestroyed()) viewer.resize();
      });
      roResize.observe(containerRef.current!);
    }

    init();

    return () => {
      cancelled = true;
      roResize?.disconnect();
      if (viewer && !viewer.isDestroyed()) {
        if (onPreRender) {
          viewer.scene.preRender.removeEventListener(onPreRender);
        }
        viewer.destroy();
      }
      if (slotClaimed) releaseSceneSlot();
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
