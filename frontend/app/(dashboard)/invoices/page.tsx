'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw,
  FileText,
  Loader2,
  AlertCircle,
  Plus,
  Search,
  Download,
  Filter,
  ChevronUp,
  ChevronDown,
  X,
  Trash2,
  CheckSquare,
  Square,
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import {
  listInvoices,
  generateXRechnung,
  deleteInvoice,
  getErrorMessage,
  API_BASE,
  type Invoice,
} from '@/lib/api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_SIZE = 20

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  xrechnung_generated: { label: 'XML erstellt', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  pending: { label: 'Ausstehend', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  error: { label: 'Fehler', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  ocr_processed: { label: 'OCR', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  valid: { label: 'Validiert', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  invalid: { label: 'Ungültig', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manuell',
  ocr: 'OCR',
  xml: 'XML',
}

type SortKey = 'invoice_number' | 'seller_name' | 'buyer_name' | 'net_amount' | 'gross_amount' | 'invoice_date' | 'validation_status'
type SortDir = 'asc' | 'desc'

// ---------------------------------------------------------------------------
// Badge components
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

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    manual: 'bg-slate-100 text-slate-600',
    ocr: 'bg-blue-100 text-blue-600',
    xml: 'bg-purple-100 text-purple-600',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide',
        colors[source] ?? 'bg-gray-100 text-gray-500',
      )}
    >
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Detail slide-over panel
// ---------------------------------------------------------------------------
function InvoiceDetailPanel({
  invoice,
  onClose,
}: {
  invoice: Invoice
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.25 }}
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l overflow-y-auto"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      {/* Header */}
      <div
        className="sticky top-0 flex items-center justify-between px-5 py-4 border-b z-10"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'rgb(var(--foreground))' }}>
            {invoice.invoice_number || 'Rechnung'}
          </h3>
          <p className="text-[11px] font-mono mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {invoice.invoice_id}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: 'rgb(var(--foreground-muted))' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgb(var(--muted))' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="p-5 space-y-5">
        {/* Status + Source row */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={invoice.validation_status} />
          <SourceBadge source={invoice.source_type} />
          {invoice.ocr_confidence != null && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded font-medium"
              style={{
                backgroundColor: 'rgb(var(--muted))',
                color: 'rgb(var(--foreground-muted))',
              }}
            >
              OCR: {Math.round(invoice.ocr_confidence)}%
            </span>
          )}
        </div>

        {/* Parties */}
        <DetailSection title="Parteien">
          <DetailRow label="Verkäufer" value={invoice.seller_name} />
          <DetailRow label="Käufer" value={invoice.buyer_name} />
        </DetailSection>

        {/* Dates */}
        <DetailSection title="Daten">
          <DetailRow label="Rechnungsdatum" value={invoice.invoice_date} />
          <DetailRow label="Fälligkeitsdatum" value={invoice.due_date || '—'} />
          <DetailRow label="Erstellt am" value={new Date(invoice.created_at).toLocaleString('de-DE')} />
        </DetailSection>

        {/* Amounts */}
        <DetailSection title="Beträge">
          <DetailRow label="Nettobetrag" value={invoice.net_amount != null ? `${invoice.net_amount.toFixed(2)} €` : '—'} />
          <DetailRow label="MwSt" value={invoice.tax_amount != null ? `${invoice.tax_amount.toFixed(2)} €` : '—'} />
          <DetailRow label="Bruttobetrag" value={invoice.gross_amount != null ? `${invoice.gross_amount.toFixed(2)} €` : '—'} bold />
        </DetailSection>

        {/* Payment */}
        {(invoice.iban || invoice.bic) && (
          <DetailSection title="Zahlung">
            {invoice.iban && <DetailRow label="IBAN" value={invoice.iban} mono />}
            {invoice.bic && <DetailRow label="BIC" value={invoice.bic} mono />}
            {invoice.payment_account_name && (
              <DetailRow label="Kontoinhaber" value={invoice.payment_account_name} />
            )}
          </DetailSection>
        )}

        {/* Routing */}
        {invoice.buyer_reference && (
          <DetailSection title="Routing">
            <DetailRow label="Leitweg-ID" value={invoice.buyer_reference} mono />
            {invoice.seller_endpoint_id && (
              <DetailRow label="Verkäufer E-Mail" value={invoice.seller_endpoint_id} />
            )}
            {invoice.buyer_endpoint_id && (
              <DetailRow label="Käufer E-Mail" value={invoice.buyer_endpoint_id} />
            )}
          </DetailSection>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          {invoice.xrechnung_available && (
            <a
              href={`${API_BASE}/api/invoices/${invoice.invoice_id}/download-xrechnung`}
              download
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: 'rgb(var(--accent))' }}
            >
              <Download size={15} /> XRechnung XML herunterladen
            </a>
          )}
          <Link
            href="/invoices"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border text-center"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
            }}
            onClick={onClose}
          >
            Schliessen
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-[10px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: 'rgb(var(--foreground-muted))' }}
      >
        {title}
      </p>
      <div
        className="rounded-lg border divide-y overflow-hidden"
        style={{ borderColor: 'rgb(var(--border))', backgroundColor: 'rgb(var(--muted))' }}
      >
        {children}
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  bold = false,
  mono = false,
}: {
  label: string
  value?: string | null
  bold?: boolean
  mono?: boolean
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 px-3 py-2 text-sm"
      style={{ borderColor: 'rgb(var(--border))' }}
    >
      <span style={{ color: 'rgb(var(--foreground-muted))' }} className="shrink-0">
        {label}
      </span>
      <span
        className={cn(mono && 'font-mono', bold && 'font-semibold', 'text-right break-all')}
        style={{ color: 'rgb(var(--foreground))' }}
      >
        {value || '—'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------
function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  currentSort: SortKey
  currentDir: SortDir
  onSort: (key: SortKey) => void
}) {
  const active = currentSort === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-left font-semibold uppercase tracking-wide text-[11px] transition-colors hover:opacity-80"
      style={{
        color: active ? 'rgb(var(--primary))' : 'rgb(var(--foreground-muted))',
      }}
    >
      {label}
      {active
        ? currentDir === 'asc'
          ? <ChevronUp size={11} />
          : <ChevronDown size={11} />
        : <ChevronDown size={11} className="opacity-30" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('invoice_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [bulkGenerating, setBulkGenerating] = useState(false)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listInvoices(0, 500)
      setInvoices(data.items)
      setTotal(data.total)
    } catch {
      setError('Backend nicht erreichbar. Läuft der Server auf Port 8001?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    let result = [...invoices]

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (inv) =>
          inv.invoice_number?.toLowerCase().includes(q) ||
          inv.seller_name?.toLowerCase().includes(q) ||
          inv.buyer_name?.toLowerCase().includes(q) ||
          inv.invoice_id?.toLowerCase().includes(q),
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((inv) => inv.validation_status === statusFilter)
    }

    // Source filter
    if (sourceFilter !== 'all') {
      result = result.filter((inv) => inv.source_type === sourceFilter)
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortKey] ?? ''
      const bVal = b[sortKey] ?? ''
      const cmp = String(aVal).localeCompare(String(bVal), 'de', { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [invoices, searchQuery, statusFilter, sourceFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setCurrentPage(1)
  }

  const handleGenerateXML = async (invoiceId: string) => {
    setGeneratingIds((prev) => new Set(prev).add(invoiceId))
    try {
      await generateXRechnung(invoiceId)
      await fetchInvoices()
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Fehler bei XML-Generierung'))
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev)
        next.delete(invoiceId)
        return next
      })
    }
  }

  const handleDelete = async (invoiceId: string) => {
    if (!confirm('Rechnung wirklich löschen?')) return
    setDeletingIds((prev) => new Set(prev).add(invoiceId))
    try {
      await deleteInvoice(invoiceId)
      await fetchInvoices()
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(invoiceId)
        return next
      })
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Fehler beim Löschen'))
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(invoiceId)
        return next
      })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginated.map((inv) => inv.invoice_id)))
    }
  }

  const handleBulkGenerateXML = async () => {
    if (!selectedIds.size) return
    setBulkGenerating(true)
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      try {
        await generateXRechnung(id)
      } catch {
        // continue with others
      }
    }
    await fetchInvoices()
    setSelectedIds(new Set())
    setBulkGenerating(false)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setSourceFilter('all')
    setCurrentPage(1)
  }

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || sourceFilter !== 'all'

  const selectStyle = {
    backgroundColor: 'rgb(var(--input))',
    borderColor: 'rgb(var(--input-border))',
    color: 'rgb(var(--foreground))',
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 max-w-7xl mx-auto">

      {/* Detail slide-over overlay */}
      <AnimatePresence>
        {detailInvoice && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setDetailInvoice(null)}
            />
            <InvoiceDetailPanel
              invoice={detailInvoice}
              onClose={() => setDetailInvoice(null)}
            />
          </>
        )}
      </AnimatePresence>

      {/* ===== Page Header ===== */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--foreground))' }}>
            Rechnungen
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {total} Rechnung{total !== 1 ? 'en' : ''} gesamt
            {filtered.length !== total && ` · ${filtered.length} gefiltert`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/ocr"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
              backgroundColor: 'rgb(var(--card))',
            }}
          >
            <Plus size={14} /> OCR Upload
          </Link>
          <Link
            href="/manual"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
              backgroundColor: 'rgb(var(--card))',
            }}
          >
            <Plus size={14} /> Manuell
          </Link>
          <button
            onClick={fetchInvoices}
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

      {/* ===== Search + Filters bar ===== */}
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
        <div className="flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div
            className="relative flex-1 min-w-[200px]"
          >
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            />
            <input
              type="text"
              placeholder="Suchen nach Nummer, Verkäufer, Käufer..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
              style={selectStyle}
            />
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: hasActiveFilters
                ? 'rgb(var(--primary))'
                : 'rgb(var(--border))',
              backgroundColor: hasActiveFilters
                ? 'rgb(var(--primary-light))'
                : 'rgb(var(--muted))',
              color: hasActiveFilters
                ? 'rgb(var(--primary))'
                : 'rgb(var(--foreground))',
            }}
          >
            <Filter size={14} />
            Filter
            {hasActiveFilters && (
              <span
                className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: 'rgb(var(--primary))' }}
              >
                !
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              <X size={12} /> Filter zurücksetzen
            </button>
          )}
        </div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={selectStyle}
                >
                  <option value="all">Alle Status</option>
                  <option value="xrechnung_generated">XML erstellt</option>
                  <option value="pending">Ausstehend</option>
                  <option value="ocr_processed">OCR verarbeitet</option>
                  <option value="valid">Validiert</option>
                  <option value="invalid">Ungültig</option>
                  <option value="error">Fehler</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Quelle
                </label>
                <select
                  value={sourceFilter}
                  onChange={(e) => { setSourceFilter(e.target.value); setCurrentPage(1) }}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={selectStyle}
                >
                  <option value="all">Alle Quellen</option>
                  <option value="ocr">OCR</option>
                  <option value="manual">Manuell</option>
                  <option value="xml">XML</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ===== Bulk Actions bar ===== */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="mb-4 rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap"
            style={{
              backgroundColor: 'rgb(var(--primary-light))',
              borderColor: 'rgb(var(--primary-border))',
            }}
          >
            <span className="text-sm font-medium" style={{ color: 'rgb(var(--primary))' }}>
              {selectedIds.size} ausgewählt
            </span>
            <button
              onClick={handleBulkGenerateXML}
              disabled={bulkGenerating}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              {bulkGenerating ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              XML generieren
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs"
              style={{ color: 'rgb(var(--primary))' }}
            >
              Auswahl aufheben
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Table ===== */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <Loader2 className="animate-spin" size={22} />
          <span className="text-sm">Lade Rechnungen...</span>
        </div>
      ) : error ? (
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
            <p className="text-xs mt-1" style={{ color: 'rgb(var(--destructive))' }}>
              Backend starten:{' '}
              <code className="font-mono px-1 py-0.5 rounded" style={{ backgroundColor: 'rgb(var(--destructive-border))' }}>
                uvicorn app.main:app --port 8001 --reload
              </code>
            </p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <FileText size={48} className="mx-auto mb-4" style={{ color: 'rgb(var(--border-strong))' }} />
          <p className="font-medium mb-1" style={{ color: 'rgb(var(--foreground))' }}>
            {hasActiveFilters ? 'Keine Rechnungen gefunden' : 'Noch keine Rechnungen vorhanden'}
          </p>
          <p className="text-sm mb-6" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {hasActiveFilters
              ? 'Versuchen Sie, die Filter anzupassen'
              : 'Starten Sie mit OCR Upload oder manueller Eingabe'}
          </p>
          {hasActiveFilters ? (
            <button
              onClick={clearFilters}
              className="text-sm font-medium"
              style={{ color: 'rgb(var(--primary))' }}
            >
              Filter zurücksetzen
            </button>
          ) : (
            <div className="flex gap-3 justify-center">
              <Link
                href="/ocr"
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: 'rgb(var(--primary))' }}
              >
                OCR Upload
              </Link>
              <Link
                href="/manual"
                className="px-4 py-2 rounded-lg text-sm font-medium border"
                style={{
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                Manuell eingeben
              </Link>
            </div>
          )}
        </div>
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
            <table className="w-full min-w-[860px]">
              <thead>
                <tr
                  className="border-b"
                  style={{
                    backgroundColor: 'rgb(var(--muted))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  {/* Select all */}
                  <th className="w-10 px-4 py-3">
                    <button onClick={toggleSelectAll}>
                      {selectedIds.size === paginated.length && paginated.length > 0 ? (
                        <CheckSquare size={15} style={{ color: 'rgb(var(--primary))' }} />
                      ) : (
                        <Square size={15} style={{ color: 'rgb(var(--foreground-muted))' }} />
                      )}
                    </button>
                  </th>
                  <th className="text-left px-3 py-3">
                    <SortableHeader label="Rechnung" sortKey="invoice_number" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3">
                    <SortableHeader label="Verkäufer" sortKey="seller_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3">
                    <SortableHeader label="Käufer" sortKey="buyer_name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-right px-3 py-3">
                    <SortableHeader label="Brutto" sortKey="gross_amount" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3">
                    <SortableHeader label="Status" sortKey="validation_status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-3 py-3">
                    <SortableHeader label="Datum" sortKey="invoice_date" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="text-left px-4 py-3">
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Aktionen
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((inv) => {
                  const isSelected = selectedIds.has(inv.invoice_id)
                  const isGenerating = generatingIds.has(inv.invoice_id)
                  const isDeleting = deletingIds.has(inv.invoice_id)
                  return (
                    <tr
                      key={inv.id}
                      className={cn(
                        'border-b last:border-b-0 transition-colors duration-100 cursor-pointer',
                        isSelected ? 'selected-row' : '',
                      )}
                      style={{
                        borderColor: 'rgb(var(--border))',
                        backgroundColor: isSelected ? 'rgb(var(--primary-light))' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'rgb(var(--muted))'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                      onClick={() => setDetailInvoice(inv)}
                    >
                      {/* Checkbox */}
                      <td
                        className="w-10 px-4 py-3"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSelect(inv.invoice_id)
                        }}
                      >
                        {isSelected ? (
                          <CheckSquare size={15} style={{ color: 'rgb(var(--primary))' }} />
                        ) : (
                          <Square size={15} style={{ color: 'rgb(var(--foreground-muted))' }} />
                        )}
                      </td>

                      {/* Invoice number */}
                      <td className="px-3 py-3">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: 'rgb(var(--foreground))' }}
                        >
                          {inv.invoice_number || '—'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <SourceBadge source={inv.source_type} />
                          <p
                            className="text-[10px] font-mono"
                            style={{ color: 'rgb(var(--foreground-muted))' }}
                          >
                            {inv.invoice_id?.slice(0, 16)}
                          </p>
                        </div>
                      </td>

                      {/* Seller */}
                      <td
                        className="px-3 py-3 text-sm max-w-[120px]"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        <p className="truncate">{inv.seller_name || '—'}</p>
                      </td>

                      {/* Buyer */}
                      <td
                        className="px-3 py-3 text-sm max-w-[120px]"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        <p className="truncate">{inv.buyer_name || '—'}</p>
                      </td>

                      {/* Gross amount */}
                      <td
                        className="px-3 py-3 text-sm font-semibold text-right tabular-nums whitespace-nowrap"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        {inv.gross_amount != null ? `${inv.gross_amount.toFixed(2)} €` : '—'}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <StatusBadge status={inv.validation_status} />
                      </td>

                      {/* Date */}
                      <td
                        className="px-3 py-3 text-xs whitespace-nowrap"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        {inv.invoice_date || '—'}
                      </td>

                      {/* Actions */}
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          {/* Generate XML */}
                          {inv.validation_status !== 'xrechnung_generated' && (
                            <button
                              onClick={() => handleGenerateXML(inv.invoice_id)}
                              disabled={isGenerating}
                              className="text-xs font-medium whitespace-nowrap flex items-center gap-1 disabled:opacity-40"
                              style={{ color: 'rgb(var(--primary))' }}
                            >
                              {isGenerating ? (
                                <Loader2 className="animate-spin" size={12} />
                              ) : null}
                              XML
                            </button>
                          )}

                          {/* Download XML */}
                          {inv.xrechnung_available && (
                            <a
                              href={`${API_BASE}/api/invoices/${inv.invoice_id}/download-xrechnung`}
                              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: 'rgb(var(--accent-light))',
                                color: 'rgb(var(--accent))',
                              }}
                              download
                              title="XRechnung XML herunterladen"
                            >
                              <Download size={11} /> XML
                            </a>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(inv.invoice_id)}
                            disabled={isDeleting}
                            className="p-0.5 transition-colors disabled:opacity-40"
                            style={{ color: 'rgb(var(--foreground-muted))' }}
                            title="Löschen"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'rgb(var(--destructive))'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'rgb(var(--foreground-muted))'
                            }}
                          >
                            {isDeleting ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ===== Pagination ===== */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-3 border-t"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <p className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Seite {currentPage} von {totalPages} · {filtered.length} Rechnungen
              </p>
              <div className="flex items-center gap-1">
                <PaginationButton
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  title="Erste Seite"
                >
                  <ChevronsLeft size={13} />
                </PaginationButton>
                <PaginationButton
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  title="Vorherige Seite"
                >
                  <ArrowLeft size={13} />
                </PaginationButton>

                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page: number
                  if (totalPages <= 5) {
                    page = i + 1
                  } else if (currentPage <= 3) {
                    page = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i
                  } else {
                    page = currentPage - 2 + i
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className="w-8 h-8 rounded-md text-xs font-medium flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor:
                          currentPage === page ? 'rgb(var(--primary))' : 'transparent',
                        color:
                          currentPage === page
                            ? 'white'
                            : 'rgb(var(--foreground-muted))',
                      }}
                    >
                      {page}
                    </button>
                  )
                })}

                <PaginationButton
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  title="Nächste Seite"
                >
                  <ArrowRight size={13} />
                </PaginationButton>
                <PaginationButton
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  title="Letzte Seite"
                >
                  <ChevronsRight size={13} />
                </PaginationButton>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

function PaginationButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-8 h-8 rounded-md flex items-center justify-center transition-colors disabled:opacity-30"
      style={{ color: 'rgb(var(--foreground-muted))' }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = 'rgb(var(--muted))'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      {children}
    </button>
  )
}
