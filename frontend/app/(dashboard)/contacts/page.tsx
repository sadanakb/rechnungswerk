'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Trash2, Edit2, X, Users2 } from 'lucide-react'
import EmptyState from '@/components/EmptyState'
import { toast } from '@/components/ui/toast'
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  type Contact,
  type ContactCreate,
} from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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


function TypeBadge({ type }: { type: string }) {
  const isCustomer = type === 'customer'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{
        backgroundColor: isCustomer ? 'rgb(132 204 22 / 0.12)' : 'rgb(132 204 22 / 0.12)',
        color: isCustomer ? 'rgb(132 204 22)' : 'rgb(132 204 22)',
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
        role="dialog"
        aria-modal="true"
        aria-label={initialData ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}
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
            aria-label="Dialog schließen"
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
          <fieldset>
            <legend className="block text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'rgb(var(--foreground-muted))' }}>
              Typ
            </legend>
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
                    className="accent-lime-500"
                  />
                  <span className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                    {t === 'customer' ? 'Kunde' : 'Lieferant'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Name */}
          <div>
            <label htmlFor="contact-name" className="block text-xs font-medium mb-1"
              style={{ color: 'rgb(var(--foreground-muted))' }}>
              Name *
            </label>
            <input
              id="contact-name"
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
              <label htmlFor="contact-email" className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                E-Mail
              </label>
              <input
                id="contact-email"
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
              <label htmlFor="contact-phone" className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                Telefon
              </label>
              <input
                id="contact-phone"
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
            <label htmlFor="contact-address" className="block text-xs font-medium mb-1"
              style={{ color: 'rgb(var(--foreground-muted))' }}>
              Adresse
            </label>
            <input
              id="contact-address"
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
              <label htmlFor="contact-zip" className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                PLZ
              </label>
              <input
                id="contact-zip"
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
              <label htmlFor="contact-city" className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                Ort
              </label>
              <input
                id="contact-city"
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
              <label htmlFor="contact-vat" className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                USt-IdNr.
              </label>
              <input
                id="contact-vat"
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
              <label htmlFor="contact-payment-terms" className="block text-xs font-medium mb-1"
                style={{ color: 'rgb(var(--foreground-muted))' }}>
                Zahlungsziel (Tage)
              </label>
              <input
                id="contact-payment-terms"
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
            <label htmlFor="contact-notes" className="block text-xs font-medium mb-1"
              style={{ color: 'rgb(var(--foreground-muted))' }}>
              Notizen
            </label>
            <textarea
              id="contact-notes"
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
  useEffect(() => { document.title = 'Kontakte | RechnungsWerk' }, [])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Contact | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  // Delete confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; item: Contact | null }>({ open: false, item: null })
  const [deleting, setDeleting] = useState(false)

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
        toast.success('Erfolgreich gespeichert')
      } else {
        await createContact(data)
        toast.success('Erfolgreich erstellt')
      }
      closeModal()
      load()
    } catch {
      toast.error('Kontakt konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (contact: Contact) => {
    setDeleteConfirm({ open: true, item: contact })
  }

  const confirmDelete = async () => {
    if (!deleteConfirm.item || deleting) return
    setDeleting(true)
    setError('')
    try {
      await deleteContact(deleteConfirm.item.id)
      toast.success('Erfolgreich gelöscht')
      load()
      setDeleteConfirm({ open: false, item: null })
    } catch {
      toast.error('Löschen fehlgeschlagen.')
    } finally {
      setDeleting(false)
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
        <EmptyState
          icon={Users2}
          title="Noch keine Kontakte"
          description="Lege Kunden und Lieferanten an, um sie in Rechnungen zu verwenden."
          actionLabel="Ersten Kontakt anlegen"
          onAction={openCreate}
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <p className="text-sm">Keine Kontakte entsprechen Ihrer Suche.</p>
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
                        aria-label={`${c.name} bearbeiten`}
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
                        title="Löschen"
                        aria-label={`${c.name} löschen`}
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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => !open && setDeleteConfirm({ open: false, item: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kontakt löschen</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Möchten Sie &bdquo;{deleteConfirm.item?.name}&ldquo; wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.
          </DialogDescription>
          <DialogFooter>
            <button
              onClick={() => setDeleteConfirm({ open: false, item: null })}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-stone-100 dark:hover:bg-stone-800"
              style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
            >
              Abbrechen
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? 'Lösche...' : 'Löschen'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
