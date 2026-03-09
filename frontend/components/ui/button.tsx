'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium',
    'transition-all duration-150 ease-in-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-lime-500',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-lime-600 text-white shadow-sm',
          'hover:bg-lime-700 active:bg-lime-800',
          'dark:bg-lime-500 dark:hover:bg-lime-600',
        ],
        secondary: [
          'bg-stone-100 text-stone-900 shadow-sm',
          'hover:bg-stone-200 active:bg-stone-300',
          'dark:bg-stone-700 dark:text-stone-100 dark:hover:bg-stone-600',
        ],
        destructive: [
          'bg-red-600 text-white shadow-sm',
          'hover:bg-red-700 active:bg-red-800',
          'dark:bg-red-500 dark:hover:bg-red-600',
        ],
        outline: [
          'border border-stone-300 bg-transparent text-stone-900',
          'hover:bg-stone-100 active:bg-stone-200',
          'dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-800',
        ],
        ghost: [
          'bg-transparent text-stone-700',
          'hover:bg-stone-100 active:bg-stone-200',
          'dark:text-stone-300 dark:hover:bg-stone-800',
        ],
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-md',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
