'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Laden...</p></div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('Passwoerter stimmen nicht ueberein.')
      return
    }

    if (newPassword.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', {
        token,
        new_password: newPassword,
      })
      setSuccess(true)
    } catch {
      setError('Link ungueltig oder abgelaufen.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: 'rgb(var(--background))' }}
      >
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold">Ungueltiger Link</h1>
          <p className="text-sm opacity-60">
            Dieser Link zum Zuruecksetzen des Passworts ist ungueltig.
          </p>
          <p>
            <Link
              href="/passwort-vergessen"
              className="font-medium"
              style={{ color: 'rgb(var(--primary))' }}
            >
              Neuen Link anfordern
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Neues Passwort setzen</h1>
          <p className="text-sm mt-1 opacity-60">
            Gib dein neues Passwort ein.
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4 text-center"
              style={{
                backgroundColor: 'rgba(var(--primary), 0.1)',
                border: '1px solid rgba(var(--primary), 0.2)',
              }}
            >
              <p className="font-medium" style={{ color: 'rgb(var(--primary))' }}>
                Passwort erfolgreich geaendert
              </p>
              <p className="text-sm mt-1 opacity-70">
                Du kannst dich jetzt mit deinem neuen Passwort anmelden.
              </p>
            </div>
            <p className="text-center">
              <Link
                href="/login"
                className="font-medium"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Zur Anmeldung
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="new_password"
                type="password"
                label="Neues Passwort"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                hint="Mindestens 8 Zeichen"
              />
              <Input
                id="confirm_password"
                type="password"
                label="Passwort bestaetigen"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Wird gespeichert...' : 'Passwort aendern'}
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
