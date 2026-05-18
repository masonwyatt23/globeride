import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { useRideStore } from '@/stores/rideStore';
import { useThemeStore } from '@/stores/themeStore';
import {
  applyFollowCam,
  createBikeAvatar,
  flyToPoint,
  flyToRoute,
  getTerrainProvider,
  headingBetween,
  routeToCartesians,
  setIonToken,
  setActiveViewer,
  type BikeAvatar,
} from '@/lib/cesiumUtils';
import { sampleRouteAtDistance } from '@/lib/gpxParser';

/**
 * The 3D world viewport: Cesium globe + terrain + OSM buildings + the route
 * polyline + a multi-part bike avatar that tracks the rider's current
 * distance and heading. The camera follows the avatar when riding, and frames
 * the entire route when idle so the user can preview before clicking Start.
 */
export function CesiumViewer({ ionToken }: { ionToken: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const routePolylineRef = useRef<Cesium.Entity | null>(null);
  const avatarRef = useRef<BikeAvatar | null>(null);
  const cartesianRouteRef = useRef<Cesium.Cartesian3[] | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const removeTickRef = useRef<(() => void) | null>(null);

  const route = useRideStore((s) => s.route);
  const flyToTarget = useRideStore((s) => s.flyToTarget);
  const searchPinRef = useRef<Cesium.Entity | null>(null);
  const theme = useThemeStore((s) => s.theme);

  // ---- Bootstrap viewer ----
  useEffect(() => {
    if (!containerRef.current) return;

    setIonToken(ionToken);

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
    viewerRef.current = viewer;
    setActiveViewer(viewer);

    viewer.scene.globe.depthTestAgainstTerrain = true;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.globe.enableLighting = true;

    // Cesium World Terrain (ion asset 1) — shared so the route generator
    // can sample elevations from the same provider.
    getTerrainProvider()
      .then((terrain) => {
        // StrictMode (or a fast unmount) may have destroyed this viewer
        // before the async terrain provider resolved.
        if (viewer.isDestroyed()) return;
        viewer.scene.terrainProvider = terrain;
      })
      .catch(() => undefined);

    Cesium.createOsmBuildingsAsync()
      .then((tileset) => {
        if (viewer.isDestroyed()) {
          tileset.destroy?.();
          return;
        }
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
      })
      .catch(() => undefined);

    // Cesium normally listens for window resize, but when the container is
    // collapsed/expanded by a layout change (sidebar open, breakpoint shift)
    // we have to nudge it explicitly so the canvas refits.
    const ro = new ResizeObserver(() => {
      viewer.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      removeTickRef.current?.();
      removeTickRef.current = null;
      if (tilesetRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(tilesetRef.current);
      }
      tilesetRef.current = null;
      setActiveViewer(null);
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Theme-driven scene background ----
  // Cesium clears with this color before the globe renders, so it shows
  // through during loading and at the poles where the atmosphere thins.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(
      theme === 'dark' ? '#0b1220' : '#dfe7f1',
    );
  }, [theme]);

  // ---- Rebuild route entities + avatar when route changes ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (routePolylineRef.current) {
      viewer.entities.remove(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (avatarRef.current) {
      for (const e of avatarRef.current.entities) viewer.entities.remove(e);
      avatarRef.current = null;
    }
    cartesianRouteRef.current = null;

    if (!route) return;

    const positions = routeToCartesians(route);
    cartesianRouteRef.current = positions;

    routePolylineRef.current = viewer.entities.add({
      name: route.name,
      polyline: {
        positions,
        width: 6,
        clampToGround: false,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Cesium.Color.fromCssColorString('#22d3ee'),
        }),
      },
    });

    const avatar = createBikeAvatar(viewer);
    avatarRef.current = avatar;

    const start = route.points[0];
    const next = route.points[Math.min(1, route.points.length - 1)];
    const initialHeading = headingBetween(start, next);
    avatar.update({ lat: start.lat, lon: start.lon, ele: start.ele }, initialHeading);

    flyToRoute(viewer, positions);
  }, [route]);

  // ---- React to route-search fly-to requests ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToTarget) return;

    if (searchPinRef.current) {
      viewer.entities.remove(searchPinRef.current);
      searchPinRef.current = null;
    }

    searchPinRef.current = viewer.entities.add({
      name: flyToTarget.label ?? 'Search target',
      position: Cesium.Cartesian3.fromDegrees(flyToTarget.lon, flyToTarget.lat),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: flyToTarget.label
        ? {
            text: flyToTarget.label,
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -16),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        : undefined,
    });

    flyToPoint(viewer, {
      lat: flyToTarget.lat,
      lon: flyToTarget.lon,
      boundingBox: flyToTarget.boundingBox,
    });
  }, [flyToTarget]);

  // Drop the pin once a real route loads — it's redundant alongside the polyline.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !route) return;
    if (searchPinRef.current) {
      viewer.entities.remove(searchPinRef.current);
      searchPinRef.current = null;
    }
  }, [route]);

  // ---- Per-frame follow-cam + avatar update ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handler = () => {
      const state = useRideStore.getState();
      const r = state.route;
      if (!r || !avatarRef.current) return;

      const sampled = sampleRouteAtDistance(r, state.distance);
      const ahead =
        (window as unknown as { __globerideAhead?: { lat: number; lon: number; ele: number } })
          .__globerideAhead ??
        sampleRouteAtDistance(r, Math.min(r.totalDistance, state.distance + 6));

      const heading = headingBetween(
        { lat: sampled.lat, lon: sampled.lon, ele: sampled.ele },
        { lat: ahead.lat, lon: ahead.lon, ele: ahead.ele },
      );
      avatarRef.current.update({ lat: sampled.lat, lon: sampled.lon, ele: sampled.ele }, heading);

      if (state.rideState === 'running' || state.rideState === 'paused') {
        applyFollowCam(
          viewer,
          { lat: sampled.lat, lon: sampled.lon, ele: sampled.ele },
          ahead,
          60,
          18,
          -12,
        );
      }
    };

    viewer.scene.preRender.addEventListener(handler);
    removeTickRef.current = () => {
      if (!viewer.isDestroyed()) viewer.scene.preRender.removeEventListener(handler);
    };
    return () => {
      // The bootstrap effect's cleanup may have already destroyed the viewer
      // (React StrictMode remount, or navigating away from the ride). Touching
      // viewer.scene after destroy throws — guard it.
      if (!viewer.isDestroyed()) viewer.scene.preRender.removeEventListener(handler);
      removeTickRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}
