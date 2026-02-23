'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Trash2, Edit2, X } from 'lucide-react'
import {
  listSuppliers,
  createSupplier,
  deleteSupplier,
  type Supplier,
  type SupplierCreate,
} from '@/lib/api'

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ backgroundColor: 'rgb(var(--muted))' }}
      >
        <Plus size={24} style={{ color: 'rgb(var(--foreground-muted))' }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
        Noch keine Lieferanten
      </p>
      <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
        Erstelle deinen ersten Lieferanten, um automatische Zuordnungen zu aktivieren.
      </p>
    </div>
  )
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<SupplierCreate>({
    name: '',
    vat_id: '',
    address: '',
    iban: '',
    bic: '',
    email: '',
    default_account: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listSuppliers(0, 100)
      setSuppliers(res.items)
      setTotal(res.total)
    } catch {
      setError('Lieferanten konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.vat_id) return
    setSubmitting(true)
    try {
      await createSupplier(form)
      setForm({ name: '', vat_id: '', address: '', iban: '', bic: '', email: '', default_account: '', notes: '' })
      setShowForm(false)
      load()
    } catch {
      setError('Lieferant konnte nicht erstellt werden')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Lieferant wirklich löschen?')) return
    try {
      await deleteSupplier(id)
      load()
    } catch {
      setError('Löschen fehlgeschlagen')
    }
  }

  const filtered = search
    ? suppliers.filter(
        s =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.vat_id.toLowerCase().includes(search.toLowerCase())
      )
    : suppliers

  const fmt = (n: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>Lieferanten</h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {total} Lieferanten verwalten
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Abbrechen' : 'Neuer Lieferant'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'rgb(var(--danger-light))', color: 'rgb(var(--danger))' }}>
          {error}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border p-5 space-y-4"
          style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>Neuen Lieferanten anlegen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: 'name', label: 'Firmenname *', placeholder: 'Musterfirma GmbH' },
              { key: 'vat_id', label: 'USt-IdNr. *', placeholder: 'DE123456789' },
              { key: 'address', label: 'Adresse', placeholder: 'Musterstraße 1, 60311 Frankfurt' },
              { key: 'iban', label: 'IBAN', placeholder: 'DE89370400440532013000' },
              { key: 'bic', label: 'BIC', placeholder: 'COBADEFFXXX' },
              { key: 'email', label: 'E-Mail', placeholder: 'buchhaltung@firma.de' },
              { key: 'default_account', label: 'Standardkonto (SKR03)', placeholder: '3400' },
              { key: 'notes', label: 'Notizen', placeholder: 'Hauptlieferant Büromaterial' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  {label}
                </label>
                <input
                  type="text"
                  value={form[key as keyof SupplierCreate] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors"
                  style={{
                    backgroundColor: 'rgb(var(--background))',
                    borderColor: 'rgb(var(--border))',
                    color: 'rgb(var(--foreground))',
                  }}
                />
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={submitting || !form.name || !form.vat_id}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
          >
            {submitting ? 'Speichere...' : 'Lieferant erstellen'}
          </button>
        </form>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Lieferant suchen (Name oder USt-IdNr.)..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm outline-none"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
            color: 'rgb(var(--foreground))',
          }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: 'rgb(var(--muted))' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'rgb(var(--muted))' }}>
                {['Name', 'USt-IdNr.', 'IBAN', 'Konto', 'Rechnungen', 'Volumen', ''].map(h => (
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
              {filtered.map(s => (
                <tr
                  key={s.id}
                  className="border-t transition-colors"
                  style={{ borderColor: 'rgb(var(--border))' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgb(var(--muted))')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: 'rgb(var(--foreground))' }}>{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>{s.vat_id}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    {s.iban ? `${s.iban.slice(0, 4)}...${s.iban.slice(-4)}` : '—'}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'rgb(var(--foreground-muted))' }}>{s.default_account || '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'rgb(var(--foreground))' }}>{s.invoice_count}</td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'rgb(var(--foreground))' }}>{fmt(s.total_volume)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: 'rgb(var(--danger))' }}
                      title="Löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
