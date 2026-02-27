'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-lg rounded-xl border p-8 text-center"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Faded label */}
        <p
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: 'rgb(var(--destructive))' }}
        >
          Fehler
        </p>

        {/* Heading */}
        <h2
          className="mt-3 text-2xl font-bold tracking-tight"
          style={{ color: 'rgb(var(--card-foreground))' }}
        >
          Etwas ist schiefgelaufen
        </h2>

        {/* Error message */}
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {error.message || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'}
        </p>

        {/* Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
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
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--card-foreground))',
            }}
          >
            Zurueck zum Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
