'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const progressTrackVariants = cva(
  'relative w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800',
  {
    variants: {
      size: {
        sm: 'h-1.5',
        md: 'h-2.5',
        lg: 'h-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

const progressFillVariants = cva(
  'h-full rounded-full transition-all duration-500 ease-out',
  {
    variants: {
      color: {
        blue: 'bg-blue-600 dark:bg-blue-500',
        emerald: 'bg-emerald-500 dark:bg-emerald-400',
        amber: 'bg-amber-500 dark:bg-amber-400',
        red: 'bg-red-500 dark:bg-red-400',
        violet: 'bg-violet-600 dark:bg-violet-500',
      },
      animated: {
        true: 'bg-gradient-to-r from-current/80 via-current to-current/80 bg-[length:200%_100%] animate-shimmer',
        false: '',
      },
    },
    defaultVariants: {
      color: 'blue',
      animated: false,
    },
  }
)

export interface ProgressProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'>,
    VariantProps<typeof progressTrackVariants>,
    VariantProps<typeof progressFillVariants> {
  /** Value between 0 and 100 */
  value?: number
  /** Show percentage label */
  showLabel?: boolean
  /** Label position relative to the bar */
  labelPosition?: 'right' | 'top' | 'inside'
  /** Custom label text — defaults to "value%" */
  label?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value = 0,
      size,
      color,
      animated,
      showLabel = false,
      labelPosition = 'right',
      label,
      ...props
    },
    ref
  ) => {
    const clamped = Math.min(100, Math.max(0, value))
    const displayLabel = label ?? `${Math.round(clamped)}%`

    const bar = (
      <div
        className={cn(progressTrackVariants({ size }), className)}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        ref={ref}
        {...props}
      >
        <div
          className={cn(progressFillVariants({ color, animated }))}
          style={{ width: `${clamped}%` }}
        >
          {showLabel && labelPosition === 'inside' && clamped >= 15 && (
            <span className="absolute inset-0 flex items-center justify-center text-[0.625rem] font-semibold text-white">
              {displayLabel}
            </span>
          )}
        </div>
      </div>
    )

    if (!showLabel || labelPosition === 'inside') {
      return bar
    }

    if (labelPosition === 'top') {
      return (
        <div className="flex flex-col gap-1 w-full">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 dark:text-slate-400">{displayLabel}</span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
              {displayLabel}
            </span>
          </div>
          {bar}
        </div>
      )
    }

    // labelPosition === 'right'
    return (
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1">{bar}</div>
        <span className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums w-9 text-right">
          {displayLabel}
        </span>
      </div>
    )
  }
)
Progress.displayName = 'Progress'

// ------------------------------------------------------------------
// Segmented / stepped progress
// ------------------------------------------------------------------

export interface StepProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'> {
  steps: number
  currentStep: number
  color?: VariantProps<typeof progressFillVariants>['color']
}

const StepProgress = React.forwardRef<HTMLDivElement, StepProgressProps>(
  ({ className, steps, currentStep, color = 'blue', ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-1', className)}
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={0}
      aria-valuemax={steps}
      {...props}
    >
      {Array.from({ length: steps }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-all duration-300',
            i < currentStep
              ? progressFillVariants({ color })
              : 'bg-slate-200 dark:bg-slate-700'
          )}
        />
      ))}
    </div>
  )
)
StepProgress.displayName = 'StepProgress'

export { Progress, StepProgress }
