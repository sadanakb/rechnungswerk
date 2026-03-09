'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setSent(true)
    } catch {
      setError('Ein Fehler ist aufgetreten. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-8">
          <Link href="/login" className="inline-block mb-6">
            <img src="/logo-stacked.png" alt="RechnungsWerk" className="h-20 mx-auto" />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Passwort vergessen
          </h1>
          <p className="text-sm mt-2" style={{ color: 'rgb(var(--foreground) / 0.5)' }}>
            Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen.
          </p>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div
              className="rounded-xl p-5 text-center"
              style={{
                backgroundColor: 'rgba(var(--primary), 0.1)',
                border: '1px solid rgba(var(--primary), 0.2)',
              }}
            >
              <p className="font-medium" style={{ color: 'rgb(var(--primary-hover))' }}>
                E-Mail wurde gesendet
              </p>
              <p className="text-sm mt-2" style={{ color: 'rgb(var(--foreground) / 0.6)' }}>
                Falls ein Konto mit dieser E-Mail existiert, erhalten Sie in Kürze eine E-Mail
                mit einem Link zum Zurücksetzen Ihres Passworts.
              </p>
            </div>
            <p className="text-center text-sm">
              <Link
                href="/login"
                className="font-medium transition-colors hover:opacity-80"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Zurück zur Anmeldung
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                id="email"
                type="email"
                label="E-Mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="auth-submit-btn"
              >
                {loading ? 'Wird gesendet...' : 'Link senden'}
              </button>
            </form>

            <p className="text-center text-sm mt-8" style={{ color: 'rgb(var(--foreground) / 0.5)' }}>
              <Link
                href="/login"
                className="font-medium transition-colors hover:opacity-80"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Zurück zur Anmeldung
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
