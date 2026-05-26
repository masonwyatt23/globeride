/**
 * RouteCardMiniGlobe — a Cesium mini-globe constrained to ~300×200 px that
 * shows the actual route polyline on photoreal Earth.
 *
 * Design constraints:
 *   - No chrome (no timeline, animation widget, geocoder, etc.)
 *   - No user interaction (enableInputs = false)
 *   - Camera framed to the route's bounding box + small padding
 *   - Slow auto-rotation at 0.2°/s around the route centre
 *   - Route polyline rendered as aqua PolylineGlow (#22d3ee — brand colour)
 *   - resolutionScale ≤ 0.75 on high-DPI displays to protect GPU budget
 *   - Bing Aerial base imagery via cesiumUtils.setupBaseImagery
 *   - Clean viewer.destroy() on unmount
 *
 * This component is lazy-loaded by RouteCardPreview — it is NEVER part of
 * the initial bundle unless the IntersectionObserver fires + gates pass.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import type { Route } from '@/types';
import { setIonToken, setupBaseImagery } from '@/lib/cesiumUtils';

/** Auto-rotation speed — 0.2°/s. Gentle so the user can read the route. */
const AUTO_ROTATE_DEG_PER_SEC = 0.2;

/** Brand aqua colour, consistent with HeroGlobe and the ride polyline. */
const ROUTE_COLOR = '#22d3ee';

interface Props {
  route: Route;
  ionToken: string;
}

export function RouteCardMiniGlobe({ route, ionToken }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Apply token before any Cesium API call.
    setIonToken(ionToken);

    // ------------------------------------------------------------------ //
    // 1. Viewer — no chrome, black background.                           //
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
    scene.backgroundColor = Cesium.Color.BLACK;

    // ------------------------------------------------------------------ //
    // 2. Disable all interaction — preview only.                         //
    // ------------------------------------------------------------------ //
    scene.screenSpaceCameraController.enableInputs = false;

    // ------------------------------------------------------------------ //
    // 3. Resolution scale — protect GPU on high-DPI.                     //
    // ------------------------------------------------------------------ //
    viewer.resolutionScale = window.devicePixelRatio > 2 ? 0.75 : 1.0;

    // ------------------------------------------------------------------ //
    // 4. Base imagery — Bing Aerial.                                      //
    // ------------------------------------------------------------------ //
    scene.imageryLayers.removeAll();
    setupBaseImagery(viewer).catch(() => undefined);

    // ------------------------------------------------------------------ //
    // 5. Route polyline — aqua glow.                                      //
    // ------------------------------------------------------------------ //
    const pts = route.points;
    const positions = pts.map((p) =>
      Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.ele),
    );

    let routeEntity: Cesium.Entity | null = null;
    if (positions.length >= 2) {
      routeEntity = viewer.entities.add({
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineGlowMaterialProperty({
            color: Cesium.Color.fromCssColorString(ROUTE_COLOR).withAlpha(0.9),
            glowPower: 0.3,
          }),
          clampToGround: false,
        },
      });
    }

    // ------------------------------------------------------------------ //
    // 6. Frame camera to fit the route's bounding box.                   //
    // ------------------------------------------------------------------ //
    if (positions.length >= 2) {
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      // Offset pitch: look slightly down so the route is visible on terrain.
      viewer.camera.viewBoundingSphere(
        sphere,
        new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-40),
          // Padding: zoom out a bit so the full route is in frame.
          sphere.radius * 3.0,
        ),
      );
    }

    // ------------------------------------------------------------------ //
    // 7. Auto-rotation around the route centre.                          //
    // ------------------------------------------------------------------ //
    let isRotating = true;
    let lastTickMs = performance.now();

    const onPreRender = () => {
      if (!isRotating) return;
      const nowMs = performance.now();
      const dt = (nowMs - lastTickMs) / 1000;
      lastTickMs = nowMs;
      const deltaRad = Cesium.Math.toRadians(AUTO_ROTATE_DEG_PER_SEC * dt);
      viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -deltaRad);
    };

    scene.preRender.addEventListener(onPreRender);

    // ------------------------------------------------------------------ //
    // 8. Pause rotation when element leaves viewport.                    //
    // ------------------------------------------------------------------ //
    const io = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 1;
        isRotating = ratio >= 0.05;
        if (isRotating) lastTickMs = performance.now();
      },
      { threshold: [0, 0.05, 1] },
    );
    io.observe(containerRef.current!);

    // ------------------------------------------------------------------ //
    // 9. ResizeObserver — keep canvas fitted if card resizes.            //
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
          if (routeEntity) viewer.entities.remove(routeEntity);
        } catch {
          // Entity may already be gone if scene is tearing down.
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
