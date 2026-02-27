'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div className="text-center max-w-md">
        {/* Faded label */}
        <p
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: 'rgb(var(--destructive))' }}
        >
          Fehler
        </p>

        {/* Heading */}
        <h1
          className="mt-3 text-3xl font-bold tracking-tight"
          style={{ color: 'rgb(var(--foreground))' }}
        >
          Etwas ist schiefgelaufen
        </h1>

        {/* Error message */}
        <p
          className="mt-3 text-base leading-relaxed"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {error.message || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'}
        </p>

        {/* Retry button */}
        <div className="mt-8">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: 'rgb(var(--primary))',
              color: 'rgb(var(--primary-foreground))',
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    </div>
  )
}
