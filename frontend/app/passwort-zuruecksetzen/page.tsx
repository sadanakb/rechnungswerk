'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="auth-page">
        <div className="auth-card text-center">
          <p style={{ color: 'rgb(var(--foreground) / 0.5)' }}>Laden...</p>
        </div>
      </div>
    }>
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
  const [errors, setErrors] = useState<string[]>([])

  const validatePassword = (password: string): string[] => {
    const validationErrors: string[] = []

    if (password.length < 10) {
      validationErrors.push('Passwort muss mindestens 10 Zeichen lang sein.')
    }
    if (password.length > 128) {
      validationErrors.push('Passwort darf maximal 128 Zeichen lang sein.')
    }
    if (!/[A-Z]/.test(password)) {
      validationErrors.push('Passwort muss mindestens einen Grossbuchstaben enthalten.')
    }
    if (!/[a-z]/.test(password)) {
      validationErrors.push('Passwort muss mindestens einen Kleinbuchstaben enthalten.')
    }
    if (!/[0-9]/.test(password)) {
      validationErrors.push('Passwort muss mindestens eine Zahl enthalten.')
    }
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=[\];'/~\\]/.test(password)) {
      validationErrors.push('Passwort muss mindestens ein Sonderzeichen enthalten.')
    }

    return validationErrors
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])

    if (newPassword !== confirmPassword) {
      setErrors(['Passwoerter stimmen nicht ueberein.'])
      return
    }

    const validationErrors = validatePassword(newPassword)
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
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
      setErrors(['Link ungueltig oder abgelaufen.'])
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card text-center">
          <Link href="/login" className="inline-block mb-6">
            <img src="/logo-stacked.png" alt="RechnungsWerk" className="h-20 mx-auto" />
          </Link>
          <h1 className="text-2xl font-bold mb-3" style={{ color: 'rgb(var(--foreground))' }}>
            Ungültiger Link
          </h1>
          <p className="text-sm mb-6" style={{ color: 'rgb(var(--foreground) / 0.5)' }}>
            Dieser Link zum Zurücksetzen des Passworts ist ungültig.
          </p>
          <Link
            href="/passwort-vergessen"
            className="font-medium transition-colors hover:opacity-80"
            style={{ color: 'rgb(var(--primary))' }}
          >
            Neuen Link anfordern
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-8">
          <Link href="/login" className="inline-block mb-6">
            <img src="/logo-stacked.png" alt="RechnungsWerk" className="h-20 mx-auto" />
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Neues Passwort setzen
          </h1>
          <p className="text-sm mt-2" style={{ color: 'rgb(var(--foreground) / 0.5)' }}>
            Geben Sie Ihr neues Passwort ein.
          </p>
        </div>

        {success ? (
          <div className="space-y-6">
            <div
              className="rounded-xl p-5 text-center"
              style={{
                backgroundColor: 'rgba(var(--primary), 0.1)',
                border: '1px solid rgba(var(--primary), 0.2)',
              }}
            >
              <p className="font-medium" style={{ color: 'rgb(var(--primary-hover))' }}>
                Passwort erfolgreich geändert
              </p>
              <p className="text-sm mt-2" style={{ color: 'rgb(var(--foreground) / 0.6)' }}>
                Sie können sich jetzt mit Ihrem neuen Passwort anmelden.
              </p>
            </div>
            <p className="text-center">
              <Link
                href="/login"
                className="font-medium transition-colors hover:opacity-80"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Zur Anmeldung
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                id="new_password"
                type="password"
                label="Neues Passwort"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                hint="Mind. 10 Zeichen, Gross-/Kleinbuchstaben, Zahl und Sonderzeichen"
              />
              <Input
                id="confirm_password"
                type="password"
                label="Passwort bestätigen"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {errors.length > 0 && (
                <div className="space-y-1">
                  {errors.map((err, i) => (
                    <p key={i} className="text-sm text-red-500">{err}</p>
                  ))}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="auth-submit-btn"
              >
                {loading ? 'Wird gespeichert...' : 'Passwort ändern'}
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
