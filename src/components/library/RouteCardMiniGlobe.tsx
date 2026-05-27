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
 *
 * Mount-timing fix (Wave 43.D):
 *   Because this component is lazy-loaded behind an IntersectionObserver gate,
 *   useEffect can fire before the browser has performed a layout pass on the
 *   container div (clientWidth/Height === 0). Passing a zero-sized element to
 *   `new Cesium.Viewer()` produces a black 0×0 WebGL canvas that never
 *   recovers. We use waitForContainerSize() to defer Viewer construction until
 *   the container has positive layout dimensions.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import type { Route } from '@/types';
import { setIonToken, setupBaseImagery } from '@/lib/cesiumUtils';
import { waitForContainerSize } from '@/lib/landing/waitForContainerSize';

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

    let cancelled = false;
    let viewer: Cesium.Viewer | null = null;

    // Observers are allocated inside init() but must be accessible to cleanup.
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;
    let registeredPreRender: (() => void) | null = null;
    let capturedScene: Cesium.Scene | null = null;
    let capturedRouteEntity: Cesium.Entity | null = null;

    async function init() {
      const container = containerRef.current!;

      // Wait until the container has positive layout dimensions before
      // constructing the Cesium Viewer. This component is lazy-loaded behind
      // an IntersectionObserver gate, so useEffect can fire before the browser
      // has performed a layout pass, resulting in a 0×0 WebGL canvas.
      await waitForContainerSize(container);
      if (cancelled) return;

      // Apply token before any Cesium API call.
      setIonToken(ionToken);

      // ------------------------------------------------------------------ //
      // 1. Viewer — no chrome, black background.                           //
      // ------------------------------------------------------------------ //
      viewer = new Cesium.Viewer(container, {
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

      if (cancelled || viewer.isDestroyed()) return;

      const scene = viewer.scene;
      capturedScene = scene;
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
        capturedRouteEntity = routeEntity;
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
        if (!viewer || viewer.isDestroyed()) return;
        if (!isRotating) return;
        const nowMs = performance.now();
        const dt = (nowMs - lastTickMs) / 1000;
        lastTickMs = nowMs;
        const deltaRad = Cesium.Math.toRadians(AUTO_ROTATE_DEG_PER_SEC * dt);
        viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -deltaRad);
      };

      scene.preRender.addEventListener(onPreRender);
      registeredPreRender = onPreRender;

      // ------------------------------------------------------------------ //
      // 8. Pause rotation when element leaves viewport.                    //
      // ------------------------------------------------------------------ //
      io = new IntersectionObserver(
        (entries) => {
          const ratio = entries[0]?.intersectionRatio ?? 1;
          isRotating = ratio >= 0.05;
          if (isRotating) lastTickMs = performance.now();
        },
        { threshold: [0, 0.05, 1] },
      );
      io.observe(container);

      // ------------------------------------------------------------------ //
      // 9. ResizeObserver — keep canvas fitted if card resizes.            //
      // ------------------------------------------------------------------ //
      ro = new ResizeObserver(() => {
        if (viewer && !viewer.isDestroyed()) viewer.resize();
      });
      ro.observe(container);
    }

    void init();

    // ------------------------------------------------------------------ //
    // Cleanup — must handle the case where init() was cancelled mid-flight
    // (i.e. viewer may be null or partially initialised).                  //
    // ------------------------------------------------------------------ //
    return () => {
      cancelled = true;
      io?.disconnect();
      ro?.disconnect();

      if (viewer && !viewer.isDestroyed()) {
        if (capturedScene && registeredPreRender) {
          capturedScene.preRender.removeEventListener(registeredPreRender);
        }
        try {
          if (capturedRouteEntity) viewer.entities.remove(capturedRouteEntity);
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
