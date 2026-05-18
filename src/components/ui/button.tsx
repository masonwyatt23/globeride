import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold tracking-[-0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] select-none',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:brightness-110 shadow-[0_4px_18px_-5px_hsl(var(--primary)/0.55)] hover:shadow-[0_6px_22px_-5px_hsl(var(--primary)/0.65)]',
        accent:
          'bg-accent text-accent-foreground hover:brightness-110 shadow-[0_4px_18px_-5px_hsl(var(--accent)/0.55)] hover:shadow-[0_6px_22px_-5px_hsl(var(--accent)/0.65)]',
        destructive:
          'bg-destructive text-destructive-foreground hover:brightness-110 shadow-[0_4px_14px_-5px_hsl(var(--destructive)/0.45)]',
        outline:
          'border border-border bg-card/70 text-foreground hover:bg-card hover:border-primary/45 hover:text-primary',
        ghost:
          'text-foreground hover:bg-muted/70 hover:text-foreground',
        link:
          'text-primary underline-offset-4 hover:underline p-0 h-auto font-medium',
      },
      size: {
        default: 'h-10 px-4 py-2 min-w-[2.5rem]',
        sm:      'h-8 rounded-md px-3 text-xs min-w-[2rem]',
        lg:      'h-12 rounded-lg px-6 text-[0.9375rem] min-w-[3rem]',
        icon:    'h-10 w-10 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
