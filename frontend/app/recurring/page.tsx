'use client'

import { useState } from 'react'
import { Plus, Calendar, Clock, Pause, Play, Trash2 } from 'lucide-react'

interface RecurringTemplate {
  id: string
  name: string
  frequency: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
  next_date: string
  active: boolean
  buyer_name: string
  net_amount: number
  currency: string
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monatlich',
  quarterly: 'Vierteljährlich',
  'half-yearly': 'Halbjährlich',
  yearly: 'Jährlich',
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ backgroundColor: 'rgb(var(--muted))' }}
      >
        <Calendar size={24} style={{ color: 'rgb(var(--foreground-muted))' }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
        Keine wiederkehrenden Rechnungen
      </p>
      <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'rgb(var(--foreground-muted))' }}>
        Erstelle eine Vorlage, um Rechnungen automatisch in regelmäßigen Abständen zu generieren.
      </p>
    </div>
  )
}

export default function RecurringPage() {
  // Placeholder data — will be connected to API when backend recurring endpoints are ready
  const [templates] = useState<RecurringTemplate[]>([])
  const [showForm, setShowForm] = useState(false)

  const fmt = (n: number, currency = 'EUR') =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Wiederkehrende Rechnungen
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Vorlagen für automatische Rechnungsgenerierung
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
        >
          <Plus size={16} />
          Neue Vorlage
        </button>
      </div>

      {/* Create form placeholder */}
      {showForm && (
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
            Neue Vorlage erstellen
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'Vorlagenname', placeholder: 'Monatsmiete Büro' },
              { label: 'Käufer', placeholder: 'Musterfirma GmbH' },
              { label: 'Nettobetrag', placeholder: '1500.00' },
            ].map(({ label, placeholder }) => (
              <div key={label}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  {label}
                </label>
                <input
                  type="text"
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    backgroundColor: 'rgb(var(--background))',
                    borderColor: 'rgb(var(--border))',
                    color: 'rgb(var(--foreground))',
                  }}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Frequenz
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                <option value="monthly">Monatlich</option>
                <option value="quarterly">Vierteljährlich</option>
                <option value="half-yearly">Halbjährlich</option>
                <option value="yearly">Jährlich</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Startdatum
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
            >
              Vorlage erstellen
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Templates List */}
      {templates.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div
              key={t.id}
              className="rounded-xl border p-5 space-y-3"
              style={{
                backgroundColor: 'rgb(var(--card))',
                borderColor: 'rgb(var(--border))',
                opacity: t.active ? 1 : 0.6,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>{t.name}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>{t.buyer_name}</p>
                </div>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: t.active ? 'rgb(var(--success-light))' : 'rgb(var(--muted))',
                    color: t.active ? 'rgb(var(--success))' : 'rgb(var(--foreground-muted))',
                  }}
                >
                  {t.active ? 'Aktiv' : 'Pausiert'}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {FREQUENCY_LABELS[t.frequency]}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  Nächste: {new Date(t.next_date).toLocaleDateString('de-DE')}
                </span>
              </div>

              <p className="text-lg font-bold" style={{ color: 'rgb(var(--foreground))' }}>
                {fmt(t.net_amount, t.currency)}
              </p>

              <div className="flex gap-2 pt-1 border-t" style={{ borderColor: 'rgb(var(--border))' }}>
                <button
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors"
                  style={{ color: 'rgb(var(--primary))' }}
                >
                  {t.active ? <Pause size={12} /> : <Play size={12} />}
                  {t.active ? 'Pausieren' : 'Aktivieren'}
                </button>
                <button
                  className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors"
                  style={{ color: 'rgb(var(--danger))' }}
                >
                  <Trash2 size={12} />
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
      >
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'rgb(var(--foreground))' }}>
          Wie funktioniert es?
        </h3>
        <div className="space-y-2 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <p>1. Erstelle eine Rechnungsvorlage mit Käuferdaten und Positionen.</p>
          <p>2. Wähle die Frequenz (monatlich, vierteljährlich, etc.).</p>
          <p>3. RechnungsWerk generiert automatisch XRechnung-konforme Rechnungen zum Stichtag.</p>
          <p>4. Jede generierte Rechnung erscheint in der Rechnungsliste und kann als ZUGFeRD/XRechnung exportiert werden.</p>
        </div>
      </div>
    </div>
  )
}
