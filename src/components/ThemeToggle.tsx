import { Moon, Sun } from 'lucide-react';

import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

/**
 * Animated dark/light toggle. Two icons stacked with independent scale +
 * rotation transitions for a tactile feel. Preference persisted via theme store.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme  = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-full overflow-hidden',
        'border border-border bg-card/70 text-foreground',
        'transition-all duration-200 hover:bg-card hover:border-primary/40 hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:scale-95',
        className,
      )}
    >
      <Sun
        className={cn(
          'absolute h-4 w-4 transition-all duration-300',
          isDark
            ? 'scale-0 -rotate-90 opacity-0'
            : 'scale-100 rotate-0 opacity-100 text-amber-500',
        )}
      />
      <Moon
        className={cn(
          'absolute h-4 w-4 transition-all duration-300',
          isDark
            ? 'scale-100 rotate-0 opacity-100 text-sky-300'
            : 'scale-0 rotate-90 opacity-0',
        )}
      />
    </button>
  );
}
