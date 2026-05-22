import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { useRideStore } from '@/stores/rideStore';
import { useThemeStore } from '@/stores/themeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  applyFollowCam,
  clampCartesiansToScene,
  flyToPoint,
  flyToRoute,
  getPhotorealTileset,
  getTerrainProvider,
  resetFollowCam,
  routeToCartesians,
  setIonToken,
  setActiveViewer,
} from '@/lib/cesiumUtils';
import { createAvatar, type Avatar } from '@/lib/avatar';
import { headingAt, sampleRouteAtDistance } from '@/lib/gpxParser';

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
  const avatarRef = useRef<Avatar | null>(null);
  const cartesianRouteRef = useRef<Cesium.Cartesian3[] | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const photorealPromiseRef = useRef<Promise<Cesium.Cesium3DTileset> | null>(null);
  const removeTickRef = useRef<(() => void) | null>(null);

  const route = useRideStore((s) => s.route);
  const flyToTarget = useRideStore((s) => s.flyToTarget);
  const searchPinRef = useRef<Cesium.Entity | null>(null);
  const theme = useThemeStore((s) => s.theme);
  const avatarColors = useSettingsStore((s) => s.avatar);

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

    const scene = viewer.scene;
    scene.globe.depthTestAgainstTerrain = true;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    scene.globe.enableLighting = true;

    // Anti-aliasing — FXAA always, MSAA on top when the GPU supports it.
    scene.postProcessStages.fxaa.enabled = true;
    if (scene.msaaSupported) scene.msaaSamples = 4;

    // Shadows: the rider avatar casts a real shadow onto terrain/buildings.
    viewer.shadows = true;
    scene.shadowMap.enabled = true;
    scene.shadowMap.softShadows = true;
    scene.shadowMap.size = 2048;
    scene.shadowMap.maximumDistance = 2500;

    // Lighter fog so distant terrain reads as depth rather than a grey wall.
    scene.fog.enabled = true;
    scene.fog.density = 0.00012;

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

    // World detail: Google Photorealistic 3D Tiles when available (real
    // buildings, trees, terrain) — otherwise OSM buildings on the globe.
    const usePhotoreal = import.meta.env.VITE_PHOTOREAL_TILES !== 'false';
    const addOsmBuildings = () => {
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
    };

    if (usePhotoreal) {
      const photoreal = getPhotorealTileset();
      photorealPromiseRef.current = photoreal;
      photoreal
        .then((tileset) => {
          if (viewer.isDestroyed()) {
            tileset.destroy?.();
            return;
          }
          viewer.scene.primitives.add(tileset);
          // The photoreal mesh IS the world surface — hide the globe so the
          // World-Terrain ellipsoid can't z-fight or poke through it.
          viewer.scene.globe.show = false;
          tilesetRef.current = tileset;
        })
        .catch(() => {
          // No ion access to the Google asset (or it errored) — fall back.
          photorealPromiseRef.current = null;
          if (!viewer.isDestroyed()) {
            viewer.scene.globe.show = true;
            addOsmBuildings();
          }
        });
    } else {
      addOsmBuildings();
    }

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

  // ---- Live avatar recolouring from the Garage settings ----
  useEffect(() => {
    avatarRef.current?.setColors(avatarColors);
  }, [avatarColors]);

  // ---- Rebuild route entities + avatar when route changes ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (routePolylineRef.current) {
      viewer.entities.remove(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (avatarRef.current) {
      avatarRef.current.dispose();
      avatarRef.current = null;
    }
    cartesianRouteRef.current = null;
    resetFollowCam();

    if (!route) return;

    // Pin the sun to mid-afternoon local time at the route's longitude so
    // lighting stays flattering and shadows long, wherever the ride is.
    {
      const midLon = route.points[Math.floor(route.points.length / 2)].lon;
      const utcBase = Cesium.JulianDate.fromIso8601(
        `${new Date().toISOString().slice(0, 10)}T00:00:00Z`,
      );
      viewer.clock.currentTime = Cesium.JulianDate.addHours(
        utcBase,
        16 - midLon / 15,
        new Cesium.JulianDate(),
      );
      viewer.clock.shouldAnimate = false;
    }

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

    // With photoreal tiles the GPX elevations don't match the rendered
    // surface — clamp the route polyline onto it once its tiles stream in.
    const pr = photorealPromiseRef.current;
    if (pr) {
      const builtPoly = routePolylineRef.current;
      pr
        .then(() => clampCartesiansToScene(viewer.scene, positions, 1.5))
        .then((clamped) => {
          if (viewer.isDestroyed() || routePolylineRef.current !== builtPoly) return;
          if (builtPoly.polyline) {
            builtPoly.polyline.positions = new Cesium.ConstantProperty(clamped);
          }
        })
        .catch(() => undefined);
    }

    const avatar = createAvatar(viewer);
    avatar.setColors(useSettingsStore.getState().avatar);
    avatarRef.current = avatar;

    const start = route.points[0];
    avatar.update({
      lon: start.lon,
      lat: start.lat,
      ele: start.ele,
      heading: headingAt(route, 0),
      speed: 0,
      cadence: 0,
      grade: 0,
      dt: 0,
    });

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

    let lastFrameMs = performance.now();
    const handler = () => {
      const nowMs = performance.now();
      const dt = (nowMs - lastFrameMs) / 1000;
      lastFrameMs = nowMs;

      const state = useRideStore.getState();
      const r = state.route;
      if (!r || !avatarRef.current) return;

      const sampled = sampleRouteAtDistance(r, state.distance);
      const ahead = sampleRouteAtDistance(
        r,
        Math.min(r.totalDistance, state.distance + 15),
      );
      const heading = headingAt(r, state.distance);

      avatarRef.current.update({
        lon: sampled.lon,
        lat: sampled.lat,
        ele: sampled.ele,
        heading,
        speed: state.speed,
        cadence: state.cadence,
        grade: state.grade,
        dt,
      });

      if (state.rideState === 'running' || state.rideState === 'paused') {
        applyFollowCam(
          viewer,
          { lat: sampled.lat, lon: sampled.lon, ele: sampled.ele },
          ahead,
          { backMeters: 45, upMeters: 9, pitchDeg: -7 },
          dt,
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
