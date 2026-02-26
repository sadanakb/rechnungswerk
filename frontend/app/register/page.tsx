'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function RegisterPage() {
  const { register } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    organization_name: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(form)
      router.push('/')
    } catch {
      setError('Registrierung fehlgeschlagen. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
    }
  }

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Konto erstellen</h1>
          <p className="text-sm mt-1 opacity-60">
            Starte kostenlos mit RechnungsWerk
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="full_name"
            label="Vollstaendiger Name"
            value={form.full_name}
            onChange={update('full_name')}
            required
          />
          <Input
            id="organization_name"
            label="Firmenname"
            value={form.organization_name}
            onChange={update('organization_name')}
            required
          />
          <Input
            id="email"
            type="email"
            label="E-Mail"
            value={form.email}
            onChange={update('email')}
            required
          />
          <div>
            <Input
              id="password"
              type="password"
              label="Passwort"
              value={form.password}
              onChange={update('password')}
              required
              hint="Mindestens 8 Zeichen, 1 Grossbuchstabe, 1 Zahl"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Wird erstellt...' : 'Registrieren'}
          </Button>
        </form>

        <p className="text-center text-sm opacity-60">
          Bereits ein Konto?{' '}
          <Link
            href="/login"
            className="font-medium"
            style={{ color: 'rgb(var(--primary))' }}
          >
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  )
}
