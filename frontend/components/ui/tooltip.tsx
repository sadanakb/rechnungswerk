'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------------
// Provider — wrap your app (or subtree) once
// ------------------------------------------------------------------

const TooltipProvider = TooltipPrimitive.Provider

// ------------------------------------------------------------------
// Composable primitives
// ------------------------------------------------------------------

const TooltipRoot = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger
const TooltipPortal = TooltipPrimitive.Portal

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 max-w-xs rounded-md px-3 py-1.5',
        'bg-slate-900 text-slate-50 text-xs leading-snug shadow-md',
        'dark:bg-slate-100 dark:text-slate-900',
        // Animations driven by Radix data attributes
        'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        'duration-150',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

// ------------------------------------------------------------------
// Tooltip — simple all-in-one helper
//
// Usage:
//   <Tooltip content="Hilfetext">
//     <Button>Hover mich</Button>
//   </Tooltip>
// ------------------------------------------------------------------

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  delayDuration?: number
  asChild?: boolean
  contentClassName?: string
  /** When true, the tooltip will not render */
  disabled?: boolean
}

const Tooltip = ({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 400,
  contentClassName,
  disabled = false,
}: TooltipProps) => {
  if (disabled) {
    return <>{children}</>
  }

  return (
    <TooltipRoot delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={contentClassName}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  )
}
Tooltip.displayName = 'Tooltip'

export {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  Tooltip,
}
