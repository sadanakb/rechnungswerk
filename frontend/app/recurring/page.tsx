'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Calendar, Clock, Pause, Play, Trash2, Zap, RefreshCw } from 'lucide-react'
import {
  listRecurring,
  createRecurring,
  deleteRecurring,
  toggleRecurring,
  triggerRecurring,
  getErrorMessage,
  type RecurringTemplate,
  type RecurringCreate,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monatlich',
  quarterly: 'Vierteljährlich',
  'half-yearly': 'Halbjährlich',
  yearly: 'Jährlich',
}

const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monatlich' },
  { value: 'quarterly', label: 'Vierteljährlich' },
  { value: 'half-yearly', label: 'Halbjährlich' },
  { value: 'yearly', label: 'Jährlich' },
]

const fmt = (n: number, currency = 'EUR') =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

interface TemplateCardProps {
  template: RecurringTemplate
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onTrigger: (id: string) => void
  loading?: boolean
}

function TemplateCard({ template: t, onToggle, onDelete, onTrigger, loading }: TemplateCardProps) {
  return (
    <div
      className="rounded-xl border p-5 space-y-3 transition-opacity"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
        opacity: t.active ? 1 : 0.65,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate" style={{ color: 'rgb(var(--foreground))' }}>
            {t.name}
          </h3>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {t.buyer_name}
          </p>
        </div>
        <span
          className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: t.active ? 'rgb(var(--success-light, 220 252 231))' : 'rgb(var(--muted))',
            color: t.active ? 'rgb(var(--success, 22 163 74))' : 'rgb(var(--foreground-muted))',
          }}
        >
          {t.active ? 'Aktiv' : 'Pausiert'}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {FREQUENCY_LABELS[t.frequency] ?? t.frequency}
        </span>
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {new Date(t.next_date).toLocaleDateString('de-DE')}
        </span>
      </div>

      {/* Amount */}
      <p className="text-lg font-bold" style={{ color: 'rgb(var(--foreground))' }}>
        {fmt(t.net_amount, t.currency)}
        <span className="text-xs font-normal ml-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
          netto
        </span>
      </p>

      {t.last_generated && (
        <p className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Zuletzt: {new Date(t.last_generated).toLocaleDateString('de-DE')}
        </p>
      )}

      {/* Actions */}
      <div
        className="flex flex-wrap gap-2 pt-2 border-t"
        style={{ borderColor: 'rgb(var(--border))' }}
      >
        <button
          onClick={() => onTrigger(t.template_id)}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors hover:opacity-80"
          style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
          title="Jetzt eine Rechnung generieren"
        >
          <Zap size={12} />
          Jetzt
        </button>
        <button
          onClick={() => onToggle(t.template_id)}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border transition-colors hover:opacity-80"
          style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground-muted))' }}
        >
          {t.active ? <Pause size={12} /> : <Play size={12} />}
          {t.active ? 'Pausieren' : 'Aktivieren'}
        </button>
        <button
          onClick={() => onDelete(t.template_id)}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors hover:opacity-80 ml-auto"
          style={{ color: 'rgb(var(--danger, 220 38 38))' }}
        >
          <Trash2 size={12} />
          Löschen
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default form values
// ---------------------------------------------------------------------------

interface FormState {
  name: string
  buyer_name: string
  buyer_vat_id: string
  seller_name: string
  seller_vat_id: string
  description: string
  net_amount: string
  tax_rate: string
  frequency: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
  next_date: string
  currency: string
  iban: string
}

const DEFAULT_FORM: FormState = {
  name: '',
  buyer_name: '',
  buyer_vat_id: '',
  seller_name: '',
  seller_vat_id: '',
  description: 'Dienstleistung',
  net_amount: '',
  tax_rate: '19',
  frequency: 'monthly',
  next_date: new Date().toISOString().split('T')[0],
  currency: 'EUR',
  iban: '',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RecurringPage() {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Load templates
  // ---------------------------------------------------------------------------

  const loadTemplates = useCallback(async () => {
    try {
      setError(null)
      const result = await listRecurring()
      setTemplates(result.items)
    } catch (err) {
      setError(getErrorMessage(err, 'Vorlagen konnten nicht geladen werden'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleToggle = async (templateId: string) => {
    setActionLoading(true)
    try {
      const updated = await toggleRecurring(templateId)
      setTemplates(prev => prev.map(t => t.template_id === templateId ? updated : t))
    } catch (err) {
      setError(getErrorMessage(err, 'Status konnte nicht geändert werden'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (templateId: string) => {
    if (!confirm('Vorlage wirklich löschen? Bereits generierte Rechnungen bleiben erhalten.')) return
    setActionLoading(true)
    try {
      await deleteRecurring(templateId)
      setTemplates(prev => prev.filter(t => t.template_id !== templateId))
    } catch (err) {
      setError(getErrorMessage(err, 'Vorlage konnte nicht gelöscht werden'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleTrigger = async (templateId: string) => {
    setActionLoading(true)
    try {
      const result = await triggerRecurring(templateId)
      setSuccessMsg(`Rechnung ${result.invoice_number} generiert (${fmt(result.gross_amount)}). Nächste: ${new Date(result.next_date).toLocaleDateString('de-DE')}`)
      await loadTemplates() // Refresh next_date and last_generated
    } catch (err) {
      setError(getErrorMessage(err, 'Rechnung konnte nicht generiert werden'))
    } finally {
      setActionLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Create form
  // ---------------------------------------------------------------------------

  const handleFieldChange = (field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const netAmount = parseFloat(form.net_amount)
    const taxRate = parseFloat(form.tax_rate)

    if (!form.name.trim()) { setFormError('Vorlagenname ist erforderlich'); return }
    if (!form.seller_name.trim()) { setFormError('Verkäufer ist erforderlich'); return }
    if (!form.seller_vat_id.trim()) { setFormError('USt-IdNr. des Verkäufers ist erforderlich'); return }
    if (!form.buyer_name.trim()) { setFormError('Käufer ist erforderlich'); return }
    if (isNaN(netAmount) || netAmount <= 0) { setFormError('Gültiger Nettobetrag erforderlich'); return }
    if (isNaN(taxRate) || taxRate < 0) { setFormError('Gültiger Steuersatz erforderlich'); return }

    const payload: RecurringCreate = {
      name: form.name.trim(),
      frequency: form.frequency,
      next_date: form.next_date,
      seller_name: form.seller_name.trim(),
      seller_vat_id: form.seller_vat_id.trim(),
      buyer_name: form.buyer_name.trim(),
      buyer_vat_id: form.buyer_vat_id.trim() || undefined,
      tax_rate: taxRate,
      currency: form.currency,
      iban: form.iban.trim() || undefined,
      line_items: [
        {
          description: form.description.trim() || 'Dienstleistung',
          quantity: 1.0,
          unit_price: netAmount,
          net_amount: netAmount,
          tax_rate: taxRate,
        },
      ],
    }

    setActionLoading(true)
    try {
      const created = await createRecurring(payload)
      setTemplates(prev => [created, ...prev])
      setForm(DEFAULT_FORM)
      setShowForm(false)
    } catch (err) {
      setFormError(getErrorMessage(err, 'Vorlage konnte nicht erstellt werden'))
    } finally {
      setActionLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const inputCls = "w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 transition-all"
  const inputStyle = {
    backgroundColor: 'rgb(var(--background))',
    borderColor: 'rgb(var(--border))',
    color: 'rgb(var(--foreground))',
  }
  const labelCls = "block text-xs font-medium mb-1"
  const labelStyle = { color: 'rgb(var(--foreground-muted))' }

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
        <div className="flex gap-2">
          <button
            onClick={loadTemplates}
            title="Aktualisieren"
            className="p-2 rounded-lg border transition-colors hover:opacity-80"
            style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground-muted))' }}
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setFormError(null) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
          >
            <Plus size={16} />
            Neue Vorlage
          </button>
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div
          className="rounded-lg px-4 py-3 text-sm flex items-center justify-between"
          style={{ backgroundColor: 'rgb(var(--success-light, 220 252 231))', color: 'rgb(var(--success, 22 163 74))' }}
        >
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-4 text-lg leading-none">×</button>
        </div>
      )}

      {/* Global error */}
      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm flex items-center justify-between"
          style={{ backgroundColor: 'rgb(254 226 226)', color: 'rgb(185 28 28)' }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-lg leading-none">×</button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border p-5 space-y-4"
          style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
            Neue Vorlage erstellen
          </h2>

          {formError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgb(254 226 226)', color: 'rgb(185 28 28)' }}>
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <label className={labelCls} style={labelStyle}>Vorlagenname *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => handleFieldChange('name', e.target.value)}
                placeholder="z.B. Monatsmiete Büro"
                className={inputCls}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Frequenz *</label>
              <select
                value={form.frequency}
                onChange={e => handleFieldChange('frequency', e.target.value as FormState['frequency'])}
                className={inputCls}
                style={inputStyle}
              >
                {FREQUENCY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Verkäufer (Name) *</label>
              <input
                type="text"
                value={form.seller_name}
                onChange={e => handleFieldChange('seller_name', e.target.value)}
                placeholder="Musterfirma GmbH"
                className={inputCls}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Verkäufer USt-IdNr. *</label>
              <input
                type="text"
                value={form.seller_vat_id}
                onChange={e => handleFieldChange('seller_vat_id', e.target.value)}
                placeholder="DE123456789"
                className={inputCls}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Käufer (Name) *</label>
              <input
                type="text"
                value={form.buyer_name}
                onChange={e => handleFieldChange('buyer_name', e.target.value)}
                placeholder="Käufer AG"
                className={inputCls}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Käufer USt-IdNr.</label>
              <input
                type="text"
                value={form.buyer_vat_id}
                onChange={e => handleFieldChange('buyer_vat_id', e.target.value)}
                placeholder="DE987654321"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Leistungsbeschreibung</label>
              <input
                type="text"
                value={form.description}
                onChange={e => handleFieldChange('description', e.target.value)}
                placeholder="Beratungsleistung"
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Nettobetrag (€) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.net_amount}
                onChange={e => handleFieldChange('net_amount', e.target.value)}
                placeholder="1500.00"
                className={inputCls}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Steuersatz (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={form.tax_rate}
                onChange={e => handleFieldChange('tax_rate', e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Erste Fälligkeit *</label>
              <input
                type="date"
                value={form.next_date}
                onChange={e => handleFieldChange('next_date', e.target.value)}
                className={inputCls}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>IBAN</label>
              <input
                type="text"
                value={form.iban}
                onChange={e => handleFieldChange('iban', e.target.value)}
                placeholder="DE89 3704 0044 0532 0130 00"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
            >
              {actionLoading ? 'Wird gespeichert…' : 'Vorlage erstellen'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null); setForm(DEFAULT_FORM) }}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
              style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* Template list */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="rounded-xl border h-44 animate-pulse"
              style={{ backgroundColor: 'rgb(var(--muted))', borderColor: 'rgb(var(--border))' }}
            />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <TemplateCard
              key={t.template_id}
              template={t}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onTrigger={handleTrigger}
              loading={actionLoading}
            />
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
          <p>1. Erstelle eine Rechnungsvorlage mit Käuferdaten und einer Leistungsposition.</p>
          <p>2. Wähle die Frequenz (monatlich, vierteljährlich, etc.) und das Startdatum.</p>
          <p>3. Klicke <strong style={{ color: 'rgb(var(--foreground))' }}>„Jetzt"</strong> um sofort eine Rechnung zu generieren, oder warte auf den automatischen Trigger.</p>
          <p>4. Jede generierte Rechnung erscheint in der Rechnungsliste und kann als ZUGFeRD/XRechnung exportiert werden.</p>
        </div>
      </div>
    </div>
  )
}
