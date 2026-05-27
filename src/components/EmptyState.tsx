/**
 * EmptyState — reusable empty-state card for GlobeRide panels.
 *
 * Renders a glass card with a centred icon, a friendly headline,
 * descriptive text, and up to three action buttons.  All props
 * except `title` are optional so the component degrades gracefully.
 *
 * A11y:
 *   - Outer wrapper has role="region" + aria-label matching the title.
 *   - Headline is an <h2> (callers inside card sections can override via
 *     headingLevel prop; defaults to h2 because it sits below a CardTitle h1).
 *   - Action buttons are real <button> elements with accessible labels.
 */

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  /** If true the button is rendered with the primary variant styling. */
  primary?: boolean;
  /** Icon to show before the label (pass a lucide element). */
  icon?: React.ReactNode;
}

export interface EmptyStateProps {
  /** Short headline — e.g. "Your route library is empty". */
  title: string;
  /** One or two sentence description clarifying the state or next step. */
  description?: string;
  /** Optional SVG / icon element rendered above the headline. */
  icon?: React.ReactNode;
  /** Up to 3 action buttons. */
  actions?: EmptyStateAction[];
  /** Overrides the heading element level (default: 2). */
  headingLevel?: 2 | 3;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  icon,
  actions = [],
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60',
        'bg-muted/20 px-5 py-8 text-center',
        className,
      )}
    >
      {/* Icon */}
      {icon && (
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-card/50 text-muted-foreground/60"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      {/* Text */}
      <div className="space-y-1.5 max-w-xs">
        <Heading className="text-sm font-semibold text-foreground leading-snug">
          {title}
        </Heading>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {/* Actions (max 3) */}
      {actions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {actions.slice(0, 3).map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold',
                'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                action.primary
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                  : 'border border-border/70 bg-card/60 text-foreground hover:border-primary/40 hover:bg-card/80',
              )}
            >
              {action.icon && (
                <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                  {action.icon}
                </span>
              )}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
