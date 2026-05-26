/**
 * MultiRiderPeers — renders peer avatars on the Cesium globe.
 *
 * Subscribes to multiriderStore.peers. For each peer, creates a Cesium avatar
 * with a distinct colorway from BOT_COLORWAYS (starting at index 1 so index 0
 * is reserved for pace bot "The Diesel" and the user).
 *
 * Avatars are created/destroyed as peers enter and leave the session.
 * Position updates run in the Cesium preRender loop via a subscriber on the
 * shared viewerRef passed in from CesiumViewer.
 *
 * This component renders nothing into the DOM — all output is Cesium entities.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useMultiriderStore } from '@/stores/multiriderStore';
import { createAvatar, type Avatar } from '@/lib/avatar';
import { BOT_COLORWAYS } from '@/lib/paceBots';

interface Props {
  /** Live Cesium Viewer reference from CesiumViewer.tsx. */
  viewer: Cesium.Viewer;
}

/**
 * Colorway for a peer by index (0-indexed, offset by 1 from bot palette so
 * index 0 here maps to BOT_COLORWAYS[1] = "Niki" green).
 */
function peerColorway(peerIndex: number): (typeof BOT_COLORWAYS)[number] {
  // Offset by 1: BOT_COLORWAYS[0] is reserved for "The Diesel" (pace bot default).
  return BOT_COLORWAYS[(peerIndex + 1) % BOT_COLORWAYS.length];
}

export function MultiRiderPeers({ viewer }: Props) {
  // Map of peerId → Avatar instance.
  const avatarsRef = useRef<Map<string, Avatar>>(new Map());
  // Track the insertion order for stable colorway assignment.
  const peerOrderRef = useRef<string[]>([]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    let removeRenderHandler: (() => void) | null = null;
    // Capture refs for use in cleanup (React lint rule: ref.current may change).
    const capturedAvatars = avatarsRef.current;

    // ---- Per-frame update handler ----
    const renderHandler = () => {
      if (viewer.isDestroyed()) return;

      const { peers } = useMultiriderStore.getState();
      const peerIds = Object.keys(peers);

      // ---- Create avatars for new peers ----
      for (const peerId of peerIds) {
        if (!avatarsRef.current.has(peerId)) {
          if (!peerOrderRef.current.includes(peerId)) {
            peerOrderRef.current.push(peerId);
          }
          const index = peerOrderRef.current.indexOf(peerId);
          const avatar = createAvatar(viewer);
          avatar.setColors(peerColorway(index));
          avatarsRef.current.set(peerId, avatar);
        }
      }

      // ---- Dispose avatars for departed peers ----
      for (const [peerId, avatar] of avatarsRef.current.entries()) {
        if (!peers[peerId]) {
          if (!viewer.isDestroyed()) avatar.dispose();
          avatarsRef.current.delete(peerId);
          // Keep peerOrderRef so color assignments are stable if peer reconnects.
        }
      }

      // ---- Update avatar positions ----
      for (const peerId of peerIds) {
        const avatar = avatarsRef.current.get(peerId);
        if (!avatar) continue;

        const peer = peers[peerId];
        // Estimate dt from timestamp delta — avatars animate smoothly.
        const dt = Math.min(0.2, (Date.now() - peer.lastUpdateMs) / 1000);

        avatar.update({
          lat: peer.lat,
          lon: peer.lon,
          ele: 0,       // let avatar clamp to terrain via sampleGroundHeight
          heading: peer.heading,
          speed: peer.speed,
          cadence: peer.cadence,
          grade: 0,     // no grade info in peer frames — avatar uses heading
          dt,
        });
      }
    };

    viewer.scene.preRender.addEventListener(renderHandler);
    removeRenderHandler = () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.preRender.removeEventListener(renderHandler);
      }
    };

    return () => {
      removeRenderHandler?.();
      // Dispose all peer avatars.
      for (const avatar of capturedAvatars.values()) {
        if (!viewer.isDestroyed()) avatar.dispose();
      }
      capturedAvatars.clear();
      peerOrderRef.current = [];
    };
  }, [viewer]);

  // No DOM output — everything goes into Cesium.
  return null;
}
