/**
 * useRaceResultCardAutoToast
 *
 * Watches `useRaceStore.localResults` (from Wave 21.A's raceStore.ts) for new
 * race results. When a fresh result is detected, surfaces a sticky toast with
 * a "Download result card" action that triggers the PNG download inline.
 *
 * Dependency on raceStore: imported dynamically at runtime so the rest of the
 * app builds cleanly even before Wave 21.A lands its files.
 *
 * Mount once at the app root (App.tsx) — alongside AchievementToast.
 */

import { useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import { useRideStore } from '@/stores/rideStore';
import { shortId, formatDuration } from '@/lib/utils';

// ─── Shared types (forward-compatible with raceProtocol.ts) ──────────────────

interface LocalResult {
  raceId: string;
  rider: { name: string; ftpW?: number; weightKg?: number };
  finishTimeMs: number;
  avgPowerW?: number;
  totalAscentM: number;
  distanceM?: number;
  recordedAt: number;
  rideHash: string;
  signature?: string;
}

interface RaceStoreState {
  localResults: LocalResult[];
  activeRace?: { id: string; name: string; organiser?: string } | null;
}

/** Runtime type-guard for the raceStore module shape. */
function isRaceStore(v: unknown): v is { getState: () => RaceStoreState } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).getState === 'function'
  );
}

// ─── Inline card download (no DOM mount required) ─────────────────────────────
//
// We dynamically import RaceResultCard + react-dom/client, render the component
// into an off-screen container, capture it via toPng, then tear down.

async function downloadResultCard(
  result: LocalResult,
  raceName: string,
  raceOrganiser?: string,
): Promise<void> {
  const [{ RaceResultCard }, { createRoot }, { createElement }] = await Promise.all([
    import('@/components/race/RaceResultCard'),
    import('react-dom/client'),
    import('react'),
  ]);

  const CARD_W = 1080;
  const CARD_H = 1350;

  const container = document.createElement('div');
  container.style.cssText = [
    `position:fixed`,
    `top:${-(CARD_H + 200)}px`,
    `left:${-(CARD_W + 200)}px`,
    `width:${CARD_W}px`,
    `height:${CARD_H}px`,
    `overflow:hidden`,
    `pointer-events:none`,
  ].join(';');
  document.body.appendChild(container);

  const root = createRoot(container);

  // Render the card and wait one rAF pair for React to flush.
  await new Promise<void>((resolve) => {
    root.render(
      createElement(RaceResultCard, {
        race: { id: result.raceId, name: raceName, organiser: raceOrganiser },
        result,
      }),
    );
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  // Locate the offscreen card element inside our container.
  const cardEl = container.querySelector<HTMLDivElement>('[aria-hidden="true"]');
  if (!cardEl) {
    root.unmount();
    document.body.removeChild(container);
    return;
  }

  try {
    const dataUrl = await toPng(cardEl, {
      width: CARD_W, height: CARD_H, pixelRatio: 1,
      fontEmbedCSS: '',
      filter: () => true,
    });

    const slug = raceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const date = new Date(result.recordedAt).toISOString().slice(0, 10);

    const link = document.createElement('a');
    link.download = `globeride-race-${slug}-${date}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('[useRaceResultCardAutoToast] toPng failed:', err);
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRaceResultCardAutoToast(): void {
  const pushToast = useRideStore((s) => s.pushToast);

  // Track hashes we've already surfaced to avoid duplicate toasts.
  const seenHashes = useRef<Set<string>>(new Set());

  useEffect(() => {
    let stopped = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    /** Check the store for any unseen results and push a toast for each. */
    function processResults(state: RaceStoreState) {
      for (const result of state.localResults) {
        if (seenHashes.current.has(result.rideHash)) continue;
        seenHashes.current.add(result.rideHash);

        const raceName  = state.activeRace?.name ?? 'Race';
        const organiser = state.activeRace?.organiser;
        const finishStr = formatDuration(result.finishTimeMs / 1000);

        pushToast({
          id: shortId(),
          kind: 'success',
          title: `Race finished! ${finishStr}`,
          message: `${raceName} complete — download your shareable result card.`,
          durationMs: null, // sticky
          action: {
            label: 'Download result card',
            onClick: () => {
              downloadResultCard(result, raceName, organiser).catch(
                (err) => console.error('[RaceResultCard] download error', err),
              );
            },
          },
        });
      }
    }

    // Attempt to connect to raceStore. If the file doesn't exist yet (before
    // Wave 21.A lands), the dynamic import rejects and we bail silently.
    // The cast via Function avoids a static-analysis TS error on unresolved modules.
    (Function('m', 'return import(m)')('@/stores/raceStore') as Promise<unknown>)
      .then((mod: unknown) => {
        if (stopped) return;

        const store = (mod as Record<string, unknown>)['useRaceStore'];
        if (!isRaceStore(store)) return;

        // Initial check
        processResults(store.getState());

        // Poll every 500 ms for new results (lightweight — just an integer compare)
        let lastCount = store.getState().localResults.length;
        intervalId = setInterval(() => {
          if (stopped) { clearInterval(intervalId); return; }
          const state = store.getState();
          if (state.localResults.length !== lastCount) {
            lastCount = state.localResults.length;
            processResults(state);
          }
        }, 500);
      })
      .catch(() => {
        // raceStore not yet present — no-op, app builds fine.
      });

    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  // pushToast is stable (Zustand), include it to satisfy exhaustive-deps.
  }, [pushToast]);
}
