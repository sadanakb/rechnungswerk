'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { API_BASE } from '@/lib/api'

const getMainDomainUrl = (path: string) => {
  if (typeof window !== 'undefined' && window.location.hostname.startsWith('app.')) {
    const mainHost = window.location.hostname.replace('app.', '')
    return `${window.location.protocol}//${mainHost}${path}`
  }
  return path
}

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/auth/google`)
      if (!resp.ok) throw new Error('Google Login nicht verfügbar')
      const data = await resp.json()
      window.location.href = data.url
    } catch {
      setError('Google Login nicht verfügbar')
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login({ email, password })
      router.push('/dashboard')
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { detail?: string } } }
      const detail = apiError?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Ungueltige Anmeldedaten')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-8">
          <a
            href={getMainDomainUrl('/')}
            className="inline-flex items-center gap-2 mb-6 text-xl font-bold tracking-tight"
            style={{ color: 'rgb(var(--primary))' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
              <path d="M10 9H8" />
            </svg>
            RechnungsWerk
          </a>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Willkommen zurück
          </h1>
          <p className="text-sm mt-2" style={{ color: 'rgb(var(--foreground) / 0.5)' }}>
            Melden Sie sich bei Ihrem Konto an
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="email"
            type="email"
            label="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            id="password"
            type="password"
            label="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end">
            <Link
              href="/passwort-vergessen"
              className="text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: 'rgb(var(--primary))' }}
            >
              Passwort vergessen?
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="auth-submit-btn"
          >
            {loading ? 'Wird angemeldet...' : 'Anmelden'}
          </button>
        </form>

        {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px" style={{ background: 'rgb(var(--foreground) / 0.1)' }} />
              <span className="text-xs" style={{ color: 'rgb(var(--foreground) / 0.4)' }}>oder</span>
              <div className="flex-1 h-px" style={{ background: 'rgb(var(--foreground) / 0.1)' }} />
            </div>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:shadow-md"
              style={{
                background: 'rgb(var(--card))',
                color: 'rgb(var(--foreground))',
                border: '1px solid rgb(var(--foreground) / 0.15)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {googleLoading ? 'Weiterleitung...' : 'Mit Google anmelden'}
            </button>
          </>
        )}

        <p className="text-center text-sm mt-8" style={{ color: 'rgb(var(--foreground) / 0.5)' }}>
          Noch kein Konto?{' '}
          <Link
            href="/register"
            className="font-medium transition-colors hover:opacity-80"
            style={{ color: 'rgb(var(--primary))' }}
          >
            Kostenlos registrieren
          </Link>
        </p>
      </div>
    </div>
  )
}
