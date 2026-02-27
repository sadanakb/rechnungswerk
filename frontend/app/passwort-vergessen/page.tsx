'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Passwort vergessen</h1>
          <p className="text-sm mt-1 opacity-60">
            Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum Zuruecksetzen.
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4 text-center"
              style={{
                backgroundColor: 'rgba(var(--primary), 0.1)',
                border: '1px solid rgba(var(--primary), 0.2)',
              }}
            >
              <p className="font-medium" style={{ color: 'rgb(var(--primary))' }}>
                E-Mail wurde gesendet
              </p>
              <p className="text-sm mt-1 opacity-70">
                Falls ein Konto mit dieser E-Mail existiert, erhaeltst du in Kuerze eine E-Mail
                mit einem Link zum Zuruecksetzen deines Passworts.
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
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="email"
                type="email"
                label="E-Mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Wird gesendet...' : 'Link senden'}
              </Button>
            </form>

            <p className="text-center text-sm opacity-60">
              <Link
                href="/login"
                className="font-medium"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Zurueck zur Anmeldung
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
