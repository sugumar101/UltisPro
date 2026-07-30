import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * The `active:scale-[0.97]` press response plus an eased transition is what
 * makes buttons feel physical rather than static — it's a small detail that
 * carries a lot of the "smoothness" of the whole app. Shadows lift slightly
 * on hover for the same reason.
 */
const buttonVariants = cva(
  `inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded font-semibold
   transition-all duration-200 ease-smooth
   active:scale-[0.97]
   disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none`,
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-on-primary shadow-sm hover:bg-primary-hover hover:shadow-card active:bg-primary-pressed',
        secondary:
          'border border-outline-variant bg-surface-container-lowest text-on-surface shadow-xs hover:border-outline hover:bg-surface-container-low hover:shadow-sm',
        ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
        destructive: 'bg-error text-on-error shadow-sm hover:bg-on-error-container hover:shadow-card',
        success: 'bg-success text-on-success shadow-sm hover:bg-on-success-container hover:shadow-card',
      },
      size: {
        sm: 'h-8 px-3 text-label-sm',
        md: 'h-10 px-4 text-body-md',
        lg: 'h-12 rounded-md px-6 text-title-sm',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
