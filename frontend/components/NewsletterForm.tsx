'use client'

import { useState, type FormEvent } from 'react'

export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email) return

    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setStatus('success')
        setEmail('')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <p className="text-sm font-medium" style={{ color: 'rgb(var(--primary))' }}>
        Erfolgreich angemeldet!
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Ihre E-Mail-Adresse"
          required
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-0"
          style={{
            borderColor: 'rgb(var(--border))',
            backgroundColor: 'rgb(var(--background))',
            color: 'rgb(var(--foreground))',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap disabled:opacity-50"
          style={{
            backgroundColor: 'rgb(var(--primary))',
            color: 'rgb(var(--primary-foreground))',
          }}
        >
          {status === 'loading' ? '...' : 'Abonnieren'}
        </button>
      </div>
      {status === 'error' && (
        <p className="text-sm" style={{ color: 'rgb(var(--destructive, 220 38 38))' }}>
          Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.
        </p>
      )}
    </form>
  )
}
