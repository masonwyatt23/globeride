/**
 * ProPelotonAvatars — Wave 34.C
 *
 * Mounts one animated cyclist avatar per active pro-peloton ghost into the
 * live Cesium viewer. Each avatar uses the same procedural Avatar API as pace
 * bots and ghost riders, but with the team's distinct colorway and a "PRO"
 * name label rendered via Cesium LabelCollection.
 *
 * This component is Cesium-only (it receives the viewer as a prop) and is
 * mounted inside CesiumViewer.tsx only when viewerReady is true.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useRideStore } from '@/stores/rideStore';
import { createAvatar, type Avatar } from '@/lib/avatar';
import { sampleRouteAtDistance, headingAt } from '@/lib/gpxParser';
import type { ProRiderState } from '@/lib/proCycling/proPelotonSimulator';

interface Props {
  viewer: Cesium.Viewer;
}

/**
 * PRO label above each ghost avatar — rendered via a Cesium LabelCollection
 * so they are always camera-facing (billboard behaviour) and depth-culled
 * properly against terrain.
 */
function createProLabel(
  labelCollection: Cesium.LabelCollection,
  riderState: ProRiderState,
): Cesium.Label {
  const short = riderState.rider.name.split(' ').pop() ?? riderState.rider.name;
  return labelCollection.add({
    // position is required by Cesium — will be updated per-frame in the handler.
    position: Cesium.Cartesian3.ZERO,
    text: `PRO #${riderState.rank} ${short}`,
    font: '12px sans-serif',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 2,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, -40),
    // Always draw above terrain so the label is never occluded by the hillside.
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    show: true,
  });
}

export function ProPelotonAvatars({ viewer }: Props) {
  const avatarsRef  = useRef<Avatar[]>([]);
  const labelsRef   = useRef<Cesium.Label[]>([]);
  const labelCollectionRef = useRef<Cesium.LabelCollection | null>(null);

  // Read the route + peloton state directly from store inside the preRender
  // handler to stay allocation-free. We subscribe to proPeloton just to
  // trigger avatar re-creation when the rider count changes.
  const proPeloton = useRideStore((s) => s.proPeloton);

  // ---- Create / recreate avatar pool whenever peloton changes ----
  useEffect(() => {
    if (viewer.isDestroyed()) return;

    // Dispose old avatars and labels.
    for (const a of avatarsRef.current) {
      if (!viewer.isDestroyed()) a.dispose();
    }
    avatarsRef.current = [];

    // Dispose old label collection.
    if (labelCollectionRef.current && !viewer.isDestroyed()) {
      try {
        viewer.scene.primitives.remove(labelCollectionRef.current);
        if (!labelCollectionRef.current.isDestroyed()) {
          labelCollectionRef.current.destroy();
        }
      } catch {
        // Scene may be torn down — ignore.
      }
    }
    labelCollectionRef.current = null;
    labelsRef.current = [];

    if (!proPeloton || proPeloton.riders.length === 0) return;

    // Build one avatar + one label per rider.
    const lc = new Cesium.LabelCollection();
    viewer.scene.primitives.add(lc);
    labelCollectionRef.current = lc;

    const newAvatars: Avatar[] = [];
    const newLabels: Cesium.Label[] = [];

    for (const riderState of proPeloton.riders) {
      const avatar = createAvatar(viewer);
      avatar.setColors(riderState.rider.colorways);
      newAvatars.push(avatar);

      const label = createProLabel(lc, riderState);
      newLabels.push(label);
    }

    avatarsRef.current = newAvatars;
    labelsRef.current  = newLabels;
  }, [viewer, proPeloton]);

  // ---- Per-frame: update avatar positions from rideStore ----
  useEffect(() => {
    if (viewer.isDestroyed()) return;

    const handler = () => {
      const state = useRideStore.getState();
      const peloton = state.proPeloton;
      const route   = state.route;

      if (!peloton || !route) return;

      const avatars = avatarsRef.current;
      const labels  = labelsRef.current;
      if (avatars.length !== peloton.riders.length) return; // stale — skip until re-sync

      for (let i = 0; i < peloton.riders.length; i++) {
        const riderState = peloton.riders[i];
        const finished   = riderState.distance >= route.totalDistance;

        if (finished) {
          // Hide finished riders — they're done.
          for (const ent of avatars[i].entities) ent.show = false;
          labels[i].show = false;
          continue;
        }

        const pos     = sampleRouteAtDistance(route, riderState.distance);
        const heading = headingAt(route, riderState.distance);

        // Show and update avatar.
        for (const ent of avatars[i].entities) ent.show = true;
        avatars[i].update({
          lon: pos.lon,
          lat: pos.lat,
          ele: pos.ele,
          heading,
          speed: riderState.speed,
          cadence: 0, // avatar estimates from speed
          grade: 0,
          dt: 1 / 60,
          riderPosition: 'drops', // pros ride drops on climbs
        });

        // Move label to match avatar position.
        labels[i].position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.ele + 3);
        labels[i].show = true;
      }
    };

    viewer.scene.preRender.addEventListener(handler);
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.preRender.removeEventListener(handler);
      }
    };
  }, [viewer]); // handler reads from refs — no deps on proPeloton needed here

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      for (const a of avatarsRef.current) {
        if (!viewer.isDestroyed()) a.dispose();
      }
      avatarsRef.current = [];
      if (labelCollectionRef.current && !viewer.isDestroyed()) {
        try {
          viewer.scene.primitives.remove(labelCollectionRef.current);
          if (!labelCollectionRef.current.isDestroyed()) {
            labelCollectionRef.current.destroy();
          }
        } catch {
          /* torn down */
        }
      }
      labelCollectionRef.current = null;
      labelsRef.current = [];
    };
  }, [viewer]);

  // This component renders nothing into the React tree — it's purely imperative
  // Cesium manipulation.
  return null;
}
