/**
 * ControlsSettings.tsx — Controls tab: handlebar gestures, voice control.
 */

import { Smartphone } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Section } from '@/components/ui/section-header';
import { ToggleRow } from './shared';

export function ControlsSettings() {
  const gestureControlsEnabled = useSettingsStore((s) => s.gestureControlsEnabled);
  const voiceControlEnabled    = useSettingsStore((s) => s.voiceControlEnabled);
  const setGestureControlsEnabled = useSettingsStore((s) => s.setGestureControlsEnabled);
  const setVoiceControlEnabled    = useSettingsStore((s) => s.setVoiceControlEnabled);

  return (
    <div className="space-y-6">
      <Section icon={<Smartphone className="h-4 w-4" />} title="Input Controls">
        <div className="space-y-3">
          <ToggleRow
            label="Handlebar gestures"
            description="Double-tap to pause · long-press for quick actions · 2-finger swipe for ERG power"
            checked={gestureControlsEnabled}
            ariaLabel="Enable handlebar gesture controls"
            onChange={setGestureControlsEnabled}
          />

          <ToggleRow
            label="Voice control"
            description='Hands-free commands: "pause", "resume", "lap", "switch camera", "end ride" and more. Chrome & Edge only.'
            checked={voiceControlEnabled}
            ariaLabel="Enable voice control during rides"
            onChange={setVoiceControlEnabled}
          />
        </div>
      </Section>
    </div>
  );
}
