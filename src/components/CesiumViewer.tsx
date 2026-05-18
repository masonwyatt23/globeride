import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { useRideStore } from '@/stores/rideStore';
import { applyFollowCam, flyToRoute, routeToCartesians, setIonToken } from '@/lib/cesiumUtils';
import { sampleRouteAtDistance } from '@/lib/gpxParser';

/**
 * The 3D world viewport: Cesium globe + terrain + OSM buildings + the route
 * polyline + a bike avatar that tracks the rider's current distance. The
 * camera follows the avatar when riding, and frames the entire route when
 * idle so the user can preview before clicking Start.
 */
export function CesiumViewer({ ionToken }: { ionToken: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const routePolylineRef = useRef<Cesium.Entity | null>(null);
  const bikeRef = useRef<Cesium.Entity | null>(null);
  const cartesianRouteRef = useRef<Cesium.Cartesian3[] | null>(null);
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const removeTickRef = useRef<(() => void) | null>(null);

  const route = useRideStore((s) => s.route);

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
      // Use the default Bing/EarthAtNight imagery from ion when we have a token.
    });
    viewerRef.current = viewer;

    viewer.scene.globe.depthTestAgainstTerrain = true;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0b1220');

    // Cesium World Terrain (ion asset 1).
    Cesium.createWorldTerrainAsync()
      .then((terrain) => {
        viewer.scene.terrainProvider = terrain;
      })
      .catch(() => {
        // Without a token, terrain will be flat ellipsoid — still usable.
      });

    // OSM Buildings (ion asset 96188).
    Cesium.createOsmBuildingsAsync()
      .then((tileset) => {
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
      })
      .catch(() => {
        // Fail silently — no buildings, but the rest of the scene works.
      });

    return () => {
      removeTickRef.current?.();
      removeTickRef.current = null;
      if (tilesetRef.current) {
        viewer.scene.primitives.remove(tilesetRef.current);
        tilesetRef.current = null;
      }
      viewer.destroy();
      viewerRef.current = null;
    };
    // ionToken intentionally not in deps — we only bootstrap once. Token
    // changes mid-session require a full reload (covered by the prompt UI).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Rebuild route entities when route changes ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (routePolylineRef.current) {
      viewer.entities.remove(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (bikeRef.current) {
      viewer.entities.remove(bikeRef.current);
      bikeRef.current = null;
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

    const start = route.points[0];
    bikeRef.current = viewer.entities.add({
      name: 'Rider',
      position: Cesium.Cartesian3.fromDegrees(start.lon, start.lat, start.ele + 2),
      point: {
        pixelSize: 16,
        color: Cesium.Color.fromCssColorString('#5eead4'),
        outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.NONE,
      },
      label: {
        text: '▲',
        font: 'bold 18px sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#0b1220'),
        outlineColor: Cesium.Color.fromCssColorString('#5eead4'),
        outlineWidth: 0,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        pixelOffset: new Cesium.Cartesian2(0, 0),
        showBackground: false,
        scale: 0.0,
      },
    });

    flyToRoute(viewer, positions);
  }, [route]);

  // ---- Per-frame follow-cam + avatar update ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handler = () => {
      const state = useRideStore.getState();
      const r = state.route;
      if (!r || !bikeRef.current) return;

      const sampled = sampleRouteAtDistance(r, state.distance);
      const ahead =
        (window as unknown as { __globerideAhead?: { lat: number; lon: number; ele: number } })
          .__globerideAhead ??
        sampleRouteAtDistance(r, Math.min(r.totalDistance, state.distance + 6));

      // Park the avatar slightly above terrain so it isn't z-fought.
      bikeRef.current.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.fromDegrees(sampled.lon, sampled.lat, sampled.ele + 2),
      );

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
    removeTickRef.current = () => viewer.scene.preRender.removeEventListener(handler);
    return () => {
      viewer.scene.preRender.removeEventListener(handler);
      removeTickRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
