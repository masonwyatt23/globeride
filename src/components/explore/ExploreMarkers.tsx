/**
 * ExploreMarkers — pulsing globe pins for every curated route.
 *
 * Mounts as a React component but all visual work happens imperatively in the
 * Cesium viewer (entity billboard + CallbackProperty pulse animation).
 * No React re-renders during animation — entirely driven by Cesium's clock.
 *
 * Integration note for Explore.tsx:
 *   Mount <ExploreMarkers /> anywhere in the JSX tree AFTER CesiumViewer has
 *   been rendered. It grabs the viewer via getActiveViewer() internally, with
 *   a polling fallback in case the viewer is still initialising.
 *   The component cleans up all entities on unmount — safe to remount.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Cesium from 'cesium';

import { getActiveViewer } from '@/lib/cesiumUtils';
import { ICONIC_ROUTES, type IconicRouteInfo } from '@/lib/iconicRoutes';
import { WORLD_TOUR_STAGES, type WorldTourStageInfo } from '@/lib/worldTourStages';
import { useRideStore } from '@/stores/rideStore';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarkerDef {
  route: Route;
  lat: number;
  lon: number;
  label: string;
  subLabel: string;
  category: 'iconic' | 'worldtour';
}

// ---------------------------------------------------------------------------
// Route → MarkerDef helpers
// ---------------------------------------------------------------------------

function fmtKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}

function fmtAscent(meters: number): string {
  return Math.round(meters).toLocaleString();
}

function iconicToMarker(info: IconicRouteInfo): MarkerDef {
  const pt = info.route.points[0];
  return {
    route: info.route,
    lat: pt.lat,
    lon: pt.lon,
    label: info.climbName,
    subLabel: `${fmtKm(info.route.totalDistance)} km · ${fmtAscent(info.route.ascent)} m`,
    category: 'iconic',
  };
}

function stageToMarker(stage: WorldTourStageInfo): MarkerDef {
  const pt = stage.route.points[0];
  const tourLabel =
    stage.info.grandTour === 'tour' ? 'Tour de France' :
    stage.info.grandTour === 'giro' ? 'Giro d’Italia' :
    'Vuelta a España';
  return {
    route: stage.route,
    lat: pt.lat,
    lon: pt.lon,
    label: `${tourLabel} — ${stage.info.year}`,
    subLabel: `${stage.info.name} · ${fmtKm(stage.route.totalDistance)} km`,
    category: 'worldtour',
  };
}

// ---------------------------------------------------------------------------
// Marker selection — max 25 total, prioritise World Tour then iconic
// ---------------------------------------------------------------------------

const MAX_MARKERS = 25;

function buildMarkerDefs(): MarkerDef[] {
  // All World Tour stages first
  const wt = WORLD_TOUR_STAGES.map(stageToMarker);

  // Iconic climbs sorted by ascent desc (most dramatic first), then region
  // diversity by only keeping the first entry per broad region prefix
  const seenRegion = new Set<string>();
  const iconic = ICONIC_ROUTES
    .slice()
    .sort((a, b) => b.route.ascent - a.route.ascent)
    .filter((r) => {
      const regionKey = r.region.split('—')[0].trim();
      if (seenRegion.has(regionKey)) return false;
      seenRegion.add(regionKey);
      return true;
    })
    .map(iconicToMarker);

  return [...wt, ...iconic].slice(0, MAX_MARKERS);
}

// ---------------------------------------------------------------------------
// Inline cyan circle SVG → data-URI for billboard
// ---------------------------------------------------------------------------

function makeCyanCircle(size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="rgba(0,255,255,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const BILLBOARD_IMAGE = makeCyanCircle(14);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExploreMarkers() {
  const navigate = useNavigate();
  const entityIdsRef = useRef<string[]>([]);
  const labelEntityRef = useRef<Cesium.Entity | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function setup() {
      const viewer = getActiveViewer();
      if (!viewer || viewer.isDestroyed()) {
        // Viewer not ready yet — retry shortly
        retryTimer = setTimeout(setup, 200);
        return;
      }
      if (!mounted) return;

      const markerDefs = buildMarkerDefs();
      const addedIds: string[] = [];

      // ---- Pulse animation via CallbackProperty ----
      const startTime = Date.now();
      function pulseScale(): number {
        const phase = ((Date.now() - startTime) % 1600) / 1600;
        // Smooth 0→1→0 bell curve
        return 1.0 + 0.55 * Math.sin(phase * Math.PI * 2) * 0.5 + 0.275;
      }

      // ---- Add one entity per marker ----
      for (const def of markerDefs) {
        const pos = Cesium.Cartesian3.fromDegrees(def.lon, def.lat);

        const entity = viewer.entities.add({
          position: pos,
          billboard: {
            image: BILLBOARD_IMAGE,
            scale: new Cesium.CallbackProperty(() => pulseScale(), false),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          // Store our marker metadata on the entity for pick lookup
          properties: {
            markerDef: def,
          },
        });
        addedIds.push(entity.id);
      }
      entityIdsRef.current = addedIds;

      // ---- Hover label entity (reused, repositioned) ----
      const labelEntity = viewer.entities.add({
        show: false,
        position: new Cesium.ConstantPositionProperty(
          Cesium.Cartesian3.fromDegrees(0, 0, 100_000)
        ),
        label: {
          text: '',
          font: '13px "Inter", sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('rgba(0,0,0,0.7)'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('rgba(0,0,0,0.55)'),
          backgroundPadding: new Cesium.Cartesian2(8, 5),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      labelEntityRef.current = labelEntity;

      // ---- Screen-space event handler ----
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
      handlerRef.current = handler;

      // MOUSE_MOVE → hover label
      handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
        if (viewer.isDestroyed()) return;
        const picked = viewer.scene.pick(movement.endPosition);
        if (Cesium.defined(picked) && Cesium.defined(picked.id)) {
          const entity: Cesium.Entity = picked.id as Cesium.Entity;
          const def: MarkerDef | undefined = entity.properties?.markerDef?.getValue(
            Cesium.JulianDate.now()
          ) as MarkerDef | undefined;
          if (def && labelEntity && !viewer.isDestroyed()) {
            const cartesian = viewer.scene.pickPosition(movement.endPosition);
            if (Cesium.defined(cartesian)) {
              (labelEntity.position as Cesium.ConstantPositionProperty).setValue(cartesian);
            }
            if (labelEntity.label) {
              labelEntity.label.text = new Cesium.ConstantProperty(
                `${def.label}\n${def.subLabel}`
              );
            }
            labelEntity.show = true;
            // Switch cursor
            (viewer.canvas as HTMLCanvasElement).style.cursor = 'pointer';
            return;
          }
        }
        // Nothing picked — hide label
        if (!viewer.isDestroyed() && labelEntity) labelEntity.show = false;
        (viewer.canvas as HTMLCanvasElement).style.cursor = '';
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      // LEFT_CLICK → load route + navigate
      handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        if (viewer.isDestroyed()) return;
        const picked = viewer.scene.pick(click.position);
        if (!Cesium.defined(picked) || !Cesium.defined(picked.id)) return;

        const entity: Cesium.Entity = picked.id as Cesium.Entity;
        const def: MarkerDef | undefined = entity.properties?.markerDef?.getValue(
          Cesium.JulianDate.now()
        ) as MarkerDef | undefined;
        if (!def) return;

        useRideStore.getState().setRoute(def.route);
        navigate('/ride');
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      // ---- Cleanup function ----
      cleanupRef.current = () => {
        if (!viewer.isDestroyed()) {
          for (const id of entityIdsRef.current) {
            const e = viewer.entities.getById(id);
            if (e) viewer.entities.remove(e);
          }
          if (labelEntityRef.current) {
            viewer.entities.remove(labelEntityRef.current);
          }
          (viewer.canvas as HTMLCanvasElement).style.cursor = '';
        }
        entityIdsRef.current = [];
        labelEntityRef.current = null;
        if (handlerRef.current && !handlerRef.current.isDestroyed()) {
          handlerRef.current.destroy();
          handlerRef.current = null;
        }
      };
    }

    setup();

    return () => {
      mounted = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [navigate]);

  // This component renders no DOM — all work is in the Cesium viewer.
  return null;
}
