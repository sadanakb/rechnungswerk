'use client'

import { useState } from 'react'

type FormState = {
  name: string
  email: string
  subject: string
  message: string
}

const SUBJECTS = [
  'Allgemeine Anfrage',
  'Support',
  'Partnerschaft',
  'Presse',
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: '0.5rem',
  border: '1px solid rgb(var(--border))',
  backgroundColor: 'rgb(var(--card))',
  color: 'rgb(var(--foreground))',
  padding: '10px 12px',
  fontSize: '0.875rem',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '0.875rem',
  fontWeight: 500,
  color: 'rgb(var(--foreground))',
}

export default function KontaktForm() {
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    subject: 'Allgemeine Anfrage',
    message: '',
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || 'Unbekannter Fehler')
      }

      setSent(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(`Fehler beim Senden: ${message}`)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div
        className="rounded-xl border p-6 text-sm font-medium"
        style={{
          borderColor: 'rgb(var(--success, 34 197 94))',
          backgroundColor: 'rgb(var(--success, 34 197 94) / 0.08)',
          color: 'rgb(34 197 94)',
        }}
      >
        Danke! Wir melden uns bald.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Name */}
      <div>
        <label htmlFor="kf-name" style={labelStyle}>Name</label>
        <input
          id="kf-name"
          name="name"
          type="text"
          required
          value={form.name}
          onChange={handleChange}
          placeholder="Ihr Name"
          style={inputStyle}
          autoComplete="name"
        />
      </div>

      {/* E-Mail */}
      <div>
        <label htmlFor="kf-email" style={labelStyle}>E-Mail</label>
        <input
          id="kf-email"
          name="email"
          type="email"
          required
          value={form.email}
          onChange={handleChange}
          placeholder="ihre@email.de"
          style={inputStyle}
          autoComplete="email"
        />
      </div>

      {/* Betreff */}
      <div>
        <label htmlFor="kf-subject" style={labelStyle}>Betreff</label>
        <select
          id="kf-subject"
          name="subject"
          value={form.subject}
          onChange={handleChange}
          style={inputStyle}
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Nachricht */}
      <div>
        <label htmlFor="kf-message" style={labelStyle}>Nachricht</label>
        <textarea
          id="kf-message"
          name="message"
          required
          rows={6}
          value={form.message}
          onChange={handleChange}
          placeholder="Wie koennen wir Ihnen helfen?"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* Error message */}
      {error && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: 'rgb(239 68 68)',
            backgroundColor: 'rgb(239 68 68 / 0.08)',
            color: 'rgb(239 68 68)',
          }}
        >
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={sending}
        className="rounded-lg px-6 py-3 text-sm font-semibold transition-opacity"
        style={{
          backgroundColor: 'rgb(var(--primary))',
          color: 'rgb(var(--primary-foreground))',
          opacity: sending ? 0.65 : 1,
          cursor: sending ? 'not-allowed' : 'pointer',
          border: 'none',
          alignSelf: 'flex-start',
        }}
      >
        {sending ? 'Wird gesendet...' : 'Nachricht senden'}
      </button>
    </form>
  )
}
