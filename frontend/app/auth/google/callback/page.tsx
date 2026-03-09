'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function GoogleCallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')

    if (accessToken && refreshToken) {
      localStorage.setItem('rw-access-token', accessToken)
      localStorage.setItem('rw-refresh-token', refreshToken)
      router.replace('/dashboard')
    } else {
      setError('Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.')
    }
  }, [searchParams, router])

  if (error) {
    return (
      <div className="auth-page">
        <div className="auth-card text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <a href="/login" className="text-sm font-medium" style={{ color: 'rgb(var(--primary))' }}>
            Zurück zum Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card text-center">
        <div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto mb-4"
          style={{ borderColor: 'rgb(var(--primary))', borderTopColor: 'transparent' }}
        />
        <p style={{ color: 'rgb(var(--foreground) / 0.6)' }}>Anmeldung wird abgeschlossen...</p>
      </div>
    </div>
  )
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={
      <div className="auth-page">
        <div className="auth-card text-center">
          <div className="animate-spin w-8 h-8 border-2 rounded-full mx-auto mb-4"
            style={{ borderColor: 'rgb(var(--primary))', borderTopColor: 'transparent' }}
          />
          <p style={{ color: 'rgb(var(--foreground) / 0.6)' }}>Laden...</p>
        </div>
      </div>
    }>
      <GoogleCallbackHandler />
    </Suspense>
  )
}
