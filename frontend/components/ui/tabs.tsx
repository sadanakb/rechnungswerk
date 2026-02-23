'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-start rounded-lg bg-slate-100 p-1 gap-0.5',
      'text-slate-500',
      'dark:bg-slate-800/60 dark:text-slate-400',
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5',
      'text-sm font-medium',
      'ring-offset-white transition-all duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      // Active state
      'data-[state=active]:bg-white data-[state=active]:text-slate-900',
      'data-[state=active]:shadow-sm',
      // Hover on inactive
      'data-[state=inactive]:hover:text-slate-700',
      // Dark mode
      'dark:ring-offset-slate-950',
      'dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-slate-50',
      'dark:data-[state=inactive]:hover:text-slate-200',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-3 ring-offset-white',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
      'dark:ring-offset-slate-950',
      // Subtle fade-in when tab becomes active
      'data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:duration-200',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

// ------------------------------------------------------------------
// Underline variant — for page-level navigation tabs
// ------------------------------------------------------------------

const TabsListUnderline = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-end border-b border-slate-200 dark:border-slate-700 gap-0',
      className
    )}
    {...props}
  />
))
TabsListUnderline.displayName = 'TabsListUnderline'

const TabsTriggerUnderline = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative inline-flex items-center justify-center whitespace-nowrap px-4 pb-2.5 pt-1',
      'text-sm font-medium text-slate-500 dark:text-slate-400',
      'border-b-2 border-transparent',
      'transition-all duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:border-blue-600 data-[state=active]:text-blue-600',
      'dark:data-[state=active]:border-blue-400 dark:data-[state=active]:text-blue-400',
      'hover:text-slate-700 dark:hover:text-slate-200',
      // Offset sits on top of the parent border-b
      '-mb-px',
      className
    )}
    {...props}
  />
))
TabsTriggerUnderline.displayName = 'TabsTriggerUnderline'

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsListUnderline,
  TabsTriggerUnderline,
}
