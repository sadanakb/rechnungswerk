'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw,
  AlertCircle,
  Plus,
  Search,
  Download,
  Filter,
  X,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  FileDown,
} from 'lucide-react'
import {
  listInvoices,
  bulkDeleteInvoices,
  bulkValidateInvoices,
  downloadZugferd,
  API_BASE,
  type Invoice,
  type BulkValidateEntry,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { InvoiceTable, type InvoiceRow } from '@/components/InvoiceTable'
import DATEVExportDialog from '@/components/DATEVExportDialog'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Badge components (used in detail panel)
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
  onZugferdDownload,
}: {
  invoice: Invoice
  onClose: () => void
  onZugferdDownload: (invoice: Invoice) => void
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
          <button
            onClick={() => onZugferdDownload(invoice)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
            style={{
              borderColor: 'rgb(var(--primary))',
              color: 'rgb(var(--primary))',
              backgroundColor: 'rgb(var(--primary-light))',
            }}
            title="ZUGFeRD PDF/A-3 herunterladen (XRechnung XML eingebettet)"
          >
            <FileDown size={15} /> ZUGFeRD PDF herunterladen
          </button>
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
// Bulk validate results modal
// ---------------------------------------------------------------------------
function BulkValidateModal({
  results,
  onClose,
}: {
  results: BulkValidateEntry[]
  onClose: () => void
}) {
  const validCount = results.filter((r) => r.valid).length
  const invalidCount = results.length - validCount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} style={{ color: 'rgb(var(--primary))' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'rgb(var(--foreground))' }}>
              Validierungsergebnisse
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Summary */}
        <div
          className="flex items-center gap-4 px-5 py-3 border-b text-sm"
          style={{ borderColor: 'rgb(var(--border))', backgroundColor: 'rgb(var(--muted))' }}
        >
          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
            <CheckCircle2 size={14} /> {validCount} gültig
          </span>
          {invalidCount > 0 && (
            <span className="flex items-center gap-1.5 text-red-600 font-medium">
              <XCircle size={14} /> {invalidCount} ungültig
            </span>
          )}
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
          {results.map((r) => (
            <div key={r.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'rgb(var(--foreground))' }}>
                    {r.invoice_number || `ID ${r.id}`}
                  </p>
                  {r.errors.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {r.errors.map((e, i) => (
                        <li key={i} className="text-xs" style={{ color: 'rgb(var(--destructive, 220 38 38))' }}>
                          &bull; {e}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {r.valid ? (
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <XCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t flex justify-end"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
            }}
          >
            Schliessen
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------
function DeleteConfirmDialog({
  count,
  onConfirm,
  onCancel,
  loading,
}: {
  count: number
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
            Rechnungen löschen
          </h3>
        </div>
        <p className="text-sm mb-5" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Sollen wirklich <strong>{count} Rechnung{count !== 1 ? 'en' : ''}</strong> unwiderruflich
          gelöscht werden?
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
            {loading ? 'Wird gelöscht…' : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
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
  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showDATEVExport, setShowDATEVExport] = useState(false)
  // Bulk state
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [selectionResetKey, setSelectionResetKey] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkValidating, setBulkValidating] = useState(false)
  const [validateResults, setValidateResults] = useState<BulkValidateEntry[] | null>(null)

  const handleZugferdDownload = useCallback(async (invoice: Invoice) => {
    try {
      await downloadZugferd(invoice.invoice_id, invoice.invoice_number)
    } catch {
      // Silent fail — browser will show no download, user can retry
    }
  }, [])

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

  // Bulk action handlers
  const handleBulkDelete = useCallback(async () => {
    setBulkDeleting(true)
    try {
      await bulkDeleteInvoices(selectedIds)
      setSelectedIds([])
      setSelectionResetKey((k) => k + 1)
      setShowDeleteConfirm(false)
      fetchInvoices()
    } catch {
      // Silently keep dialog open on error — user can retry
    } finally {
      setBulkDeleting(false)
    }
  }, [selectedIds, fetchInvoices])

  const handleBulkValidate = useCallback(async () => {
    setBulkValidating(true)
    try {
      const result = await bulkValidateInvoices(selectedIds)
      setValidateResults(result.results)
    } catch {
      // ignore
    } finally {
      setBulkValidating(false)
    }
  }, [selectedIds])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // Client-side filtering (sorting + pagination handled by InvoiceTable)
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

    return result
  }, [invoices, searchQuery, statusFilter, sourceFilter])

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setSourceFilter('all')
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
              onZugferdDownload={handleZugferdDownload}
            />
          </>
        )}
      </AnimatePresence>

      {/* DATEV Export Dialog */}
      <DATEVExportDialog open={showDATEVExport} onOpenChange={setShowDATEVExport} />

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          count={selectedIds.length}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={bulkDeleting}
        />
      )}

      {/* Bulk validate results modal */}
      {validateResults && (
        <BulkValidateModal
          results={validateResults}
          onClose={() => setValidateResults(null)}
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
            onClick={() => setShowDATEVExport(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
              backgroundColor: 'rgb(var(--card))',
            }}
          >
            <FileSpreadsheet size={14} /> DATEV Export
          </button>
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
                  onChange={(e) => setStatusFilter(e.target.value)}
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
                  onChange={(e) => setSourceFilter(e.target.value)}
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
            <p className="text-xs mt-1" style={{ color: 'rgb(var(--destructive))' }}>
              Backend starten:{' '}
              <code className="font-mono px-1 py-0.5 rounded" style={{ backgroundColor: 'rgb(var(--destructive-border))' }}>
                uvicorn app.main:app --port 8001 --reload
              </code>
            </p>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <InvoiceTable
            invoices={filtered.map((inv): InvoiceRow => ({
              invoice_id: inv.invoice_id,
              invoice_number: inv.invoice_number,
              created_at: inv.created_at,
              buyer_name: inv.buyer_name,
              gross_amount: inv.gross_amount,
              status: inv.validation_status,
            }))}
            loading={loading}
            selectionResetKey={selectionResetKey}
            onSelectionChange={(invoiceIds) => {
              // Map invoice_id strings back to numeric IDs via the invoice list
              const numericIds = invoiceIds
                .map((invId) => filtered.find((inv) => inv.invoice_id === invId)?.id)
                .filter((id): id is number => id !== undefined)
              setSelectedIds(numericIds)
            }}
          />
        </motion.div>
      )}

      {/* ===== Floating bulk action bar ===== */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            {/* Count */}
            <span
              className="text-sm font-semibold px-2.5 py-1 rounded-lg"
              style={{
                backgroundColor: 'rgb(var(--primary-light))',
                color: 'rgb(var(--primary))',
              }}
            >
              {selectedIds.length} ausgewählt
            </span>

            {/* Validate button */}
            <button
              onClick={handleBulkValidate}
              disabled={bulkValidating || bulkDeleting}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors disabled:opacity-50"
              style={{
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
                backgroundColor: 'rgb(var(--muted))',
              }}
            >
              <ShieldCheck size={14} />
              {bulkValidating ? 'Prüfe…' : 'Validieren'}
            </button>

            {/* Delete button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={bulkDeleting || bulkValidating}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 text-white"
              style={{ backgroundColor: 'rgb(239 68 68)' }}
            >
              <Trash2 size={14} />
              Löschen
            </button>

            {/* Deselect link */}
            <button
              onClick={() => {
                setSelectedIds([])
                setSelectionResetKey((k) => k + 1)
              }}
              className="text-xs underline-offset-2 underline"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Auswahl aufheben
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
