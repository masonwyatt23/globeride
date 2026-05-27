/**
 * RideAudioSettings — Settings section for the procedural ride audio engine.
 *
 * Renders inside SettingsPanel as an additional Section.
 * Controls:
 *   - Enable/disable toggle
 *   - Master volume slider (0-100)
 */

import { Volume2 } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { Section } from '@/components/ui/section-header';

export function RideAudioSettings() {
  const rideAudioEnabled = useSettingsStore((s) => s.rideAudioEnabled);
  const rideAudioVolume  = useSettingsStore((s) => s.rideAudioVolume);
  const setRideAudioEnabled = useSettingsStore((s) => s.setRideAudioEnabled);
  const setRideAudioVolume  = useSettingsStore((s) => s.setRideAudioVolume);

  return (
    <Section icon={<Volume2 className="h-4 w-4" />} title="Ride Sound Effects">
      <div className="space-y-4">
        {/* Enable toggle */}
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 cursor-pointer select-none">
          <div>
            <p className="text-xs font-medium text-foreground">Procedural ride audio</p>
            <p className="text-[11px] text-muted-foreground">
              Chain noise, road rumble, brake squeal, and gear-shift clicks synthesised
              in real-time from your ride telemetry. No audio files — all Web Audio.
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Enable procedural ride audio"
            checked={rideAudioEnabled}
            onChange={(e) => setRideAudioEnabled(e.target.checked)}
            className="h-4 w-4 accent-primary cursor-pointer shrink-0"
          />
        </label>

        {/* Volume slider */}
        <div className={rideAudioEnabled ? '' : 'opacity-50'}>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Volume</span>
            <span className="num text-foreground">{Math.round(rideAudioVolume)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={rideAudioVolume}
            disabled={!rideAudioEnabled}
            onChange={(e) => setRideAudioVolume(Number(e.target.value))}
            className="w-full accent-primary disabled:cursor-not-allowed"
            aria-label="Ride audio volume"
          />
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Audio reacts to cadence, speed, and braking in real-time.
          Chain noise and road rumble scale with effort; brake squeal activates on
          sharp deceleration; gear-shift clicks fire on cadence jumps.
          Requires the ride to be started from a user interaction (browser autoplay policy).
        </p>
      </div>
    </Section>
  );
}
