/**
 * CommentarySettings.tsx — Settings section for the live AI race commentator.
 *
 * Renders inside SettingsPanel as an additional Section. Controls:
 *   - Enable/disable toggle
 *   - Volume slider (0-100)
 *   - Rate (speed) slider (80-120 %)
 *   - Throttle slider (30-90 s between lines)
 *   - Test voice button
 */

import { Mic } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { speakLine, pickPreferredVoice } from '@/lib/speechSynthesis';
import { Section } from '@/components/ui/section-header';

export function CommentarySettings() {
  const {
    liveCommentaryEnabled,
    commentaryVolume,
    commentaryRate,
    commentaryThrottleSec,
    setCommentarySettings,
  } = useSettingsStore();

  function handleTestVoice() {
    speakLine('Welcome to GlobeRide.', {
      volume: commentaryVolume,
      rate: commentaryRate,
      voice: pickPreferredVoice(),
    });
  }

  return (
    <Section icon={<Mic className="h-4 w-4" />} title="Live Commentary">
      <div className="space-y-4">
        {/* Enable toggle */}
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 cursor-pointer select-none">
          <div>
            <p className="text-xs font-medium text-foreground">AI race commentary</p>
            <p className="text-[11px] text-muted-foreground">
              Spoken cycling-broadcast narration during your ride (uses text-to-speech)
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Enable live AI commentary"
            checked={liveCommentaryEnabled}
            onChange={(e) => setCommentarySettings({ liveCommentaryEnabled: e.target.checked })}
            className="h-4 w-4 accent-primary cursor-pointer shrink-0"
          />
        </label>

        {/* Volume slider */}
        <CommentarySlider
          label="Volume"
          min={0}
          max={100}
          step={5}
          value={commentaryVolume}
          suffix="%"
          disabled={!liveCommentaryEnabled}
          onChange={(v) => setCommentarySettings({ commentaryVolume: v })}
        />

        {/* Rate slider */}
        <CommentarySlider
          label="Speech rate"
          min={80}
          max={120}
          step={5}
          value={commentaryRate}
          suffix="%"
          disabled={!liveCommentaryEnabled}
          onChange={(v) => setCommentarySettings({ commentaryRate: v })}
        />

        {/* Throttle slider */}
        <CommentarySlider
          label="Minimum gap between lines"
          min={30}
          max={90}
          step={5}
          value={commentaryThrottleSec}
          suffix=" s"
          disabled={!liveCommentaryEnabled}
          onChange={(v) => setCommentarySettings({ commentaryThrottleSec: v })}
        />

        {/* Test voice button */}
        <button
          onClick={handleTestVoice}
          disabled={!liveCommentaryEnabled || commentaryVolume === 0}
          className="rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-foreground hover:bg-card/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Test commentary voice"
        >
          Test voice
        </button>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Commentary uses the browser&apos;s built-in text-to-speech engine — no audio is
          recorded or sent to any server. Significant moments (climbs, sprints, pace-bot
          battles) trigger LLM-generated lines via the xAI proxy.
        </p>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Internal slider component (matches SettingsPanel SliderRow pattern)
// ---------------------------------------------------------------------------

function CommentarySlider({
  label,
  min,
  max,
  step,
  value,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="num text-foreground">
          {Math.round(value)}{suffix ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary disabled:cursor-not-allowed"
        aria-label={label}
      />
    </div>
  );
}
