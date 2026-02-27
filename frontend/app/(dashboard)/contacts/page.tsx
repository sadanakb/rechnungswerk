'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Trash2, Edit2, X, Users2 } from 'lucide-react'
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  type Contact,
  type ContactCreate,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TypeFilter = 'all' | 'customer' | 'supplier'

const EMPTY_FORM: ContactCreate = {
  type: 'customer',
  name: '',
  email: '',
  phone: '',
  address_line1: '',
  city: '',
  zip: '',
  country: 'DE',
  vat_id: '',
  payment_terms: 30,
  notes: '',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-14 rounded-lg animate-pulse"
          style={{ backgroundColor: 'rgb(var(--muted))' }}
        />
      ))}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-20">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ backgroundColor: 'rgb(var(--muted))' }}
      >
        <Users2 size={28} style={{ color: 'rgb(var(--foreground-muted))' }} />
      </div>
      <p className="text-base font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
        Noch keine Kontakte
      </p>
      <p className="text-sm mt-1 mb-5" style={{ color: 'rgb(var(--foreground-muted))' }}>
        Lege Kunden und Lieferanten an, um sie in Rechnungen zu verwenden.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
        style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
      >
        <Plus size={15} />
        Ersten Kontakt anlegen
      </button>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const isCustomer = type === 'customer'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{
        backgroundColor: isCustomer ? 'rgb(13 148 136 / 0.12)' : 'rgb(59 130 246 / 0.12)',
        color: isCustomer ? 'rgb(13 148 136)' : 'rgb(59 130 246)',
      }}
    >
      {isCustomer ? 'Kunde' : 'Lieferant'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface ContactModalProps {
  initialData?: Contact
  onClose: () => void
  onSave: (data: ContactCreate) => Promise<void>
  saving: boolean
}

function ContactModal({ initialData, onClose, onSave, saving }: ContactModalProps) {
  const [form, setForm] = useState<ContactCreate>(
    initialData
      ? {
          type: initialData.type,
          name: initialData.name,
          email: initialData.email ?? '',
          phone: initialData.phone ?? '',
          address_line1: initialData.address_line1 ?? '',
          city: initialData.city ?? '',
          zip: initialData.zip ?? '',
          country: initialData.country,
          vat_id: initialData.vat_id ?? '',
          payment_terms: initialData.payment_terms,
          notes: initialData.notes ?? '',
        }
      : { ...EMPTY_FORM }
  )

  const set = (key: keyof ContactCreate, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    await onSave(form)
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Panel */}
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'rgb(var(--card))' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <h2 className="text-base font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
            {initialData ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgb(var(--foreground-muted))' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'rgb(var(--muted))')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'transparent')
            }
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'rgb(var(--foreground-muted))' }}>
              Typ
            </label>
            <div className="flex gap-3">
              {(['customer', 'supplier'] as const).map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={form.type === t}
                    onChange={() => set('type', t)}
                    className="accent-teal-500"
                  />
                  <span className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                    {t === 'customer' ? 'Kunde' : 'Lieferant'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1"
              style={{ color: 'rgb(var(--foreground-muted))' }}>
              Name *
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Musterfirma GmbH"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: 'rgb(var(--background))',
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
              }}
            />
          </div>

          {/* E-Mail + Telefon */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                E-Mail
              </label>
              <input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                placeholder="info@firma.de"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                Telefon
              </label>
              <input
                type="tel"
                value={form.phone ?? ''}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+49 69 12345678"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-medium mb-1"
              style={{ color: 'rgb(var(--foreground-muted))' }}>
              Adresse
            </label>
            <input
              type="text"
              value={form.address_line1 ?? ''}
              onChange={(e) => set('address_line1', e.target.value)}
              placeholder="Musterstraße 1"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: 'rgb(var(--background))',
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
              }}
            />
          </div>

          {/* PLZ + Ort */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                PLZ
              </label>
              <input
                type="text"
                value={form.zip ?? ''}
                onChange={(e) => set('zip', e.target.value)}
                placeholder="60311"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                Ort
              </label>
              <input
                type="text"
                value={form.city ?? ''}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Frankfurt am Main"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              />
            </div>
          </div>

          {/* USt-IdNr. + Zahlungsziel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                USt-IdNr.
              </label>
              <input
                type="text"
                value={form.vat_id ?? ''}
                onChange={(e) => set('vat_id', e.target.value)}
                placeholder="DE123456789"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                Zahlungsziel (Tage)
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={form.payment_terms}
                onChange={(e) => set('payment_terms', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium mb-1"
              style={{ color: 'rgb(var(--foreground-muted))' }}>
              Notizen
            </label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Interne Anmerkungen..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{
                backgroundColor: 'rgb(var(--background))',
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
              }}
            />
          </div>
        </form>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'rgb(var(--muted))',
              color: 'rgb(var(--foreground))',
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
          >
            {saving ? 'Speichere...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Contact | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listContacts()
      setContacts(data)
    } catch {
      setError('Kontakte konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Client-side filtering on top of server-fetched list
  const filtered = contacts.filter((c) => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.city ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const openCreate = () => {
    setEditTarget(undefined)
    setModalOpen(true)
  }

  const openEdit = (contact: Contact) => {
    setEditTarget(contact)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditTarget(undefined)
  }

  const handleSave = async (data: ContactCreate) => {
    setSaving(true)
    setError('')
    try {
      if (editTarget) {
        await updateContact(editTarget.id, data)
      } else {
        await createContact(data)
      }
      closeModal()
      load()
    } catch {
      setError('Kontakt konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (contact: Contact) => {
    if (!window.confirm(`Kontakt "${contact.name}" wirklich löschen?`)) return
    setError('')
    try {
      await deleteContact(contact.id)
      load()
    } catch {
      setError('Löschen fehlgeschlagen.')
    }
  }

  // Tab config
  const TABS: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'customer', label: 'Kunden' },
    { key: 'supplier', label: 'Lieferanten' },
  ]

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Kontakte
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {contacts.length} Kontakt{contacts.length !== 1 ? 'e' : ''} gesamt
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
        >
          <Plus size={16} />
          Neuer Kontakt
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: 'rgb(var(--danger-light))', color: 'rgb(var(--danger))' }}
        >
          {error}
        </div>
      )}

      {/* Filters: search + tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, E-Mail oder Ort suchen..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm outline-none"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
            }}
          />
        </div>

        {/* Type tabs */}
        <div
          className="flex rounded-lg border overflow-hidden shrink-0"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor:
                  typeFilter === tab.key
                    ? 'rgb(var(--primary))'
                    : 'rgb(var(--card))',
                color:
                  typeFilter === tab.key
                    ? '#fff'
                    : 'rgb(var(--foreground-muted))',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 && contacts.length === 0 ? (
        <EmptyState onAdd={openCreate} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <p className="text-sm">Keine Kontakte entsprechen deiner Suche.</p>
        </div>
      ) : (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'rgb(var(--muted))' }}>
                {['Name', 'Typ', 'E-Mail', 'Telefon', 'Zahlungsziel', 'Aktionen'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-t transition-colors"
                  style={{ borderColor: 'rgb(var(--border))' }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = 'rgb(var(--muted))')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                      {c.name}
                    </div>
                    {c.city && (
                      <div className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        {c.zip ? `${c.zip} ` : ''}{c.city}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={c.type} />
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    {c.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    {c.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    {c.payment_terms} Tage
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = 'rgb(var(--muted))')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'transparent')
                        }
                        title="Bearbeiten"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: 'rgb(var(--danger))' }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = 'rgb(var(--danger-light))')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'transparent')
                        }
                        title="Loschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <ContactModal
          initialData={editTarget}
          onClose={closeModal}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  )
}
