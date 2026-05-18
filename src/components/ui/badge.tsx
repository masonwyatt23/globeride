import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-primary/12 text-primary',
        accent:      'border-transparent bg-accent/12 text-accent',
        muted:       'border-border/60 bg-muted/60 text-muted-foreground',
        outline:     'border-border text-foreground',
        destructive: 'border-transparent bg-destructive/12 text-destructive',
        success:     'border-transparent bg-emerald-500/14 text-emerald-700 dark:text-emerald-300',
        warning:     'border-transparent bg-amber-500/14 text-amber-700 dark:text-amber-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
