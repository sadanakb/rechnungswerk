'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { listQuotes, deleteQuote, getErrorMessage, type Quote } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Entwurf', bg: 'bg-gray-100 dark:bg-gray-800/40', text: 'text-gray-600 dark:text-gray-400' },
  sent: { label: 'Gesendet', bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-400' },
  accepted: { label: 'Angenommen', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  rejected: { label: 'Abgelehnt', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  expired: { label: 'Abgelaufen', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  converted: { label: 'Umgewandelt', bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
}

const STATUS_TABS = [
  { value: 'all', label: 'Alle' },
  { value: 'draft', label: 'Entwurf' },
  { value: 'sent', label: 'Gesendet' },
  { value: 'accepted', label: 'Angenommen' },
  { value: 'rejected', label: 'Abgelehnt' },
  { value: 'expired', label: 'Abgelaufen' },
  { value: 'converted', label: 'Umgewandelt' },
]

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span
      className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full', cfg.bg, cfg.text)}
    >
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------
function DeleteConfirmDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl border shadow-2xl p-6"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgb(239 68 68 / 0.1)' }}
          >
            <Trash2 size={18} className="text-red-500" />
          </div>
          <h3 className="font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
            Angebot loeschen
          </h3>
        </div>
        <p className="text-sm mb-5" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Soll dieses Angebot wirklich unwiderruflich geloescht werden?
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: loading ? 'rgb(239 68 68 / 0.7)' : 'rgb(239 68 68)' }}
          >
            {loading ? 'Wird geloescht...' : 'Loeschen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AngebotePage() {
  useEffect(() => { document.title = 'Angebote | RechnungsWerk' }, [])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchQuotes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (statusFilter !== 'all') params.status = statusFilter
      const data = await listQuotes(params)
      setQuotes(data.quotes)
      setTotal(data.total)
    } catch {
      setError('Backend nicht erreichbar. Laeuft der Server auf Port 8001?')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchQuotes()
  }, [fetchQuotes])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return quotes
    const q = searchQuery.toLowerCase()
    return quotes.filter(
      (quote) =>
        (quote.quote_number && quote.quote_number.toLowerCase().includes(q)) ||
        (quote.buyer_name && quote.buyer_name.toLowerCase().includes(q))
    )
  }, [quotes, searchQuery])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteQuote(deleteTarget.quote_id)
      toast.success('Angebot geloescht')
      setDeleteTarget(null)
      fetchQuotes()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Angebot konnte nicht geloescht werden'))
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, fetchQuotes])

  const selectStyle = {
    backgroundColor: 'rgb(var(--input))',
    borderColor: 'rgb(var(--input-border))',
    color: 'rgb(var(--foreground))',
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 max-w-7xl mx-auto">

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {/* ===== Page Header ===== */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--foreground))' }}>
            Angebote
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {total} Angebot{total !== 1 ? 'e' : ''} gesamt
            {filtered.length !== total && ` · ${filtered.length} gefiltert`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/angebote/neu"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white transition-colors"
            style={{ backgroundColor: 'rgb(var(--primary))' }}
          >
            <Plus size={14} /> Neues Angebot
          </Link>
          <button
            onClick={fetchQuotes}
            disabled={loading}
            className="p-2 rounded-lg border transition-colors disabled:opacity-40"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground-muted))',
              backgroundColor: 'rgb(var(--card))',
            }}
            title="Aktualisieren"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </motion.div>

      {/* ===== Search + Status Tabs ===== */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border p-4 mb-4"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        {/* Search input */}
        <div className="relative mb-3">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          />
          <input
            type="text"
            placeholder="Suchen nach Nummer oder Kunde..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
            style={selectStyle}
          />
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === tab.value ? 'text-white' : ''
              )}
              style={{
                backgroundColor:
                  statusFilter === tab.value
                    ? 'rgb(var(--primary))'
                    : 'rgb(var(--muted))',
                color:
                  statusFilter === tab.value
                    ? 'white'
                    : 'rgb(var(--foreground))',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ===== Table ===== */}
      {error ? (
        <div
          className="rounded-xl border p-6 flex items-start gap-3"
          style={{
            backgroundColor: 'rgb(var(--destructive-light))',
            borderColor: 'rgb(var(--destructive-border))',
          }}
        >
          <AlertCircle
            size={20}
            className="shrink-0 mt-0.5"
            style={{ color: 'rgb(var(--destructive))' }}
          />
          <div>
            <p className="font-medium text-sm" style={{ color: 'rgb(var(--destructive))' }}>
              {error}
            </p>
          </div>
        </div>
      ) : loading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border p-12 flex items-center justify-center"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <RefreshCw size={20} className="animate-spin" style={{ color: 'rgb(var(--foreground-muted))' }} />
          <span className="ml-2 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>Laden...</span>
        </motion.div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border p-12 text-center"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <FileText
            size={48}
            className="mx-auto mb-4"
            style={{ color: 'rgb(var(--foreground-muted))', opacity: 0.4 }}
          />
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'rgb(var(--foreground))' }}>
            Keine Angebote gefunden
          </h3>
          <p className="text-sm mb-4" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {searchQuery || statusFilter !== 'all'
              ? 'Versuchen Sie andere Suchkriterien oder Filter.'
              : 'Erstellen Sie Ihr erstes Angebot.'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <Link
              href="/angebote/neu"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              <Plus size={14} /> Neues Angebot
            </Link>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: 'rgb(var(--border))' }}
                >
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>Nummer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>Kunde</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>Betrag</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>Gueltig bis</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>Erstellt</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--foreground-muted))' }}>Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
                <AnimatePresence>
                  {filtered.map((quote) => (
                    <motion.tr
                      key={quote.quote_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="transition-colors"
                      style={{ borderColor: 'rgb(var(--border))' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgb(var(--muted))'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                        {quote.quote_number || quote.quote_id.substring(0, 8)}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'rgb(var(--foreground))' }}>
                        {quote.buyer_name || '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                        {quote.gross_amount != null
                          ? `${quote.gross_amount.toFixed(2)} ${quote.currency || '\u20AC'}`
                          : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={quote.status} />
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        {quote.valid_until
                          ? new Date(quote.valid_until).toLocaleDateString('de-DE')
                          : '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        {new Date(quote.created_at).toLocaleDateString('de-DE')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/angebote/${quote.quote_id}`}
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: 'rgb(var(--foreground-muted))' }}
                            title="Anzeigen"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgb(var(--sidebar-item-hover))'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            <Eye size={15} />
                          </Link>
                          {quote.status === 'draft' && (
                            <>
                              <Link
                                href={`/angebote/neu?edit=${quote.quote_id}`}
                                className="p-1.5 rounded-md transition-colors"
                                style={{ color: 'rgb(var(--foreground-muted))' }}
                                title="Bearbeiten"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'rgb(var(--sidebar-item-hover))'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                }}
                              >
                                <Edit2 size={15} />
                              </Link>
                              <button
                                onClick={() => setDeleteTarget(quote)}
                                className="p-1.5 rounded-md transition-colors"
                                style={{ color: 'rgb(239 68 68)' }}
                                title="Loeschen"
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'rgb(239 68 68 / 0.1)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}
