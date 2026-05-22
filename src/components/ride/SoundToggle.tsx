/**
 * SoundToggle — mute / unmute + volume control for the ride audio layer.
 *
 * Designed to sit alongside ThemeToggle in the Ride top-bar.
 * Styling mirrors ThemeToggle: `h-9 w-9` circular glass pill.
 *
 * On first enable the AudioContext is resumed (autoplay policy). The toggle
 * also exposes a small volume slider that appears on hover/focus.
 *
 * Integration: mount anywhere inside the Ride screen, e.g. next to
 * <ThemeToggle /> in the top-left control cluster in Ride.tsx:
 *
 *   import { SoundToggle } from '@/components/ride/SoundToggle';
 *   // …inside the JSX cluster:
 *   <ThemeToggle />
 *   <SoundToggle />
 */

import { useState, useRef, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useAudioStore } from '@/stores/audioStore';
import { cn } from '@/lib/utils';

export function SoundToggle({ className }: { className?: string }) {
  const enabled = useAudioStore((s) => s.enabled);
  const volume = useAudioStore((s) => s.volume);
  const toggleEnabled = useAudioStore((s) => s.toggleEnabled);
  const setVolume = useAudioStore((s) => s.setVolume);

  // Show the volume slider popover on hover/focus.
  const [showSlider, setShowSlider] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setShowSlider(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setShowSlider(false), 400);
  }, []);

  const handleToggle = useCallback(() => {
    toggleEnabled();
  }, [toggleEnabled]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    [setVolume],
  );

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {/* ── Main toggle button ── */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={enabled ? 'Mute ride audio' : 'Enable ride audio'}
        aria-pressed={enabled}
        title={enabled ? 'Mute audio' : 'Enable audio'}
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-full overflow-hidden',
          'border border-border bg-card/70 text-foreground',
          'transition-all duration-200 hover:bg-card hover:border-primary/40 hover:shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'active:scale-95',
          className,
        )}
      >
        {/* Sound-on icon */}
        <Volume2
          className={cn(
            'absolute h-4 w-4 transition-all duration-300 text-cyan-400',
            enabled
              ? 'scale-100 opacity-100'
              : 'scale-0 opacity-0',
          )}
        />
        {/* Muted icon */}
        <VolumeX
          className={cn(
            'absolute h-4 w-4 transition-all duration-300 text-muted-foreground',
            !enabled
              ? 'scale-100 opacity-100'
              : 'scale-0 opacity-0',
          )}
        />
      </button>

      {/* ── Volume slider popover ── */}
      <div
        aria-hidden={!showSlider}
        className={cn(
          'absolute left-full ml-2 flex items-center gap-2 px-3 py-1.5',
          'rounded-full border border-border bg-card/90 backdrop-blur-sm shadow-md',
          'transition-all duration-200 origin-left whitespace-nowrap',
          showSlider && enabled
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none',
        )}
      >
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground select-none">
          Vol
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={handleVolumeChange}
          aria-label="Ride audio volume"
          className={cn(
            'w-20 h-1.5 appearance-none rounded-full cursor-pointer',
            // Tailwind can't style range inputs well; use accent colour via CSS custom property
            '[&::-webkit-slider-runnable-track]:rounded-full',
            '[&::-webkit-slider-runnable-track]:bg-border',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:h-3.5',
            '[&::-webkit-slider-thumb]:w-3.5',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-cyan-400',
            '[&::-webkit-slider-thumb]:shadow-sm',
            '[&::-moz-range-track]:rounded-full',
            '[&::-moz-range-track]:bg-border',
            '[&::-moz-range-thumb]:h-3.5',
            '[&::-moz-range-thumb]:w-3.5',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:border-0',
            '[&::-moz-range-thumb]:bg-cyan-400',
          )}
        />
        <span className="text-[10px] text-muted-foreground num tabular-nums w-7 text-right select-none">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}
