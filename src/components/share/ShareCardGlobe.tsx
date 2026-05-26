/**
 * ShareCardGlobe — a small Cesium scene rendered into the share card's map
 * slot, replacing the flat SVG minimap with a photoreal globe view.
 *
 * Design constraints (share card context):
 *   - Fixed container size (parent passes width/height via CSS).
 *   - NO auto-rotation — position must be stable when html-to-image fires.
 *   - NO user interaction — no pan/zoom/click.
 *   - Camera frames the route bounding box at mount, then stays put.
 *   - Destroyed immediately after the parent signals capture is complete
 *     (parent calls the `onReady` callback when it's about to capture, then
 *     calls `onDestroy` once the PNG data URL is in hand).
 *   - Falls back to rendering nothing (parent shows SVG minimap) if Cesium
 *     fails to initialize.
 *
 * Capture timing:
 *   `onReady` is called only after `waitForCesiumReady` resolves — i.e. after
 *   Bing tiles have painted stable frames. This prevents html-to-image from
 *   capturing a gray globe.
 *
 * Usage:
 *   <ShareCardGlobe
 *     route={route}
 *     ionToken={token}
 *     width={936}        // card width minus padding
 *     height={480}       // MAP_H
 *     onReady={handleGlobeReady}
 *     onError={handleGlobeError}
 *   />
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { setIonToken, setupBaseImagery } from '@/lib/cesiumUtils';
import { fitCameraToRoute, waitForCesiumReady, type CesiumViewer } from '@/lib/shareCardCapture';
import type { Route } from '@/types';

/** Brand aqua — matches CYAN constant in ShareCard.tsx */
const BRAND_CYAN = '#22d3ee';

export interface ShareCardGlobeProps {
  route: Route;
  ionToken: string;
  /** Pixel width of the container (matches the share card's map slot). */
  width: number;
  /** Pixel height of the container (matches MAP_H). */
  height: number;
  /**
   * Called when the globe is fully rendered and ready for html-to-image
   * capture. The parent should trigger toPng() synchronously after this fires.
   */
  onReady: () => void;
  /**
   * Called if Cesium initialization or tile-loading fails in a way that
   * prevents a usable screenshot. Parent should fall back to SVG minimap.
   */
  onError?: (err: unknown) => void;
  /**
   * Timeout in ms to wait for tiles before capturing anyway (default 4 000).
   */
  readyTimeoutMs?: number;
}

export function ShareCardGlobe({
  route,
  ionToken,
  width,
  height,
  onReady,
  onError,
  readyTimeoutMs = 4_000,
}: ShareCardGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let viewer: Cesium.Viewer | null = null;
    let cancelled = false;

    async function init() {
      try {
        // Apply token before any Cesium API call.
        setIonToken(ionToken);

        // ---------------------------------------------------------------- //
        // 1. Construct viewer — absolutely no chrome.                       //
        // ---------------------------------------------------------------- //
        viewer = new Cesium.Viewer(container!, {
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
          // Disable terrain for speed — we want imagery tiles to load fast.
          // The route polyline will float at its stored elevation values.
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        });

        if (cancelled || viewer.isDestroyed()) return;

        const scene = viewer.scene;

        // Deep-space black background; atmosphere handles the limb gradient.
        scene.backgroundColor = Cesium.Color.BLACK;

        // ---------------------------------------------------------------- //
        // 2. No user interaction — this is a capture target.              //
        // ---------------------------------------------------------------- //
        scene.screenSpaceCameraController.enableInputs = false;

        // ---------------------------------------------------------------- //
        // 3. Resolution — no need for high-DPI in the share card.        //
        //    html-to-image will blit whatever CSS pixels are rendered.    //
        // ---------------------------------------------------------------- //
        viewer.resolutionScale = 1.0;

        // ---------------------------------------------------------------- //
        // 4. Bing Aerial base imagery.                                     //
        // ---------------------------------------------------------------- //
        scene.imageryLayers.removeAll();
        await setupBaseImagery(viewer);
        if (cancelled || viewer.isDestroyed()) return;

        // ---------------------------------------------------------------- //
        // 5. Atmosphere — subtle, brand-aligned.                          //
        // ---------------------------------------------------------------- //
        if (scene.skyAtmosphere) {
          scene.skyAtmosphere.show = true;
          scene.skyAtmosphere.hueShift = 0.0;
          scene.skyAtmosphere.saturationShift = 0.15;
          scene.skyAtmosphere.brightnessShift = 0.05;
          scene.skyAtmosphere.perFragmentAtmosphere = true;
        }

        // ---------------------------------------------------------------- //
        // 6. Stars (looks great at the framing altitude range).           //
        // ---------------------------------------------------------------- //
        if (scene.skyBox) {
          scene.skyBox.show = true;
        }

        // ---------------------------------------------------------------- //
        // 7. Lighting — sun at current time for realistic shadows.        //
        // ---------------------------------------------------------------- //
        viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
        viewer.clock.shouldAnimate = false; // static scene — don't tick
        scene.globe.enableLighting = true;

        // ---------------------------------------------------------------- //
        // 8. Route polyline — aqua glow, brand colour.                   //
        // ---------------------------------------------------------------- //
        const positions = route.points.map((p) =>
          Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.ele),
        );

        if (positions.length >= 2) {
          // Glow halo (wider, transparent)
          viewer.entities.add({
            polyline: {
              positions,
              width: 8,
              material: new Cesium.PolylineGlowMaterialProperty({
                color: Cesium.Color.fromCssColorString(BRAND_CYAN).withAlpha(0.35),
                glowPower: 0.4,
              }),
              clampToGround: false,
            },
          });

          // Core line (narrower, solid)
          viewer.entities.add({
            polyline: {
              positions,
              width: 3,
              material: new Cesium.PolylineGlowMaterialProperty({
                color: Cesium.Color.fromCssColorString(BRAND_CYAN).withAlpha(0.9),
                glowPower: 0.15,
              }),
              clampToGround: false,
            },
          });

          // Start marker — bright green dot
          viewer.entities.add({
            position: positions[0],
            point: {
              pixelSize: 14,
              color: Cesium.Color.fromCssColorString('#22c55e'), // green-500
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.NONE,
            },
          });

          // Finish marker — cyan square (checkered flag proxy)
          viewer.entities.add({
            position: positions[positions.length - 1],
            point: {
              pixelSize: 14,
              color: Cesium.Color.fromCssColorString(BRAND_CYAN),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.NONE,
            },
          });
        }

        // ---------------------------------------------------------------- //
        // 9. Camera — frame to route bounding box, NO animation.         //
        //    Auto-rotation is OFF — position must be stable for capture. //
        // ---------------------------------------------------------------- //
        fitCameraToRoute(viewer as unknown as CesiumViewer, route, Cesium, 1.35);

        // ---------------------------------------------------------------- //
        // 10. Wait for tiles to fully paint, then signal readiness.       //
        // ---------------------------------------------------------------- //
        await waitForCesiumReady(viewer as unknown as CesiumViewer, readyTimeoutMs, 3);

        if (cancelled || viewer.isDestroyed()) return;

        onReady();
      } catch (err) {
        if (!cancelled) {
          console.error('[ShareCardGlobe] init failed:', err);
          onError?.(err);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        // Prevent the Cesium widget.css overrides from leaking into the
        // card layout — the container is the hard boundary.
        overflow: 'hidden',
        borderRadius: 20,
        background: '#070d1a', // DARK_BG — visible while tiles load
      }}
      aria-hidden
    />
  );
}
