import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Renders as a circle — useful for avatars.
   */
  circle?: boolean
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, circle, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-slate-200 dark:bg-slate-800',
        circle ? 'rounded-full' : 'rounded-md',
        className
      )}
      {...props}
    />
  )
)
Skeleton.displayName = 'Skeleton'

// ------------------------------------------------------------------
// Convenience presets
// ------------------------------------------------------------------

/** A single line of skeleton text. */
const SkeletonText = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { lines?: number }
>(({ className, lines = 1, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-2', className)} {...props}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className={cn(
          'h-4',
          // Make the last line shorter for a natural paragraph look
          i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
        )}
      />
    ))}
  </div>
))
SkeletonText.displayName = 'SkeletonText'

/** A skeleton avatar. */
const SkeletonAvatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { size?: 'sm' | 'md' | 'lg' }
>(({ className, size = 'md', ...props }, ref) => {
  const sizeClass = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' }[size]
  return <Skeleton ref={ref} circle className={cn(sizeClass, className)} {...props} />
})
SkeletonAvatar.displayName = 'SkeletonAvatar'

/** A skeleton card — header + lines of text. */
const SkeletonCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3 mb-4">
        <SkeletonAvatar />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  )
)
SkeletonCard.displayName = 'SkeletonCard'

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonCard }
