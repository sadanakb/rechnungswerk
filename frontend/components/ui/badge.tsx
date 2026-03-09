import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5',
    'text-xs font-medium leading-none',
    'transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-lime-500',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-lime-600 text-white',
          'dark:bg-lime-500',
        ],
        secondary: [
          'bg-stone-100 text-stone-700',
          'dark:bg-stone-800 dark:text-stone-300',
        ],
        destructive: [
          'bg-red-100 text-red-700',
          'dark:bg-red-900/40 dark:text-red-400',
        ],
        outline: [
          'border border-stone-300 text-stone-700 bg-transparent',
          'dark:border-stone-600 dark:text-stone-300',
        ],
        success: [
          'bg-emerald-100 text-emerald-700',
          'dark:bg-emerald-900/40 dark:text-emerald-400',
        ],
        warning: [
          'bg-amber-100 text-amber-700',
          'dark:bg-amber-900/40 dark:text-amber-400',
        ],
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
)
Badge.displayName = 'Badge'

export { Badge, badgeVariants }
