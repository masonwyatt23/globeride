/**
 * CameraSwitcher
 *
 * Floating HUD button (bottom area of the top-right corner of the ride view)
 * that cycles through the 5 cinematic camera modes. Reads + writes
 * settingsStore.cameraMode.
 */

import { Camera } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CameraMode } from '@/lib/cesiumCameras';

const MODES: CameraMode[] = ['chase', 'firstPerson', 'overhead', 'sideTracking', 'cinematic'];

const MODE_LABELS: Record<CameraMode, string> = {
  chase:        'Chase',
  firstPerson:  '1st Person',
  overhead:     'Overhead',
  sideTracking: 'Side',
  cinematic:    'Cinematic',
};

/**
 * Small floating chip that shows the current camera mode and cycles to the
 * next mode on tap. Positioned in the top-right of the ride canvas — callers
 * overlay it via absolute positioning in Ride.tsx.
 */
export function CameraSwitcher() {
  const cameraMode = useSettingsStore((s) => s.cameraMode);
  const setCameraMode = useSettingsStore((s) => s.setCameraMode);

  function handleCycle() {
    const currentIdx = MODES.indexOf(cameraMode);
    const nextIdx = (currentIdx + 1) % MODES.length;
    setCameraMode(MODES[nextIdx]);
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="outline"
        size="icon"
        aria-label={`Camera mode: ${MODE_LABELS[cameraMode]}. Tap to switch.`}
        title={`Camera: ${MODE_LABELS[cameraMode]}`}
        onClick={handleCycle}
        className="rounded-full glass glass-hairline border-transparent h-8 w-8"
      >
        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Badge
        variant="muted"
        className="text-[10px] px-1.5 py-0.5 pointer-events-none select-none"
        aria-hidden="true"
      >
        {MODE_LABELS[cameraMode]}
      </Badge>
    </div>
  );
}
