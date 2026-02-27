'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Edit2, X, Check, Star } from 'lucide-react'
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type InvoiceTemplate,
  type InvoiceTemplateCreate,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const EMPTY_FORM: InvoiceTemplateCreate = {
  name: '',
  primary_color: '#14b8a6',
  footer_text: '',
  payment_terms_days: 14,
  bank_iban: '',
  bank_bic: '',
  bank_name: '',
  default_vat_rate: '19',
  notes_template: '',
  is_default: false,
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function TemplatePreview({ tmpl }: { tmpl: InvoiceTemplateCreate }) {
  const color = tmpl.primary_color || '#14b8a6'
  return (
    <div
      className="rounded-xl border overflow-hidden text-sm"
      style={{ borderColor: 'rgb(var(--border))' }}
    >
      {/* Color bar header */}
      <div className="h-2" style={{ backgroundColor: color }} />
      <div className="p-4 space-y-3" style={{ backgroundColor: 'rgb(var(--card))' }}>
        {/* Mock invoice header */}
        <div className="flex justify-between items-start">
          <div>
            <div
              className="text-base font-bold"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Muster GmbH
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Musterstraße 1 · 60311 Frankfurt
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-bold" style={{ color }}>
              Rechnung
            </div>
            <div className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
              RE-2026-001
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ backgroundColor: color, opacity: 0.3 }} />

        {/* Payment terms */}
        <div className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Zahlungsziel:{' '}
          <span style={{ color: 'rgb(var(--foreground))' }}>
            {tmpl.payment_terms_days ?? 14} Tage · MwSt. {tmpl.default_vat_rate ?? '19'}%
          </span>
        </div>

        {/* Bank details */}
        {(tmpl.bank_iban || tmpl.bank_name) && (
          <div className="text-xs space-y-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {tmpl.bank_name && (
              <div>
                Bank:{' '}
                <span style={{ color: 'rgb(var(--foreground))' }}>{tmpl.bank_name}</span>
              </div>
            )}
            {tmpl.bank_iban && (
              <div>
                IBAN:{' '}
                <span className="font-mono" style={{ color: 'rgb(var(--foreground))' }}>
                  {tmpl.bank_iban}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {tmpl.footer_text && (
          <>
            <div className="h-px" style={{ backgroundColor: color, opacity: 0.3 }} />
            <div
              className="text-xs italic"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              {tmpl.footer_text}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form Modal
// ---------------------------------------------------------------------------

interface FormModalProps {
  initial: InvoiceTemplateCreate
  onSave: (data: InvoiceTemplateCreate) => Promise<void>
  onClose: () => void
  title: string
}

function FormModal({ initial, onSave, onClose, title }: FormModalProps) {
  const [form, setForm] = useState<InvoiceTemplateCreate>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof InvoiceTemplateCreate, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name?.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await onSave(form)
    } catch {
      setError('Speichern fehlgeschlagen')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors'
  const inputStyle = {
    backgroundColor: 'rgb(var(--background))',
    borderColor: 'rgb(var(--border))',
    color: 'rgb(var(--foreground))',
  }
  const labelCls = 'block text-xs font-medium mb-1'
  const labelStyle = { color: 'rgb(var(--foreground-muted))' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div
              className="px-4 py-3 rounded-lg text-sm"
              style={{ backgroundColor: 'rgb(var(--danger-light))', color: 'rgb(var(--danger))' }}
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column — fields */}
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className={labelCls} style={labelStyle}>Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="z. B. Standard-Vorlage"
                  required
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {/* Primary color */}
              <div>
                <label className={labelCls} style={labelStyle}>Primärfarbe</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primary_color || '#14b8a6'}
                    onChange={(e) => set('primary_color', e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border"
                    style={{ borderColor: 'rgb(var(--border))', padding: '2px' }}
                  />
                  <input
                    type="text"
                    value={form.primary_color || '#14b8a6'}
                    onChange={(e) => set('primary_color', e.target.value)}
                    placeholder="#14b8a6"
                    maxLength={7}
                    className={`flex-1 ${inputCls}`}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Payment terms */}
              <div>
                <label className={labelCls} style={labelStyle}>Zahlungsziel (Tage)</label>
                <input
                  type="number"
                  value={form.payment_terms_days ?? 14}
                  onChange={(e) => set('payment_terms_days', Number(e.target.value))}
                  min={0}
                  max={365}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {/* Default VAT */}
              <div>
                <label className={labelCls} style={labelStyle}>Standard-MwSt. (%)</label>
                <input
                  type="text"
                  value={form.default_vat_rate || '19'}
                  onChange={(e) => set('default_vat_rate', e.target.value)}
                  placeholder="19"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {/* Bank section */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={labelStyle}>
                  Bankverbindung
                </p>
                <div>
                  <label className={labelCls} style={labelStyle}>Bank</label>
                  <input
                    type="text"
                    value={form.bank_name || ''}
                    onChange={(e) => set('bank_name', e.target.value)}
                    placeholder="Commerzbank AG"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>IBAN</label>
                  <input
                    type="text"
                    value={form.bank_iban || ''}
                    onChange={(e) => set('bank_iban', e.target.value)}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    maxLength={34}
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>BIC</label>
                  <input
                    type="text"
                    value={form.bank_bic || ''}
                    onChange={(e) => set('bank_bic', e.target.value)}
                    placeholder="COBADEFFXXX"
                    maxLength={11}
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Footer text */}
              <div>
                <label className={labelCls} style={labelStyle}>Fußzeile</label>
                <textarea
                  value={form.footer_text || ''}
                  onChange={(e) => set('footer_text', e.target.value)}
                  placeholder="Vielen Dank für Ihren Auftrag."
                  rows={2}
                  maxLength={500}
                  className={`${inputCls} resize-none`}
                  style={inputStyle}
                />
              </div>

              {/* Notes template */}
              <div>
                <label className={labelCls} style={labelStyle}>Notizen-Vorlage</label>
                <textarea
                  value={form.notes_template || ''}
                  onChange={(e) => set('notes_template', e.target.value)}
                  placeholder="Bitte überweisen Sie den Betrag innerhalb von 14 Tagen."
                  rows={3}
                  maxLength={1000}
                  className={`${inputCls} resize-none`}
                  style={inputStyle}
                />
              </div>

              {/* Default toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!form.is_default}
                  onChange={(e) => set('is_default', e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm" style={{ color: 'rgb(var(--foreground))' }}>
                  Als Standard-Vorlage festlegen
                </span>
              </label>
            </div>

            {/* Right column — preview */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={labelStyle}>
                Vorschau
              </p>
              <TemplatePreview tmpl={form} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground-muted))',
              }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting || !form.name?.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
            >
              {submitting ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template Card
// ---------------------------------------------------------------------------

interface TemplateCardProps {
  tmpl: InvoiceTemplate
  onEdit: (tmpl: InvoiceTemplate) => void
  onDelete: (id: number) => void
  onSetDefault: (id: number) => void
}

function TemplateCard({ tmpl, onEdit, onDelete, onSetDefault }: TemplateCardProps) {
  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{ borderColor: 'rgb(var(--border))' }}
    >
      {/* Color bar */}
      <div className="h-2" style={{ backgroundColor: tmpl.primary_color }} />

      <div className="p-4 flex-1 space-y-3" style={{ backgroundColor: 'rgb(var(--card))' }}>
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              className="text-sm font-semibold truncate"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              {tmpl.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Zahlungsziel {tmpl.payment_terms_days} Tage · MwSt. {tmpl.default_vat_rate}%
            </p>
          </div>
          {tmpl.is_default && (
            <span
              className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{
                backgroundColor: 'rgb(var(--primary-light))',
                color: 'rgb(var(--primary))',
              }}
            >
              <Star size={10} />
              Standard
            </span>
          )}
        </div>

        {/* Color swatch + hex */}
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-full border"
            style={{
              backgroundColor: tmpl.primary_color,
              borderColor: 'rgb(var(--border))',
            }}
          />
          <span className="text-xs font-mono" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {tmpl.primary_color}
          </span>
        </div>

        {/* Bank */}
        {tmpl.bank_name && (
          <p className="text-xs truncate" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {tmpl.bank_name}
            {tmpl.bank_iban
              ? ` · ${tmpl.bank_iban.slice(0, 4)}...${tmpl.bank_iban.slice(-4)}`
              : ''}
          </p>
        )}

        {/* Footer */}
        {tmpl.footer_text && (
          <p
            className="text-xs italic line-clamp-2"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            {tmpl.footer_text}
          </p>
        )}
      </div>

      {/* Actions */}
      <div
        className="px-4 py-2 border-t flex items-center justify-between gap-2"
        style={{
          borderColor: 'rgb(var(--border))',
          backgroundColor: 'rgb(var(--muted))',
        }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(tmpl)}
            className="p-1.5 rounded-md transition-colors text-xs flex items-center gap-1"
            style={{ color: 'rgb(var(--foreground-muted))' }}
            title="Bearbeiten"
          >
            <Edit2 size={13} />
            Bearbeiten
          </button>
          {!tmpl.is_default && (
            <button
              onClick={() => onSetDefault(tmpl.id)}
              className="p-1.5 rounded-md transition-colors text-xs flex items-center gap-1"
              style={{ color: 'rgb(var(--primary))' }}
              title="Als Standard setzen"
            >
              <Check size={13} />
              Als Standard
            </button>
          )}
        </div>
        <button
          onClick={() => onDelete(tmpl.id)}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: 'rgb(var(--danger))' }}
          title="Löschen"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<InvoiceTemplate | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listTemplates()
      setTemplates(data)
    } catch {
      setError('Vorlagen konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (data: InvoiceTemplateCreate) => {
    await createTemplate(data)
    setShowCreate(false)
    load()
  }

  const handleUpdate = async (data: InvoiceTemplateCreate) => {
    if (!editTarget) return
    await updateTemplate(editTarget.id, data)
    setEditTarget(null)
    load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Vorlage wirklich löschen?')) return
    try {
      await deleteTemplate(id)
      load()
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined
      setError(detail || 'Löschen fehlgeschlagen')
    }
  }

  const handleSetDefault = async (id: number) => {
    try {
      await updateTemplate(id, { is_default: true })
      load()
    } catch {
      setError('Konnte Standard-Vorlage nicht setzen')
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Rechnungsvorlagen
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {templates.length} Vorlage{templates.length !== 1 ? 'n' : ''} · Design, Farbe und Bankverbindung verwalten
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
        >
          <Plus size={16} />
          Neue Vorlage
        </button>
      </div>

      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: 'rgb(var(--danger-light))', color: 'rgb(var(--danger))' }}
        >
          {error}
          <button
            onClick={() => setError('')}
            className="ml-2 underline text-xs"
          >
            Schließen
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl animate-pulse"
              style={{ backgroundColor: 'rgb(var(--muted))' }}
            />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'rgb(var(--muted))' }}
          >
            <Plus size={24} style={{ color: 'rgb(var(--foreground-muted))' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
            Noch keine Vorlagen
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Erstelle deine erste Rechnungsvorlage mit eigenen Farben und Bankdaten.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
          >
            Erste Vorlage erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tmpl) => (
            <TemplateCard
              key={tmpl.id}
              tmpl={tmpl}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <FormModal
          title="Neue Vorlage erstellen"
          initial={EMPTY_FORM}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <FormModal
          title={`Vorlage bearbeiten: ${editTarget.name}`}
          initial={{
            name: editTarget.name,
            primary_color: editTarget.primary_color,
            footer_text: editTarget.footer_text ?? '',
            payment_terms_days: editTarget.payment_terms_days,
            bank_iban: editTarget.bank_iban ?? '',
            bank_bic: editTarget.bank_bic ?? '',
            bank_name: editTarget.bank_name ?? '',
            default_vat_rate: editTarget.default_vat_rate,
            notes_template: editTarget.notes_template ?? '',
            is_default: editTarget.is_default,
          }}
          onSave={handleUpdate}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}
