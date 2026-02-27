'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function EmailVerifizierenPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    api
      .post('/api/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">E-Mail Verifizierung</h1>
        </div>

        {status === 'loading' && (
          <div
            className="rounded-lg p-4 text-center"
            style={{
              backgroundColor: 'rgba(var(--primary), 0.1)',
              border: '1px solid rgba(var(--primary), 0.2)',
            }}
          >
            <p className="font-medium" style={{ color: 'rgb(var(--primary))' }}>
              E-Mail wird verifiziert...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4 text-center"
              style={{
                backgroundColor: 'rgba(var(--primary), 0.1)',
                border: '1px solid rgba(var(--primary), 0.2)',
              }}
            >
              <p className="font-medium" style={{ color: 'rgb(var(--primary))' }}>
                E-Mail erfolgreich verifiziert!
              </p>
              <p className="text-sm mt-1 opacity-70">
                Deine E-Mail-Adresse wurde erfolgreich bestaetigt.
              </p>
            </div>
            <p className="text-center text-sm opacity-60">
              <Link
                href="/dashboard"
                className="font-medium"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Zum Dashboard
              </Link>
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4 text-center"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.2)',
              }}
            >
              <p className="font-medium" style={{ color: 'rgb(220, 38, 38)' }}>
                Verifikationslink ungueltig oder abgelaufen
              </p>
              <p className="text-sm mt-1 opacity-70">
                Bitte fordere einen neuen Verifikationslink an.
              </p>
            </div>
            <p className="text-center text-sm opacity-60">
              <Link
                href="/login"
                className="font-medium"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Zurueck zur Anmeldung
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
