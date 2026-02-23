'use client'

import * as React from 'react'
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
} from 'lucide-react'

// ------------------------------------------------------------------
// Toaster Provider — render once in your root layout
// ------------------------------------------------------------------

export interface ToasterProps {
  position?:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
  richColors?: boolean
  expand?: boolean
  duration?: number
}

export function Toaster({
  position = 'bottom-right',
  richColors = true,
  expand = false,
  duration = 4000,
}: ToasterProps) {
  return (
    <SonnerToaster
      position={position}
      richColors={richColors}
      expand={expand}
      duration={duration}
      toastOptions={{
        classNames: {
          toast: [
            'group flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg',
            'bg-white text-slate-900 border-slate-200',
            'dark:bg-slate-900 dark:text-slate-50 dark:border-slate-800',
            'text-sm font-medium',
          ].join(' '),
          title: 'font-semibold',
          description: 'text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5',
          actionButton:
            'bg-blue-600 text-white hover:bg-blue-700 rounded-md px-3 py-1 text-xs font-medium',
          cancelButton:
            'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 rounded-md px-3 py-1 text-xs font-medium',
          closeButton:
            'absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200',
        },
      }}
    />
  )
}

// ------------------------------------------------------------------
// useToast hook — typed convenience wrappers around sonner
// ------------------------------------------------------------------

export interface ToastOptions {
  description?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
  cancel?: {
    label: string
    onClick?: () => void
  }
  id?: string | number
  onDismiss?: (id: string | number) => void
  onAutoClose?: (id: string | number) => void
}

function buildOptions(opts?: ToastOptions) {
  if (!opts) return {}
  const { action, cancel, ...rest } = opts
  return {
    ...rest,
    action: action
      ? { label: action.label, onClick: action.onClick }
      : undefined,
    cancel: cancel
      ? { label: cancel.label, onClick: cancel.onClick ?? (() => {}) }
      : undefined,
  }
}

export function useToast() {
  const success = React.useCallback(
    (message: string, opts?: ToastOptions) =>
      sonnerToast.success(message, {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
        ...buildOptions(opts),
      }),
    []
  )

  const error = React.useCallback(
    (message: string, opts?: ToastOptions) =>
      sonnerToast.error(message, {
        icon: <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
        ...buildOptions(opts),
      }),
    []
  )

  const warning = React.useCallback(
    (message: string, opts?: ToastOptions) =>
      sonnerToast.warning(message, {
        icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
        ...buildOptions(opts),
      }),
    []
  )

  const info = React.useCallback(
    (message: string, opts?: ToastOptions) =>
      sonnerToast.info(message, {
        icon: <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
        ...buildOptions(opts),
      }),
    []
  )

  const loading = React.useCallback(
    (message: string, opts?: ToastOptions) =>
      sonnerToast.loading(message, {
        icon: <Loader2 className="h-4 w-4 text-slate-400 shrink-0 mt-0.5 animate-spin" />,
        ...buildOptions(opts),
      }),
    []
  )

  const promise = React.useCallback(
    <T,>(
      promiseFn: Promise<T>,
      messages: { loading: string; success: string; error: string }
    ) =>
      sonnerToast.promise(promiseFn, {
        loading: messages.loading,
        success: messages.success,
        error: messages.error,
      }),
    []
  )

  const dismiss = React.useCallback(
    (id?: string | number) => sonnerToast.dismiss(id),
    []
  )

  return { success, error, warning, info, loading, promise, dismiss }
}

// Re-export raw sonner toast for advanced usage
export { sonnerToast as toast }
