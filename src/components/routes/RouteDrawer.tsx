/**
 * RouteDrawer — "Draw a route on the 3D map" mode.
 *
 * The user left-clicks on the Cesium globe to add waypoints, right-clicks (or
 * clicks "Finish") to complete the route, and can undo the last point or clear
 * entirely. On finish it:
 *   1. Resamples + fetches real elevations.
 *   2. Builds a valid Route (same shape as gpxParser output).
 *   3. Persists it to the route library.
 *   4. Pushes it into the rideStore so the elevation profile + ride flow work
 *      immediately — no further action needed.
 *
 * Integrates via Cesium ScreenSpaceEventHandler attached/detached on
 * mount/unmount, so it never interferes with the existing globe interactions
 * (camera orbit, search fly-to, etc.) when draw mode is inactive.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { Loader2, MapPin, Pencil, Trash2, Undo2, Check, X, PenLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getActiveViewer } from '@/lib/cesiumUtils';
import { buildDrawnRoute, type DrawnPoint } from '@/lib/drawRoute';
import { saveRoute } from '@/lib/routeLibrary';
import { useRideStore } from '@/stores/rideStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DrawPhase = 'idle' | 'drawing' | 'building' | 'done';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A bright red dot marker for each clicked point on the globe. */
function addPointMarker(
  viewer: Cesium.Viewer,
  lon: number,
  lat: number,
  index: number,
): Cesium.Entity {
  return viewer.entities.add({
    name: `draw-point-${index}`,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: {
      pixelSize: index === 0 ? 16 : 10,
      color:
        index === 0
          ? Cesium.Color.fromCssColorString('#f59e0b')
          : Cesium.Color.fromCssColorString('#f43f5e'),
      outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

/** Convert a Cesium screen position to lon/lat, or null if off-globe. */
function screenToLonLat(
  viewer: Cesium.Viewer,
  position: Cesium.Cartesian2,
): { lon: number; lat: number } | null {
  const ray = viewer.camera.getPickRay(position);
  if (!ray) return null;
  const cart = viewer.scene.globe.pick(ray, viewer.scene);
  if (!cart) return null;
  const carto = Cesium.Cartographic.fromCartesian(cart);
  return {
    lon: Cesium.Math.toDegrees(carto.longitude),
    lat: Cesium.Math.toDegrees(carto.latitude),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RouteDrawerProps {
  /** Called after a drawn route is built and loaded — e.g. navigate to /ride. */
  onRouteReady?: () => void;
  /** Visual style: 'panel' (sidebar card) or 'overlay' (floating on globe). */
  variant?: 'panel' | 'overlay';
}

export function RouteDrawer({ onRouteReady, variant = 'overlay' }: RouteDrawerProps) {
  const setRoute = useRideStore((s) => s.setRoute);
  const bumpLibrary = useRideStore((s) => s.bumpLibrary);
  const drawModeActive = useRideStore((s) => s.drawModeActive);
  const setDrawModeActive = useRideStore((s) => s.setDrawModeActive);

  // Local state
  const [phase, setPhase] = useState<DrawPhase>('idle');
  const [points, setPoints] = useState<DrawnPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);

  // Cesium entity refs for cleanup
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const markerEntitiesRef = useRef<Cesium.Entity[]>([]);
  const previewPolylineRef = useRef<Cesium.Entity | null>(null);

  // Mutable ref so Cesium callbacks always read fresh points without stale closures
  const pointsRef = useRef<DrawnPoint[]>([]);
  pointsRef.current = points;

  // ---- Cesium entity cleanup helpers ----------------------------------------

  const clearMarkers = useCallback(() => {
    const viewer = getActiveViewer();
    if (!viewer) return;
    for (const e of markerEntitiesRef.current) viewer.entities.remove(e);
    markerEntitiesRef.current = [];
  }, []);

  const clearPreviewPolyline = useCallback(() => {
    const viewer = getActiveViewer();
    if (!viewer) return;
    if (previewPolylineRef.current) {
      viewer.entities.remove(previewPolylineRef.current);
      previewPolylineRef.current = null;
    }
  }, []);

  /** Rebuild the in-progress dashed polyline from the current point list. */
  const rebuildPolyline = useCallback((pts: DrawnPoint[]) => {
    const viewer = getActiveViewer();
    if (!viewer) return;

    clearPreviewPolyline();

    if (pts.length < 2) return;

    const positions = pts.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat));

    previewPolylineRef.current = viewer.entities.add({
      name: 'draw-preview-polyline',
      polyline: {
        positions,
        width: 4,
        clampToGround: true,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#f43f5e'),
          dashLength: 16,
          dashPattern: 0xff00,
        }),
      },
    });
  }, [clearPreviewPolyline]);

  // ---- Event handler lifecycle -----------------------------------------------

  const attachHandler = useCallback(() => {
    const viewer = getActiveViewer();
    if (!viewer) return;

    // Detach any lingering handler first.
    handlerRef.current?.destroy();

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    // Left-click: add point.
    handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const lonLat = screenToLonLat(viewer, e.position);
      if (!lonLat) return;

      const idx = pointsRef.current.length;
      const marker = addPointMarker(viewer, lonLat.lon, lonLat.lat, idx);
      markerEntitiesRef.current.push(marker);

      const next = [...pointsRef.current, { lon: lonLat.lon, lat: lonLat.lat }];
      setPoints(next);
      rebuildPolyline(next);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Right-click: finish drawing (same as clicking "Finish").
    handler.setInputAction(() => {
      if (pointsRef.current.length >= 2) {
        // Trigger finish via the synthetic click handler below.
        finishDrawingRef.current?.();
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }, [rebuildPolyline]);

  const detachHandler = useCallback(() => {
    handlerRef.current?.destroy();
    handlerRef.current = null;
  }, []);

  // Ref so the right-click Cesium callback can call finishDrawing without a stale closure.
  const finishDrawingRef = useRef<(() => void) | null>(null);

  // ---- Draw mode toggle -----------------------------------------------------

  const startDrawing = useCallback(() => {
    setPoints([]);
    setError(null);
    setProgress(null);
    setPhase('drawing');
    setDrawModeActive(true);
    attachHandler();
  }, [attachHandler, setDrawModeActive]);

  useEffect(() => {
    if (drawModeActive && phase === 'idle') {
      startDrawing();
    }
  }, [drawModeActive, phase, startDrawing]);

  useEffect(() => {
    if (phase !== 'drawing' || handlerRef.current) return;
    const retry = window.setInterval(() => {
      if (handlerRef.current) {
        window.clearInterval(retry);
        return;
      }
      attachHandler();
    }, 200);
    return () => window.clearInterval(retry);
  }, [attachHandler, phase]);

  const cancelDrawing = useCallback(() => {
    detachHandler();
    clearMarkers();
    clearPreviewPolyline();
    setPoints([]);
    setError(null);
    setProgress(null);
    setPhase('idle');
    setDrawModeActive(false);
  }, [detachHandler, clearMarkers, clearPreviewPolyline, setDrawModeActive]);

  const undoLastPoint = useCallback(() => {
    const viewer = getActiveViewer();
    if (!viewer || pointsRef.current.length === 0) return;

    // Remove last marker entity.
    const last = markerEntitiesRef.current.pop();
    if (last) viewer.entities.remove(last);

    const next = pointsRef.current.slice(0, -1);
    setPoints(next);
    rebuildPolyline(next);
  }, [rebuildPolyline]);

  const finishDrawing = useCallback(async () => {
    const pts = pointsRef.current;
    if (pts.length < 2) {
      setError('Add at least 2 points before finishing.');
      return;
    }

    detachHandler();
    setPhase('building');
    setError(null);

    try {
      const name = `Drawn route · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      const route = await buildDrawnRoute(pts, name, (fetched, total) => {
        setProgress({ fetched, total });
      });

      // Persist to library.
      await saveRoute(route, 'drawn');
      bumpLibrary();

      // Push to ride store — elevation profile + ride flow pick it up immediately.
      setRoute(route);

      clearMarkers();
      clearPreviewPolyline();
      setPhase('done');
      setDrawModeActive(false);
      onRouteReady?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build route');
      setPhase('drawing');
      // Re-attach handler so user can continue.
      attachHandler();
    } finally {
      setProgress(null);
    }
  }, [
    detachHandler,
    attachHandler,
    clearMarkers,
    clearPreviewPolyline,
    setRoute,
    bumpLibrary,
    setDrawModeActive,
    onRouteReady,
  ]);

  // Keep the ref in sync so the right-click Cesium callback can call it.
  finishDrawingRef.current = finishDrawing;

  // ---- Sync draw mode with external state changes (e.g. another panel cancels) ----
  useEffect(() => {
    if (!drawModeActive && phase === 'drawing') {
      cancelDrawing();
    }
  }, [drawModeActive, phase, cancelDrawing]);

  // ---- Cleanup on unmount ---------------------------------------------------
  useEffect(() => {
    return () => {
      detachHandler();
      clearMarkers();
      clearPreviewPolyline();
      setDrawModeActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Render ---------------------------------------------------------------

  const isOverlay = variant === 'overlay';

  if (phase === 'idle' || phase === 'done') {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn(
          'gap-2',
          isOverlay && 'glass glass-hairline border-transparent rounded-pill',
        )}
        onClick={startDrawing}
        title="Draw a custom route by clicking on the globe"
      >
        <PenLine className="h-4 w-4" />
        Draw route
      </Button>
    );
  }

  if (phase === 'building') {
    const pct =
      progress && progress.total > 0
        ? Math.round((progress.fetched / progress.total) * 100)
        : null;

    return (
      <div
        className={cn(
          'flex flex-col gap-2 rounded-2xl p-3 text-sm',
          isOverlay ? 'glass glass-hairline' : 'border border-border bg-card/60',
        )}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-[spinSlow_1.5s_linear_infinite] shrink-0" />
          <span>
            {pct !== null ? `Fetching elevation… ${pct}%` : 'Sampling elevation…'}
          </span>
        </div>
        <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: pct !== null ? `${pct}%` : '30%' }}
          />
        </div>
      </div>
    );
  }

  // phase === 'drawing'
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-2xl p-3 min-w-[220px]',
        isOverlay ? 'glass glass-hairline' : 'border border-border bg-card/60',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Pencil className="h-3.5 w-3.5 text-rose-400" />
          Drawing route
        </div>
        <button
          type="button"
          onClick={cancelDrawing}
          aria-label="Cancel drawing"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Point count */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 text-rose-400 shrink-0" />
        <span>
          {points.length === 0
            ? 'Click the globe to add waypoints'
            : `${points.length} point${points.length !== 1 ? 's' : ''} — right-click or Finish when done`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-2.5 py-1.5 text-xs text-destructive leading-snug">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={undoLastPoint}
          disabled={points.length === 0}
          title="Undo last point"
          className="flex-1"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={cancelDrawing}
          title="Clear and cancel"
          className="flex-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => void finishDrawing()}
          disabled={points.length < 2}
          title="Finish drawing and build the route"
          className="flex-1"
        >
          <Check className="h-3.5 w-3.5" />
          Finish
        </Button>
      </div>
    </div>
  );
}
