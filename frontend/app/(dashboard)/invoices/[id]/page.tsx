'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Download,
  ShieldCheck,
  Trash2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
} from 'lucide-react'
import { getInvoice, deleteInvoice, getXRechnungDownloadUrl, type InvoiceDetail } from '@/lib/api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number | null | undefined, currency = 'EUR'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  valid: {
    label: 'Gültig',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: <CheckCircle2 size={13} />,
  },
  xrechnung_generated: {
    label: 'XML erstellt',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: <CheckCircle2 size={13} />,
  },
  invalid: {
    label: 'Ungültig',
    color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
    icon: <XCircle size={13} />,
  },
  error: {
    label: 'Fehler',
    color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
    icon: <XCircle size={13} />,
  },
  pending: {
    label: 'Ausstehend',
    color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
    icon: <Clock size={13} />,
  },
  ocr_processed: {
    label: 'OCR',
    color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <CheckCircle2 size={13} />,
  },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    icon: null,
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border',
        cfg.color,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Info box (seller / buyer)
// ---------------------------------------------------------------------------

function InfoBox({
  title,
  name,
  address,
  vatId,
  iban,
}: {
  title: string
  name?: string
  address?: string
  vatId?: string
  iban?: string
}) {
  return (
    <div
      className="rounded-xl border p-5 space-y-3"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'rgb(var(--foreground-muted))' }}
      >
        {title}
      </p>
      {name && (
        <p className="font-semibold text-sm" style={{ color: 'rgb(var(--foreground))' }}>
          {name}
        </p>
      )}
      {address && (
        <p
          className="text-sm whitespace-pre-line leading-relaxed"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {address}
        </p>
      )}
      {vatId && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <span className="font-medium">USt-IdNr.:</span>
          <span className="font-mono">{vatId}</span>
        </div>
      )}
      {iban && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <span className="font-medium">IBAN:</span>
          <span className="font-mono">{iban}</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded', className)}
      style={{ backgroundColor: 'rgb(var(--muted))' }}
    />
  )
}

function DetailSkeleton() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto space-y-6">
      <Skeleton className="h-4 w-32" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <div className="flex justify-end">
        <Skeleton className="h-28 w-72 rounded-xl" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteDialog({
  invoiceNumber,
  onConfirm,
  onCancel,
  loading,
}: {
  invoiceNumber: string
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
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgb(239 68 68 / 0.1)' }}>
            <Trash2 size={18} className="text-red-500" />
          </div>
          <h3 className="font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
            Rechnung löschen
          </h3>
        </div>
        <p className="text-sm mb-5" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Soll Rechnung <strong>{invoiceNumber}</strong> unwiderruflich gelöscht werden?
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
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
// Main page
// ---------------------------------------------------------------------------

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = typeof params.id === 'string' ? params.id : (params.id?.[0] ?? '')

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!invoiceId) return
    setLoading(true)
    getInvoice(invoiceId)
      .then((data) => {
        setInvoice(data)
        setLoading(false)
      })
      .catch(() => {
        setNotFound(true)
        setLoading(false)
      })
  }, [invoiceId])

  const handleDelete = async () => {
    if (!invoice) return
    setDeleting(true)
    try {
      await deleteInvoice(invoice.invoice_id)
      router.push('/invoices')
    } catch {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  // Loading state
  if (loading) return <DetailSkeleton />

  // 404 state
  if (notFound || !invoice) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-16 max-w-6xl mx-auto flex flex-col items-center gap-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgb(var(--muted))' }}
        >
          <AlertCircle size={28} style={{ color: 'rgb(var(--foreground-muted))' }} />
        </div>
        <h2 className="text-xl font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
          Rechnung nicht gefunden
        </h2>
        <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Die Rechnung mit ID <span className="font-mono">{invoiceId}</span> existiert nicht oder gehört nicht zu Ihrer Organisation.
        </p>
        <Link
          href="/invoices"
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border"
          style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
        >
          <ArrowLeft size={15} /> Zurück zu Rechnungen
        </Link>
      </div>
    )
  }

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : []
  const validationErrors = Array.isArray(invoice.validation_errors) ? invoice.validation_errors : []

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-16 max-w-6xl mx-auto">

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <DeleteDialog
          invoiceNumber={invoice.invoice_number}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          loading={deleting}
        />
      )}

      {/* ===== Breadcrumb ===== */}
      <div className="mb-5">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          <ArrowLeft size={15} />
          Rechnungen
        </Link>
      </div>

      {/* ===== Header ===== */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--foreground))' }}>
            {invoice.invoice_number}
          </h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <StatusBadge status={invoice.validation_status} />
            <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Erstellt: {formatDate(invoice.created_at)}
            </span>
            <span
              className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'rgb(var(--muted))',
                color: 'rgb(var(--foreground-muted))',
              }}
            >
              {invoice.invoice_id}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {invoice.xrechnung_available && (
            <a
              href={getXRechnungDownloadUrl(invoice.invoice_id)}
              download
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              <Download size={14} />
              XRechnung herunterladen
            </a>
          )}
          <button
            onClick={() => router.push(`/invoices/${invoice.invoice_id}/print`)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
              backgroundColor: 'rgb(var(--card))',
            }}
          >
            <Printer size={14} />
            Druckansicht
          </button>
          <Link
            href={`/validator?id=${invoice.invoice_id}`}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
              backgroundColor: 'rgb(var(--card))',
            }}
          >
            <ShieldCheck size={14} />
            Validieren
          </Link>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
          >
            <Trash2 size={14} />
            Löschen
          </button>
        </div>
      </div>

      {/* ===== Metadata row ===== */}
      <div
        className="rounded-xl border px-5 py-4 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        {[
          { label: 'Rechnungsdatum', value: formatDate(invoice.invoice_date) },
          { label: 'Zahlungsziel', value: formatDate(invoice.due_date) },
          { label: 'Währung', value: invoice.currency || 'EUR' },
          { label: 'Quelle', value: invoice.source_type === 'manual' ? 'Manuell' : invoice.source_type === 'ocr' ? 'OCR' : invoice.source_type === 'xml' ? 'XML' : invoice.source_type },
        ].map(({ label, value }) => (
          <div key={label}>
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              {label}
            </p>
            <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* ===== Sender / Buyer two-column grid ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <InfoBox
          title="Absender"
          name={invoice.seller_name}
          address={invoice.seller_address}
          vatId={invoice.seller_vat_id}
          iban={invoice.iban}
        />
        <InfoBox
          title="Empfanger"
          name={invoice.buyer_name}
          address={invoice.buyer_address}
          vatId={invoice.buyer_vat_id}
        />
      </div>

      {/* ===== Validation errors (if any) ===== */}
      {validationErrors.length > 0 && (
        <div
          className="rounded-xl border p-5 mb-5 space-y-3"
          style={{
            backgroundColor: 'rgb(239 68 68 / 0.05)',
            borderColor: 'rgb(239 68 68 / 0.3)',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500" />
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              {validationErrors.length} Validierungsfehler
            </p>
          </div>
          <ul className="space-y-1.5">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                <span className="mt-0.5 shrink-0">&bull;</span>
                <span>
                  {err.message}
                  {err.location && (
                    <span className="ml-1 text-xs font-mono opacity-70">({err.location})</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== Line items table ===== */}
      {lineItems.length > 0 && (
        <div
          className="rounded-xl border overflow-hidden mb-5"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <div
            className="px-5 py-3 border-b"
            style={{
              backgroundColor: 'rgb(var(--muted))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Positionen
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: 'rgb(var(--border))', backgroundColor: 'rgb(var(--card))' }}
                >
                  {['Pos.', 'Beschreibung', 'Menge', 'Einheit', 'Einzelpreis', 'MwSt-Satz', 'Netto', 'MwSt', 'Brutto'].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => {
                  const taxAmount = (item.net_amount ?? 0) * ((item.tax_rate ?? 0) / 100)
                  const gross = (item.net_amount ?? 0) + taxAmount
                  return (
                    <tr
                      key={idx}
                      className="border-b last:border-0 transition-colors"
                      style={{
                        borderColor: 'rgb(var(--border))',
                        backgroundColor: idx % 2 === 0 ? 'rgb(var(--card))' : 'rgb(var(--muted))',
                      }}
                    >
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                        {item.description}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'rgb(var(--foreground))' }}>
                        {new Intl.NumberFormat('de-DE').format(item.quantity ?? 0)}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        {item.unit || 'Stk.'}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'rgb(var(--foreground))' }}>
                        {formatCurrency(item.unit_price, invoice.currency)}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'rgb(var(--foreground))' }}>
                        {item.tax_rate != null ? `${item.tax_rate} %` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'rgb(var(--foreground))' }}>
                        {formatCurrency(item.net_amount, invoice.currency)}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        {formatCurrency(taxAmount, invoice.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                        {formatCurrency(gross, invoice.currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== Totals box ===== */}
      <div className="flex justify-end mb-6">
        <div
          className="rounded-xl border p-5 w-full max-w-xs space-y-2"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <div className="flex items-center justify-between gap-6 text-sm">
            <span style={{ color: 'rgb(var(--foreground-muted))' }}>Nettobetrag</span>
            <span style={{ color: 'rgb(var(--foreground))' }}>
              {formatCurrency(invoice.net_amount, invoice.currency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-6 text-sm">
            <span style={{ color: 'rgb(var(--foreground-muted))' }}>
              MwSt {invoice.tax_rate != null ? `(${invoice.tax_rate} %)` : ''}
            </span>
            <span style={{ color: 'rgb(var(--foreground))' }}>
              {formatCurrency(invoice.tax_amount, invoice.currency)}
            </span>
          </div>
          <div
            className="flex items-center justify-between gap-6 pt-2 border-t text-base font-bold"
            style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
          >
            <span>Bruttobetrag</span>
            <span>{formatCurrency(invoice.gross_amount, invoice.currency)}</span>
          </div>
        </div>
      </div>

      {/* ===== Payment & routing info ===== */}
      {(invoice.bic || invoice.buyer_reference || invoice.seller_endpoint_id || invoice.buyer_endpoint_id) && (
        <div
          className="rounded-xl border p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Zahlung
            </p>
            {invoice.payment_account_name && (
              <div className="flex items-start gap-3 text-sm mb-2">
                <span className="w-24 shrink-0" style={{ color: 'rgb(var(--foreground-muted))' }}>Kontoinhaber</span>
                <span style={{ color: 'rgb(var(--foreground))' }}>{invoice.payment_account_name}</span>
              </div>
            )}
            {invoice.bic && (
              <div className="flex items-start gap-3 text-sm">
                <span className="w-24 shrink-0" style={{ color: 'rgb(var(--foreground-muted))' }}>BIC</span>
                <span className="font-mono" style={{ color: 'rgb(var(--foreground))' }}>{invoice.bic}</span>
              </div>
            )}
          </div>

          {(invoice.buyer_reference || invoice.seller_endpoint_id || invoice.buyer_endpoint_id) && (
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Routing
              </p>
              {invoice.buyer_reference && (
                <div className="flex items-start gap-3 text-sm mb-2">
                  <span className="w-24 shrink-0" style={{ color: 'rgb(var(--foreground-muted))' }}>Leitweg-ID</span>
                  <span className="font-mono break-all" style={{ color: 'rgb(var(--foreground))' }}>{invoice.buyer_reference}</span>
                </div>
              )}
              {invoice.seller_endpoint_id && (
                <div className="flex items-start gap-3 text-sm mb-2">
                  <span className="w-24 shrink-0" style={{ color: 'rgb(var(--foreground-muted))' }}>Verkäufer</span>
                  <span style={{ color: 'rgb(var(--foreground))' }}>{invoice.seller_endpoint_id}</span>
                </div>
              )}
              {invoice.buyer_endpoint_id && (
                <div className="flex items-start gap-3 text-sm">
                  <span className="w-24 shrink-0" style={{ color: 'rgb(var(--foreground-muted))' }}>Käufer</span>
                  <span style={{ color: 'rgb(var(--foreground))' }}>{invoice.buyer_endpoint_id}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
