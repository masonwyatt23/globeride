import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { sanitizeForLabel } from '@/lib/security/sanitize';

import { useRideStore } from '@/stores/rideStore';
import { useThemeStore } from '@/stores/themeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useGhostStore } from '@/stores/ghostStore';
import {
  applyFollowCam,
  applySceneMood,
  clampCartesiansToScene,
  flyToPoint,
  flyToRoute,
  getPhotorealTileset,
  getTerrainProvider,
  julianDateForMood,
  MOODS,
  moodForRoute,
  resetFollowCam,
  routeToCartesians,
  setIonToken,
  setActiveViewer,
  setupBaseImagery,
  type MoodId,
  type SceneMood,
} from '@/lib/cesiumUtils';
import { ICONIC_ROUTES } from '@/lib/iconicRoutes';
import { WORLD_TOUR_STAGES } from '@/lib/worldTourStages';
import {
  buildGradientPolylines,
  buildRouteMarkers,
  removeGradientPolylines,
  removeRouteMarkers,
  type GradientSegment,
  type RouteMarkers,
} from '@/lib/routeVisuals';
import { createAvatar, type Avatar } from '@/lib/avatar';
import { headingAt, sampleRouteAtDistance } from '@/lib/gpxParser';
import { applyGraphicsQuality } from '@/lib/graphicsQuality';
import { applyCinematicEffects, destroyCinematicEffects } from '@/lib/cinematicEffects';
import { loadGhosts, type GhostRide } from '@/lib/ghosts';
import type { AvatarColors } from '@/lib/avatarConfig';
import { BOT_COLORWAYS } from '@/lib/paceBots';
import {
  createWeatherSystem,
  type WeatherSystem,
  type WeatherKind,
} from '@/lib/weatherParticles';
import {
  configureSky,
  spawnCumulusClouds,
  updateCloudParallax,
  sunAzimuthAndAltitude,
  scaledCloudCount,
} from '@/lib/skyAndClouds';
import {
  createShadowEntity,
  updateShadowEntity,
  type ShadowHandle,
} from '@/lib/dynamicShadow';
import {
  shouldUseWetMaterial,
  createWetRoadMaterial,
  updateWetMaterialTime,
} from '@/lib/wetRoadMaterial';
import {
  spectatorZonesForRoute,
  generateSpectatorPositions,
  createSpectatorBillboards,
  updateSpectatorVisibility,
  buildSpectatorDistanceIndex,
  type SpectatorCollection,
} from '@/lib/spectatorSystem';
import { MultiRiderPeers } from '@/components/ride/MultiRiderPeers';
import { ProPelotonAvatars } from '@/components/ride/ProPelotonAvatars';
import { waitForContainerSize } from '@/lib/landing/waitForContainerSize';
import {
  computeCameraPose,
  easedCameraTransition,
  type CameraPose,
} from '@/lib/cesiumCameras';
import {
  createSegmentPortals,
  type SegmentPortalHandle,
} from '@/lib/strava/segmentPortals';
import { mapSegmentsToRoute } from '@/lib/segmentOverlay';
import {
  createRoadEntity,
  createRoadEdgeStripes,
  createKmMarkers,
  createClimbArches,
  type RoadEntityHandle,
  type EdgeStripesHandle,
  type KmMarkersHandle,
  type ClimbArchesHandle,
} from '@/lib/routeSurface';
import { tryEnableHDR } from '@/lib/cesiumHDR';

/** Altitude threshold below which Google Photorealistic 3D Tiles are shown. */
const PHOTOREAL_SHOW_ALTITUDE_M = 5_000;

/**
 * Disable photoreal on mobile (< 6 hardware cores) — the chase-cam altitude
 * keeps tiles in constant view, which can drop 40+ FPS on a phone GPU.
 */
const PHOTOREAL_MOBILE_DISABLED = (navigator.hardwareConcurrency ?? 8) < 6;

// Ghost avatar appearance — desaturated pale blue, semi-transparent feel.
// We pass real hex colors; the avatar entity materials carry opacity via
// Cesium.Color alpha (set in the ghost setup function below).
const GHOST_COLORS: AvatarColors = {
  frame: '#94a3b8',
  wheel: '#475569',
  kit: '#bae6fd',
  skin: '#cbd5e1',
  helmet: '#7dd3fc',
  accent: '#93c5fd',
};

// ---------------------------------------------------------------------------
// Heuristic: derive a WeatherKind from the mood-name string when the mood
// entry doesn't carry an explicit `weather` field. Maps known weather-
// associated names; everything else returns 'none'.
// ---------------------------------------------------------------------------
function weatherKindFromMoodName(moodName: string): WeatherKind {
  if (
    moodName === 'fjord-rain' ||
    moodName === 'alpine-storm' ||
    moodName === 'overcast-rain'
  ) return 'rain';

  if (
    moodName === 'alpine-snow' ||
    moodName === 'winter-ride'
  ) return 'snow';

  if (
    moodName === 'mediterranean-mist' ||
    moodName === 'coastal-fog' ||
    moodName === 'valley-fog'
  ) return 'fog';

  return 'none';
}

/**
 * Resolve the WeatherKind for a mood value. Supports both the string-based
 * SceneMood form and an object form where the mood entry carries an
 * optional `weather` field.
 */
function resolveWeatherKind(mood: unknown): WeatherKind {
  // Object form — explicit `weather` field wins over name heuristics.
  if (mood && typeof mood === 'object' && 'weather' in mood) {
    const w = (mood as { weather?: WeatherKind }).weather;
    return w ?? 'none';
  }
  // Current string form.
  if (typeof mood === 'string') return weatherKindFromMoodName(mood);
  return 'none';
}

// Camera transition duration in milliseconds.
const CAM_TRANSITION_MS = 1200;

/**
 * The 3D world viewport: Cesium globe + terrain + OSM buildings + the route
 * polyline + a multi-part bike avatar that tracks the rider's current
 * distance and heading. The camera follows the avatar when riding, and frames
 * the entire route when idle so the user can preview before clicking Start.
 */
export function CesiumViewer({
  ionToken,
  onViewerReady,
}: {
  ionToken: string | null;
  /**
   * called once the Cesium.Viewer is fully constructed.
   * Ride.tsx uses this to pass the viewer to EnterVRButton / VRHud.
   */
  onViewerReady?: (viewer: Cesium.Viewer) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  // The old single-colour polyline is replaced by gradient segments + markers.
  // Keep routePolylineRef so the searchPin effect can coexist unchanged.
  const routePolylineRef = useRef<Cesium.Entity | null>(null);
  const gradientSegmentsRef = useRef<GradientSegment[]>([]);
  const routeMarkersRef = useRef<RouteMarkers | null>(null);
  const avatarRef = useRef<Avatar | null>(null);
  const cartesianRouteRef = useRef<Cesium.Cartesian3[] | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  // Separate ref for OSM buildings so it never overwrites tilesetRef (which
  // applyGraphicsQuality uses to tune the photoreal tileset's SSE budget).
  const osmTilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const photorealPromiseRef = useRef<Promise<Cesium.Cesium3DTileset> | null>(null);
  const removeTickRef = useRef<(() => void) | null>(null);
  // Ghost rider refs — parallel arrays, one entry per active ghost.
  const ghostAvatarsRef = useRef<Avatar[]>([]);
  const ghostRidesRef = useRef<GhostRide[]>([]);
  // Pace bot avatar refs — one Avatar per active bot, parallel to rideStore.paceBots.
  const botAvatarsRef = useRef<Avatar[]>([]);
  // Weather particle system — recreated on route change and quality change.
  const weatherSystemRef = useRef<WeatherSystem | null>(null);
  // Cloud collection + shadow entity — created on route load.
  const cloudCollectionRef = useRef<Cesium.CloudCollection | null>(null);
  const shadowHandleRef = useRef<ShadowHandle | null>(null);
  const skyCleanupRef = useRef<(() => void) | null>(null);
  // Spectator crowds — rebuilt on route change; null when the route has no spectator zones.
  const spectatorCollectionRef = useRef<SpectatorCollection | null>(null);
  // Pre-computed along-route distance for each spectator (parallel array).
  const spectatorDistancesRef = useRef<number[]>([]);
  // Active wet-road material instance — null when the mood is not rain.
  const wetMaterialRef = useRef<import('cesium').Material | null>(null);
  // Live polyline entity for outdoor GPS mode.
  const livePolylineEntityRef = useRef<Cesium.Entity | null>(null);
  // Strava segment portal handles — rebuilt on route change, destroyed on cleanup.
  const segmentPortalHandleRef = useRef<SegmentPortalHandle | null>(null);
  // ---- Road surface ----
  const roadEntityRef = useRef<RoadEntityHandle | null>(null);
  const roadEdgeStripesRef = useRef<EdgeStripesHandle | null>(null);
  const kmMarkersRef = useRef<KmMarkersHandle | null>(null);
  const climbArchesRef = useRef<ClimbArchesHandle | null>(null);
  // Multi-rider peers: state to trigger re-render when viewer is ready.
  const [viewerReady, setViewerReady] = useState(false);

  // Camera transition state held across frames.
  const camTransitionRef = useRef<{
    fromPose: CameraPose;
    startMs: number;
  } | null>(null);
  const lastCamPoseRef = useRef<CameraPose | null>(null);
  // Track which mode was active last frame so we can detect mode changes.
  const lastCamModeRef = useRef<string>('chase');

  const route = useRideStore((s) => s.route);
  const rideMode = useRideStore((s) => s.rideMode);
  const livePolyline = useRideStore((s) => s.livePolyline);
  const flyToTarget = useRideStore((s) => s.flyToTarget);
  const loadedSegments = useRideStore((s) => s.loadedSegments);
  const searchPinRef = useRef<Cesium.Entity | null>(null);
  const theme = useThemeStore((s) => s.theme);
  const avatarColors = useSettingsStore((s) => s.avatar);
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const ghostsEnabled = useGhostStore((s) => s.ghostsEnabled);

  // ---- Bootstrap viewer ----
  useEffect(() => {
    if (!containerRef.current) return;

    // cancelled flag — set by cleanup if the component unmounts before the
    // async container-size wait resolves (e.g. rapid route navigation).
    let bootstrapCancelled = false;

    // ResizeObserver is hoisted to effect scope (outside the async IIFE) so
    // the synchronous cleanup `return` can always call ro.disconnect(), even
    // if the component unmounts before waitForContainerSize resolves.
    const ro = new ResizeObserver(() => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.resize();
      }
    });
    ro.observe(containerRef.current);

    void (async () => {
      const container = containerRef.current!;

      // Defensive mount-timing guard: wait until the container
      // has positive layout dimensions before constructing the Cesium Viewer.
      // The ride view is a full-page route so the race is rare in practice,
      // but React StrictMode double-invocation and fast navigation can trigger
      // a 0×0 canvas on the first mount pass. waitForContainerSize resolves
      // immediately when dimensions are already positive (the common path).
      await waitForContainerSize(container);
      if (bootstrapCancelled || !containerRef.current) return;

      setIonToken(ionToken);

      const viewer = new Cesium.Viewer(container, {
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
        // Mark the WebGL context as XR-compatible so that
        // navigator.xr.requestSession('immersive-vr' | 'immersive-ar') can use
        // this canvas. xrCompatible is a valid WebGL context attribute (WebXR
        // spec) but isn't typed in Cesium's WebGLOptions — cast to satisfy tsc.
        contextOptions: { webgl: { xrCompatible: true } as Cesium.WebGLOptions },
      });
      viewerRef.current = viewer;
      setActiveViewer(viewer);
      setViewerReady(true);
      // Notify the parent so EnterVRButton (and other consumers) can hold a
      // ref to the viewer for XR session entry.
      onViewerReady?.(viewer);

    // Add Bing Maps Aerial as the permanent globe base layer so terrain is
    // always visible — even in rural areas where Google Photorealistic Tiles
    // have no coverage.  This must come before the photoreal tileset is added
    // so imagery is rendered under it whenever tiles are absent.
    setupBaseImagery(viewer).catch(() => undefined);

    const scene = viewer.scene;
    scene.globe.depthTestAgainstTerrain = true;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    scene.globe.enableLighting = true;

    // Shadow entity is created once per viewer lifetime; position is updated
    // per-frame in the preRender handler.
    shadowHandleRef.current = createShadowEntity(viewer);

    // Apply the persisted graphics quality tier (AA, shadows, fog).
    // Fog is always enabled; density is controlled per-tier.
    scene.fog.enabled = true;
    const initialQuality = useSettingsStore.getState().graphicsQuality;
    applyGraphicsQuality(viewer, initialQuality);
    // Cinematic post-process stages (bloom, AO, vignette/grade) — created
    // once and enabled/disabled by quality tier. Must come after the viewer
    // is fully constructed so scene.postProcessStages is available.
    applyCinematicEffects(viewer, initialQuality);

    // Lower the render resolution slightly on /ride so the heavy
    // 3D-buildings + photoreal-tiles scene doesn't peg the GPU and
    // freeze the JS thread (which was preventing the Start-ride button
    // from registering taps in production).
    viewer.resolutionScale = 0.85;

    // Defer the expensive scene additions (HDR, terrain, OSM buildings,
    // photoreal tiles) until the browser is idle. Without this, the JS
    // thread is blocked during initial mount and React can't process
    // user input — including the Start-ride button click — for several
    // seconds.
    const scheduleIdle = (fn: () => void): void => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (typeof ric === 'function') {
        ric(fn, { timeout: 2000 });
      } else {
        setTimeout(fn, 0);
      }
    };

    scheduleIdle(() => {
      if (viewer.isDestroyed()) return;
      // HDR + ACES filmic tonemapping — richer colour on capable platforms.
      // Skip on 'low' quality tier (power-saver devices).
      if (initialQuality !== 'low') {
        tryEnableHDR(viewer);
      }

      // Cesium World Terrain (ion asset 1).
      getTerrainProvider()
        .then((terrain) => {
          if (viewer.isDestroyed()) return;
          viewer.scene.terrainProvider = terrain;
        })
        .catch(() => undefined);
    });

    // OSM buildings + Google Photoreal 3D Tiles are the heaviest single
    // contributors to first-frame jank. Hold them back further so the
    // ride view becomes interactive immediately, then layer them in.
    scheduleIdle(() => {
      if (viewer.isDestroyed()) return;
      const usePhotoreal = import.meta.env.VITE_PHOTOREAL_TILES !== 'false';

      Cesium.createOsmBuildingsAsync()
        .then((tileset) => {
          if (viewer.isDestroyed()) {
            tileset.destroy?.();
            return;
          }
          viewer.scene.primitives.add(tileset);
          osmTilesetRef.current = tileset;
        })
        .catch(() => undefined);

      if (usePhotoreal && !PHOTOREAL_MOBILE_DISABLED) {
        const photoreal = getPhotorealTileset();
        photorealPromiseRef.current = photoreal;
        photoreal
          .then((tileset) => {
            if (viewer.isDestroyed()) {
              tileset.destroy?.();
              return;
            }
            tileset.show = false;
            viewer.scene.primitives.add(tileset);
            tilesetRef.current = tileset;
          })
          .catch(() => {
            photorealPromiseRef.current = null;
          });
      }
    });

    })(); // end async bootstrap IIFE

    return () => {
      // Signal the async init to bail out if it hasn't constructed the viewer
      // yet (e.g. unmount before waitForContainerSize resolves).
      bootstrapCancelled = true;
      ro.disconnect();

      // All mutable state below is read from refs, not the async-IIFE-local
      // `viewer` const, so cleanup is safe regardless of init completion order.
      const viewer = viewerRef.current;

      removeTickRef.current?.();
      removeTickRef.current = null;
      // Dispose weather system before destroying the viewer.
      weatherSystemRef.current?.dispose();
      weatherSystemRef.current = null;
      skyCleanupRef.current?.();
      skyCleanupRef.current = null;
      shadowHandleRef.current?.destroy();
      shadowHandleRef.current = null;
      if (viewer && cloudCollectionRef.current && !viewer.isDestroyed()) {
        try { viewer.scene.primitives.remove(cloudCollectionRef.current); } catch { /* torn down */ }
      }
      cloudCollectionRef.current = null;
      // Dispose ghost avatars — viewer.entities.remove needs isDestroyed guard.
      for (const ga of ghostAvatarsRef.current) {
        if (viewer && !viewer.isDestroyed()) ga.dispose();
      }
      ghostAvatarsRef.current = [];
      ghostRidesRef.current = [];
      // Dispose pace bot avatars.
      for (const ba of botAvatarsRef.current) {
        if (viewer && !viewer.isDestroyed()) ba.dispose();
      }
      botAvatarsRef.current = [];
      // Explicitly destroy tileset GPU resources after removal.
      // Cesium's primitives.remove() does NOT free VRAM unless the scene was
      // constructed with destroyPrimitives:true (we don't set that flag).
      // Calling destroy() here is the only reliable way to prevent VRAM leaks
      // on rapid route changes and mobile OOM situations.
      if (tilesetRef.current && viewer && !viewer.isDestroyed()) {
        try {
          viewer.scene.primitives.remove(tilesetRef.current);
          if (!tilesetRef.current.isDestroyed()) tilesetRef.current.destroy();
        } catch {
          // Scene or tileset may already be in a torn-down state — ignore.
        }
      }
      tilesetRef.current = null;
      if (osmTilesetRef.current && viewer && !viewer.isDestroyed()) {
        try {
          viewer.scene.primitives.remove(osmTilesetRef.current);
          if (!osmTilesetRef.current.isDestroyed()) osmTilesetRef.current.destroy();
        } catch {
          // Scene or tileset may already be in a torn-down state — ignore.
        }
      }
      osmTilesetRef.current = null;
      // Tear down spectator collection.
      spectatorCollectionRef.current?.destroy();
      spectatorCollectionRef.current = null;
      spectatorDistancesRef.current = [];
      wetMaterialRef.current = null;
      segmentPortalHandleRef.current?.destroy();
      segmentPortalHandleRef.current = null;
      // ---- Road surface cleanup ----
      roadEntityRef.current?.destroy();
      roadEntityRef.current = null;
      roadEdgeStripesRef.current?.destroy();
      roadEdgeStripesRef.current = null;
      kmMarkersRef.current?.destroy();
      kmMarkersRef.current = null;
      climbArchesRef.current?.destroy();
      climbArchesRef.current = null;
      setActiveViewer(null);
      if (viewer && !viewer.isDestroyed()) destroyCinematicEffects(viewer);
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
      setViewerReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Theme-driven scene background ----
  // Cesium clears with this color before the globe renders, so it shows
  // through during loading and at the poles where the atmosphere thins.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(
      theme === 'dark' ? '#0b1220' : '#dfe7f1',
    );
  }, [theme]);

  // ---- Re-apply graphics quality when the user changes the tier ----
  // Also recreate the weather system at the new particle count budget.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    applyGraphicsQuality(viewer, graphicsQuality, tilesetRef.current);
    applyCinematicEffects(viewer, graphicsQuality);

    // Rebuild weather system at new quality budget when a route is loaded.
    const currentRoute = useRideStore.getState().route;
    if (currentRoute && weatherSystemRef.current) {
      const mood = moodForRoute(currentRoute);
      const weatherKind = resolveWeatherKind(mood);
      weatherSystemRef.current.dispose();
      weatherSystemRef.current = createWeatherSystem(viewer, weatherKind, graphicsQuality);
    }
  }, [graphicsQuality]);

  // ---- Live avatar recolouring from the Garage settings ----
  useEffect(() => {
    avatarRef.current?.setColors(avatarColors);
  }, [avatarColors]);

  // ---- Rebuild route entities + avatar when route changes ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Tear down previous route visuals.
    // Guard viewer.isDestroyed() — the viewer may have been destroyed between
    // the previous render and this effect re-running (e.g. fast route switching).
    if (routePolylineRef.current) {
      if (!viewer.isDestroyed()) viewer.entities.remove(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (gradientSegmentsRef.current.length > 0) {
      if (!viewer.isDestroyed()) removeGradientPolylines(viewer, gradientSegmentsRef.current);
      gradientSegmentsRef.current = [];
    }
    if (routeMarkersRef.current) {
      if (!viewer.isDestroyed()) removeRouteMarkers(viewer, routeMarkersRef.current);
      routeMarkersRef.current = null;
    }
    if (avatarRef.current) {
      avatarRef.current.dispose();
      avatarRef.current = null;
    }
    // Tear down ghost avatars from previous route.
    for (const g of ghostAvatarsRef.current) {
      if (!viewer.isDestroyed()) g.dispose();
    }
    ghostAvatarsRef.current = [];
    ghostRidesRef.current = [];
    useGhostStore.getState().setGhostCount(0);
    // Tear down pace bot avatars from previous route.
    for (const ba of botAvatarsRef.current) {
      if (!viewer.isDestroyed()) ba.dispose();
    }
    botAvatarsRef.current = [];
    cartesianRouteRef.current = null;
    resetFollowCam();

    // Reset camera transition state so new routes start cleanly.
    camTransitionRef.current = null;
    lastCamPoseRef.current = null;
    lastCamModeRef.current = useSettingsStore.getState().cameraMode;

    // Dispose the previous weather system before building a new one.
    weatherSystemRef.current?.dispose();
    weatherSystemRef.current = null;
    // Tear down previous clouds + sky animation.
    skyCleanupRef.current?.();
    skyCleanupRef.current = null;
    if (cloudCollectionRef.current && !viewer.isDestroyed()) {
      try { viewer.scene.primitives.remove(cloudCollectionRef.current); } catch { /* torn down */ }
      cloudCollectionRef.current = null;
    }

    spectatorCollectionRef.current?.destroy();
    spectatorCollectionRef.current = null;
    spectatorDistancesRef.current = [];
    wetMaterialRef.current = null;

    // Tear down previous segment portals.
    segmentPortalHandleRef.current?.destroy();
    segmentPortalHandleRef.current = null;

    // ---- Road surface — tear down previous surface ----
    roadEntityRef.current?.destroy();
    roadEntityRef.current = null;
    roadEdgeStripesRef.current?.destroy();
    roadEdgeStripesRef.current = null;
    kmMarkersRef.current?.destroy();
    kmMarkersRef.current = null;
    climbArchesRef.current?.destroy();
    climbArchesRef.current = null;

    if (!route) return;

    // Resolve the scene mood: prefer explicit mood from the route catalog,
    // fall back to the heuristic moodForRoute() based on distance + ascent.
    // Lookup order: IconicRoute catalog → WorldTourStage catalog → heuristic.
    let resolvedMood: SceneMood = moodForRoute(route);
    const iconicMatch = ICONIC_ROUTES.find((r) => r.route.id === route.id);
    if (iconicMatch?.mood) {
      resolvedMood = iconicMatch.mood as MoodId;
    } else {
      const wtsMatch = WORLD_TOUR_STAGES.find((s) => s.route.id === route.id);
      if (wtsMatch?.info.mood) resolvedMood = wtsMatch.info.mood as MoodId;
    }

    // Apply the mood: clock time drives sun angle; atmosphere params set the sky.
    const midLon = route.points[Math.floor(route.points.length / 2)].lon;
    const moodParams = MOODS[resolvedMood];
    viewer.clock.currentTime = julianDateForMood(midLon, moodParams.sunHourFromNoon);
    viewer.clock.shouldAnimate = false;
    applySceneMood(viewer, resolvedMood);

    // resolveWeatherKind handles both the current string SceneMood and the
    // extended object form that adds (weather?: WeatherKind field).
    const weatherKind = resolveWeatherKind(resolvedMood);
    const currentQuality = useSettingsStore.getState().graphicsQuality;
    weatherSystemRef.current = createWeatherSystem(viewer, weatherKind, currentQuality);

    // Apply sky config for this mood (clock, lighting, skyBox).
    const midLat = route.points[Math.floor(route.points.length / 2)].lat;
    const skyCleanup = configureSky(viewer, moodParams.sky, midLon);
    skyCleanupRef.current = skyCleanup;
    // Spawn clouds — quality-gated: low=0, medium=half, high=full count.
    const cloudCount = scaledCloudCount(moodParams.sky.cloudCount, currentQuality);
    cloudCollectionRef.current = spawnCumulusClouds(
      viewer,
      midLat,
      midLon,
      cloudCount,
      moodParams.sky.cloudAltitudeM,
    );

    const positions = routeToCartesians(route);
    cartesianRouteRef.current = positions;

    // Build gradient-coloured polyline segments.
    const segments = buildGradientPolylines(viewer, route, positions);
    gradientSegmentsRef.current = segments;

    // Build start / finish / km markers.
    routeMarkersRef.current = buildRouteMarkers(viewer, route, positions);

    // ---- Road surface ----
    // Build corridor + edge stripes + km markers + climb arches once per route.
    // The corridor replaces the thin polyline visually; gradient polylines remain
    // for the elevation-profile colour data but are now underlaid by the surface.
    roadEntityRef.current = createRoadEntity(viewer, route, positions, {
      gradientColored: true,
    });
    roadEdgeStripesRef.current = createRoadEdgeStripes(viewer, route);
    kmMarkersRef.current = createKmMarkers(viewer, route, positions);
    climbArchesRef.current = createClimbArches(viewer, route, positions);

    // When the active mood is rain, apply the wet-road material to the corridor.
    if (shouldUseWetMaterial(resolvedMood as string)) {
      const mat = createWetRoadMaterial();
      wetMaterialRef.current = mat;
      if (roadEntityRef.current?.entity.corridor) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (roadEntityRef.current.entity.corridor as any).material = mat;
      }
      // Also apply to gradient segments for the narrow colored lines underneath.
      for (const seg of gradientSegmentsRef.current) {
        if (seg.entity.polyline) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (seg.entity.polyline as any).material = mat;
        }
      }
    } else {
      wetMaterialRef.current = null;
    }

    // Only World Tour routes with spectatorClimbs defined get crowds.
    const spectZones = spectatorZonesForRoute(route);
    if (spectZones.length > 0 && !viewer.isDestroyed()) {
      const quality = useSettingsStore.getState().graphicsQuality;
      const spectPositions = generateSpectatorPositions(route, spectZones, quality);
      if (spectPositions.length > 0) {
        spectatorCollectionRef.current = createSpectatorBillboards(viewer, spectPositions);
        spectatorDistancesRef.current = buildSpectatorDistanceIndex(
          spectZones, spectPositions, route, quality,
        );
      }
    }

    // With photoreal tiles the GPX elevations don't match the rendered
    // surface — clamp all segment positions onto the real surface once
    // tiles have streamed in, then update each segment's position property.
    const pr = photorealPromiseRef.current;
    if (pr) {
      const capturedSegments = segments;
      pr
        .then(() => clampCartesiansToScene(viewer.scene, positions, 1.5))
        .then((clamped) => {
          if (viewer.isDestroyed()) return;
          // Re-slice clamped positions back into each segment.
          for (const seg of capturedSegments) {
            if (!viewer.entities.contains(seg.entity)) continue;
            const segPositions = clamped.slice(seg.startIdx, seg.endIdx + 1);
            if (seg.entity.polyline) {
              seg.entity.polyline.positions = new Cesium.ConstantProperty(segPositions);
            }
          }
        })
        .catch(() => undefined);
    }

    const avatar = createAvatar(viewer);
    avatar.setColors(useSettingsStore.getState().avatar);
    avatarRef.current = avatar;

    // ---- Pace bot avatars — one per bot in the current roster ----
    // Read synchronously; if the user adds bots after route load the preRender
    // handler will detect the count mismatch and skip (bots won't render until
    // the next route load or a manual rebuild — acceptable for the first ship).
    const initialBots = useRideStore.getState().paceBots;
    const newBotAvatars: Avatar[] = initialBots.map((bot, i) => {
      const ba = createAvatar(viewer);
      ba.setColors(BOT_COLORWAYS[i % BOT_COLORWAYS.length]);
      return ba;
    });
    botAvatarsRef.current = newBotAvatars;

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
      riderPosition: useSettingsStore.getState().riderPosition,
    });

    // Load ghost riders for this route asynchronously so it never blocks rendering.
    const capturedRoute = route;
    const capturedViewer = viewer;
    loadGhosts(route).then((ghosts) => {
      if (capturedViewer.isDestroyed()) return;
      // Route may have changed while the async load was in flight.
      if (useRideStore.getState().route !== capturedRoute) return;
      if (!useGhostStore.getState().ghostsEnabled || ghosts.length === 0) {
        useGhostStore.getState().setGhostCount(0);
        return;
      }
      const start = capturedRoute.points[0];
      const avatars: Avatar[] = ghosts.map(() => {
        const ga = createAvatar(capturedViewer);
        ga.setColors(GHOST_COLORS);
        // Place ghost at route start initially.
        ga.update({
          lon: start.lon,
          lat: start.lat,
          ele: start.ele,
          heading: headingAt(capturedRoute, 0),
          speed: 0,
          cadence: 0,
          grade: 0,
          dt: 0,
        });
        return ga;
      });
      ghostAvatarsRef.current = avatars;
      ghostRidesRef.current = ghosts;
      useGhostStore.getState().setGhostCount(ghosts.length);
    }).catch(() => {
      // Ghost loading failure is non-fatal — ride continues without ghosts.
    });

    flyToRoute(viewer, positions);
  }, [route]);

  // ---- React to route-search fly-to requests ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToTarget) return;

    if (searchPinRef.current) {
      if (!viewer.isDestroyed()) viewer.entities.remove(searchPinRef.current);
      searchPinRef.current = null;
    }

    searchPinRef.current = viewer.entities.add({
      name: sanitizeForLabel(flyToTarget.label ?? 'Search target'),
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
            text: sanitizeForLabel(flyToTarget.label),
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
      if (!viewer.isDestroyed()) viewer.entities.remove(searchPinRef.current);
      searchPinRef.current = null;
    }
  }, [route]);

  // ---- Show/hide ghost avatars when the toggle changes ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const ghosts = ghostAvatarsRef.current;
    for (const ga of ghosts) {
      for (const ent of ga.entities) {
        ent.show = ghostsEnabled;
      }
    }
  }, [ghostsEnabled]);

  // ---- Per-frame follow-cam + avatar update ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let lastFrameMs = performance.now();
    const handler = () => {
      const nowMs = performance.now();
      const dt = (nowMs - lastFrameMs) / 1000;
      lastFrameMs = nowMs;

      // --- Photoreal altitude gate — show only when camera is below 5 km ---
      if (tilesetRef.current && !tilesetRef.current.isDestroyed()) {
        const altM = viewer.camera.positionCartographic.height;
        tilesetRef.current.show = altM < PHOTOREAL_SHOW_ALTITUDE_M;
      }

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
        riderPosition: useSettingsStore.getState().riderPosition,
      });

      // ---- Camera: per-mode positioning + cross-mode transition ----
      // Engage the chase cam whenever a route is loaded, not just during the
      // running/paused window. Otherwise the viewer sits at the initial
      // flyToBoundingSphere result (often "Earth from space" framing) until
      // the user presses Start ride — which makes the ride view look broken.
      if (state.rideState !== 'idle' && state.rideState !== 'finished') {
        const currentMode = useSettingsStore.getState().cameraMode;
        const riderPose = {
          lat: sampled.lat,
          lon: sampled.lon,
          ele: sampled.ele,
          heading,
          cadence: state.cadence,
          speed: state.speed,
        };

        // Detect mode change — start a transition from the last known pose.
        if (currentMode !== lastCamModeRef.current) {
          if (lastCamPoseRef.current) {
            camTransitionRef.current = {
              fromPose: lastCamPoseRef.current,
              startMs: nowMs,
            };
          }
          lastCamModeRef.current = currentMode;
        }

        // Compute the live target pose for the current mode.
        const targetPose = computeCameraPose(currentMode, riderPose, nowMs);

        // Determine the effective pose (transitioning or live).
        let effectivePose: CameraPose;
        const transition = camTransitionRef.current;
        if (transition) {
          const elapsed = nowMs - transition.startMs;
          const t = Math.min(elapsed / CAM_TRANSITION_MS, 1);
          effectivePose = easedCameraTransition(transition.fromPose, targetPose, t);
          if (t >= 1) {
            camTransitionRef.current = null;
          }
        } else {
          effectivePose = targetPose;
        }

        // Store for next frame's transition start.
        lastCamPoseRef.current = effectivePose;

        if (currentMode === 'chase') {
          // Delegate to the legacy eased follow-cam so it retains its own
          // internal lerp state (keeps the chase cam silky smooth).
          applyFollowCam(
            viewer,
            { lat: sampled.lat, lon: sampled.lon, ele: sampled.ele },
            ahead,
            { backMeters: 45, upMeters: 9, pitchDeg: -7 },
            dt,
          );
        } else {
          // Convert ENU offset to world Cartesian3 and apply.
          const riderCartesian = Cesium.Cartesian3.fromDegrees(
            sampled.lon,
            sampled.lat,
            sampled.ele,
          );
          const enuFrame = Cesium.Transforms.eastNorthUpToFixedFrame(riderCartesian);
          const offsetLocal = new Cesium.Cartesian3(
            effectivePose.offsetENU.x,
            effectivePose.offsetENU.y,
            effectivePose.offsetENU.z,
          );
          const camPos = Cesium.Matrix4.multiplyByPoint(
            enuFrame,
            offsetLocal,
            new Cesium.Cartesian3(),
          );
          viewer.camera.setView({
            destination: camPos,
            orientation: {
              heading: effectivePose.heading,
              pitch: effectivePose.pitch,
              roll: effectivePose.roll,
            },
          });
        }
      }

      // Advance the wet-road streak animation.
      // performance.now() is monotonic; scaled to a slow drift in the shader.
      if (wetMaterialRef.current) {
        updateWetMaterialTime(wetMaterialRef.current, performance.now());
      }

      // Spectator crowds — fade based on rider proximity.
      if (
        spectatorCollectionRef.current &&
        spectatorDistancesRef.current.length > 0
      ) {
        updateSpectatorVisibility(
          spectatorCollectionRef.current,
          state.distance,
          spectatorDistancesRef.current,
          200,   // fade-in over 200 m
          1000,  // show within 1 km
        );
      }

      // ---- Weather particle system update ----
      // Reposition spawn volume above the rider each frame. Zero allocations.
      weatherSystemRef.current?.update({
        lat: sampled.lat,
        lon: sampled.lon,
        ele: sampled.ele,
        heading,
      });

      // Cloud parallax — drift clouds with a light 5 m/s westerly wind.
      // The constant wind values keep this zero-allocation: no objects created.
      if (cloudCollectionRef.current) {
        updateCloudParallax(cloudCollectionRef.current, 5, 270, dt * 1000);
      }
      // Dynamic ground shadow — sized and rotated by real sun angle.
      if (shadowHandleRef.current) {
        const sunPos = sunAzimuthAndAltitude(new Date(), sampled.lat, sampled.lon);
        updateShadowEntity(
          shadowHandleRef.current,
          { lat: sampled.lat, lon: sampled.lon, ele: sampled.ele },
          sunPos.azimuth,
          sunPos.altitude,
        );
      }

      // ---- Pace bot avatar updates ----
      const bots = useRideStore.getState().paceBots;
      const botAvatars = botAvatarsRef.current;
      // If bot count matches the avatar array, update each one.
      // Count mismatch can occur if bots are added after route load — we skip
      // silently rather than crash; the user would need to re-select the route.
      if (bots.length === botAvatars.length && bots.length > 0 && r) {
        for (let i = 0; i < bots.length; i++) {
          const bs = bots[i].state;
          botAvatars[i].update({
            lon: bs.lon,
            lat: bs.lat,
            ele: bs.ele,
            heading: bs.heading,
            speed: bs.speed,
            // cadence: 0 → avatar estimates from speed (cadence ≈ speed / 0.12 rev/s * 60 rpm)
            cadence: 0,
            grade: 0,
            dt,
            riderPosition: 'hoods', // bots always ride hoods position
          });
        }
      }

      // ---- Ghost avatar updates ----
      const ghostsOn = useGhostStore.getState().ghostsEnabled;
      const ghostAvatars = ghostAvatarsRef.current;
      const ghostRides = ghostRidesRef.current;
      if (ghostsOn && ghostAvatars.length > 0 && r) {
        // Ghost time is driven by the live rider's elapsed wall-clock seconds.
        const elapsedSec = state.elapsedMs / 1000;
        for (let i = 0; i < ghostAvatars.length; i++) {
          const ghostDist = ghostRides[i].distanceAt(elapsedSec);
          // null means ghost hasn't started yet — hide it.
          if (ghostDist === null) {
            for (const ent of ghostAvatars[i].entities) ent.show = false;
            continue;
          }
          const clampedDist = Math.max(0, Math.min(r.totalDistance, ghostDist));
          const gPos = sampleRouteAtDistance(r, clampedDist);
          const gHeading = headingAt(r, clampedDist);
          // Estimate a plausible speed from distance delta / dt for animation.
          const prevDist = ghostRides[i].distanceAt(Math.max(0, elapsedSec - dt));
          const ghostSpeed = prevDist !== null ? Math.abs(clampedDist - prevDist) / (dt || 1 / 60) : 0;
          for (const ent of ghostAvatars[i].entities) ent.show = true;
          ghostAvatars[i].update({
            lon: gPos.lon,
            lat: gPos.lat,
            ele: gPos.ele,
            heading: gHeading,
            speed: ghostSpeed,
            cadence: 0, // avatar estimates from speed
            grade: state.grade,
            dt,
            riderPosition: 'hoods',
          });
        }
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

  // ---- Strava segment portals — rebuild when loadedSegments changes ----
  // Triggered by the background fetch completing after route load.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed() || !route) return;

    // Tear down previous portals before building new ones.
    segmentPortalHandleRef.current?.destroy();
    segmentPortalHandleRef.current = null;

    if (loadedSegments.length === 0) return;

    // Map the Strava segments onto the route (already done in the store, but
    // we do a lightweight re-map here so the Cesium effect owns a clean copy).
    const routeSegments = mapSegmentsToRoute(
      loadedSegments.map((rs) => rs.segment),
      route,
    );
    if (routeSegments.length === 0) return;

    segmentPortalHandleRef.current = createSegmentPortals(viewer, routeSegments, route);
  }, [loadedSegments, route]);

  // ---- Outdoor GPS live polyline ----
  // Update the live track entity each time the GPS polyline array grows.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    if (rideMode !== 'outdoor') {
      // Remove stale live polyline entity when switching away from outdoor mode.
      if (livePolylineEntityRef.current) {
        viewer.entities.remove(livePolylineEntityRef.current);
        livePolylineEntityRef.current = null;
      }
      return;
    }
    if (livePolyline.length < 2) return;

    const positions = livePolyline.map((p) =>
      Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.ele),
    );

    if (!livePolylineEntityRef.current) {
      // Create entity on first GPS fix.
      livePolylineEntityRef.current = viewer.entities.add({
        name: 'outdoor-live-track',
        polyline: {
          positions: new Cesium.ConstantProperty(positions),
          width: 4,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Cesium.Color.fromCssColorString('#22c55e'),
          }),
          clampToGround: true,
        },
      });
    } else {
      // Update positions in-place.
      if (livePolylineEntityRef.current.polyline) {
        livePolylineEntityRef.current.polyline.positions = new Cesium.ConstantProperty(positions);
      }
    }
  }, [livePolyline, rideMode]);

  // ---- Outdoor camera: follow live GPS position ----
  // When in outdoor mode the avatar follow-cam reads positionNow from the
  // store (set by useRideLoop from the GPS sample), so the existing preRender
  // handler already drives the camera correctly via rideStore.distance.
  // No additional effect needed — the per-frame handler in the preRender
  // block uses rideStore.distance which useRideLoop advances from GPS speed.

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {/* Multi-rider peer avatars — rendered into the Cesium viewer once it is ready. */}
      {viewerReady && viewerRef.current && !viewerRef.current.isDestroyed() && (
        <MultiRiderPeers viewer={viewerRef.current} />
      )}
      {/* ---- Pro peloton ghosts ---- */}
      {viewerReady && viewerRef.current && !viewerRef.current.isDestroyed() && (
        <ProPelotonAvatars viewer={viewerRef.current} />
      )}
    </>
  );
}
