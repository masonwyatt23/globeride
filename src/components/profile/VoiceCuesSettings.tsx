/**
 * VoiceCuesSettings.tsx — Settings section for workout voice cues and climb
 * announcements. Rendered inside SettingsPanel.
 *
 * Controls:
 *   - Workout voice cues enable/disable toggle
 *   - Climb announcements enable/disable toggle
 */

import { Volume2 } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Section } from '@/components/ui/section-header';

export function VoiceCuesSettings() {
  const {
    workoutVoiceCuesEnabled,
    climbAnnouncementsEnabled,
    setSettings,
  } = useSettingsStore();

  return (
    <Section icon={<Volume2 className="h-4 w-4" />} title="Voice Cues">
      <div className="space-y-3">
        {/* Workout voice cues toggle */}
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 cursor-pointer select-none">
          <div>
            <p className="text-xs font-medium text-foreground">Workout voice cues</p>
            <p className="text-[11px] text-muted-foreground">
              Spoken announcements at segment transitions, halfway points, and 30-second warnings
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Enable workout voice cues"
            checked={workoutVoiceCuesEnabled}
            onChange={(e) => setSettings({ workoutVoiceCuesEnabled: e.target.checked })}
            className="h-4 w-4 accent-primary cursor-pointer shrink-0"
          />
        </label>

        {/* Climb announcements toggle */}
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 cursor-pointer select-none">
          <div>
            <p className="text-xs font-medium text-foreground">Climb announcements</p>
            <p className="text-[11px] text-muted-foreground">
              Spoken alert when a sustained climb is detected (4%+ grade, ≈3 seconds)
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Enable climb announcements"
            checked={climbAnnouncementsEnabled}
            onChange={(e) => setSettings({ climbAnnouncementsEnabled: e.target.checked })}
            className="h-4 w-4 accent-primary cursor-pointer shrink-0"
          />
        </label>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Voice cues use the browser&apos;s built-in text-to-speech engine. Volume and rate
          follow the Live Commentary settings above.
        </p>
      </div>
    </Section>
  );
}
