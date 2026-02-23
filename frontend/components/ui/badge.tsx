import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5',
    'text-xs font-medium leading-none',
    'transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-blue-600 text-white',
          'dark:bg-blue-500',
        ],
        secondary: [
          'bg-slate-100 text-slate-700',
          'dark:bg-slate-800 dark:text-slate-300',
        ],
        destructive: [
          'bg-red-100 text-red-700',
          'dark:bg-red-900/40 dark:text-red-400',
        ],
        outline: [
          'border border-slate-300 text-slate-700 bg-transparent',
          'dark:border-slate-600 dark:text-slate-300',
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
