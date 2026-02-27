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
import { getInvoice, deleteInvoice, getXRechnungDownloadUrl, updatePaymentStatus, createShareLink, sendInvoiceEmail, type InvoiceDetail } from '@/lib/api'
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
// Payment status
// ---------------------------------------------------------------------------

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  unpaid: { label: 'Offen', color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400' },
  paid: { label: 'Bezahlt', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400' },
  partial: { label: 'Teilweise bezahlt', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400' },
  overdue: { label: 'Ueberfaellig', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Storniert', color: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400' },
}

function PaymentStatusBadge({ status }: { status: string }) {
  const cfg = PAYMENT_STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-600 border-gray-200' }
  return (
    <span className={cn('inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border', cfg.color)}>
      {cfg.label}
    </span>
  )
}

function PaymentStatusSection({
  invoice,
  onUpdated,
}: {
  invoice: InvoiceDetail
  onUpdated: (newStatus: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [showChangeDropdown, setShowChangeDropdown] = useState(false)
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState('Ueberweisung')
  const [paymentReference, setPaymentReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canMarkPaid = ['unpaid', 'partial', 'overdue'].includes(invoice.payment_status ?? 'unpaid')
  const otherStatuses = ['unpaid', 'paid', 'partial', 'overdue', 'cancelled'].filter(
    (s) => s !== (invoice.payment_status ?? 'unpaid')
  )

  const handleMarkPaid = async () => {
    setSaving(true)
    setError(null)
    try {
      await updatePaymentStatus(invoice.invoice_id, 'paid', paidDate, paymentMethod, paymentReference || undefined)
      setShowForm(false)
      onUpdated('paid')
    } catch {
      setError('Fehler beim Speichern. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangeStatus = async (status: string) => {
    setShowChangeDropdown(false)
    try {
      await updatePaymentStatus(invoice.invoice_id, status)
      onUpdated(status)
    } catch {
      // silent — badge won't update but user can retry
    }
  }

  return (
    <div
      className="rounded-xl border p-5 mb-5"
      style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'rgb(var(--foreground-muted))' }}
      >
        Zahlungsstatus
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <PaymentStatusBadge status={invoice.payment_status ?? 'unpaid'} />
        {invoice.paid_date && (
          <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Bezahlt am: {new Date(invoice.paid_date).toLocaleDateString('de-DE')}
          </span>
        )}
        {invoice.payment_method && (
          <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Methode: {invoice.payment_method}
          </span>
        )}
        {invoice.payment_reference && (
          <span className="text-sm font-mono" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Ref: {invoice.payment_reference}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canMarkPaid && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'rgb(var(--primary))' }}
          >
            Als bezahlt markieren
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowChangeDropdown((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))', backgroundColor: 'rgb(var(--card))' }}
          >
            Status aendern
          </button>
          {showChangeDropdown && (
            <div
              className="absolute left-0 top-full mt-1 z-20 rounded-lg border shadow-lg overflow-hidden min-w-[160px]"
              style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
            >
              {otherStatuses.map((s) => (
                <button
                  key={s}
                  onClick={() => handleChangeStatus(s)}
                  className="w-full text-left px-4 py-2 text-sm transition-colors"
                  style={{ color: 'rgb(var(--foreground))' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgb(var(--muted))' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  {PAYMENT_STATUS_CONFIG[s]?.label ?? s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div
          className="mt-4 pt-4 border-t space-y-3"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Datum
              </label>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                style={{ backgroundColor: 'rgb(var(--input))', borderColor: 'rgb(var(--input-border))', color: 'rgb(var(--foreground))' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Zahlungsmethode
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                style={{ backgroundColor: 'rgb(var(--input))', borderColor: 'rgb(var(--input-border))', color: 'rgb(var(--foreground))' }}
              >
                <option value="Ueberweisung">Ueberweisung</option>
                <option value="Lastschrift">Lastschrift</option>
                <option value="Bar">Bar</option>
                <option value="Sonstiges">Sonstiges</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Referenz (optional)
            </label>
            <input
              type="text"
              placeholder="z. B. Transaktions-ID oder Buchungsnummer"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
              style={{ backgroundColor: 'rgb(var(--input))', borderColor: 'rgb(var(--input-border))', color: 'rgb(var(--foreground))' }}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkPaid}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null) }}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50"
              style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
            >
              Abbrechen
            </button>
          </div>
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
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const handlePaymentUpdated = (newStatus: string) => {
    setInvoice((prev) => prev ? { ...prev, payment_status: newStatus } : prev)
  }

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

  const handleCreateShareLink = async () => {
    if (!invoice) return
    try {
      const result = await createShareLink(invoice.invoice_id)
      setShareLink(`https://rechnungswerk.io${result.url}`)
      setShowShareModal(true)
    } catch (err) {
      console.error('Share link error:', err)
    }
  }

  const handleSendEmail = async () => {
    if (!invoice || !emailTo) return
    setEmailSending(true)
    try {
      await sendInvoiceEmail(invoice.invoice_id, emailTo)
      setEmailSent(true)
    } catch (err) {
      console.error('Send email error:', err)
    } finally {
      setEmailSending(false)
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
            onClick={handleCreateShareLink}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors"
            style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground-muted))', backgroundColor: 'rgb(var(--card))' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Teilen
          </button>

          <button
            onClick={() => setShowEmailModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors"
            style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground-muted))', backgroundColor: 'rgb(var(--card))' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Per E-Mail senden
          </button>

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

      {/* ===== Payment status ===== */}
      <PaymentStatusSection invoice={invoice} onUpdated={handlePaymentUpdated} />

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

      {/* Share Link Modal */}
      {showShareModal && shareLink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-xl shadow-xl p-6 max-w-md w-full mx-4" style={{ backgroundColor: 'rgb(var(--card))' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'rgb(var(--foreground))' }}>Rechnung teilen</h3>
            <p className="text-sm mb-4" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Teilen Sie diesen Link mit Ihrem Kunden. Der Link ist 30 Tage gültig.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                readOnly
                value={shareLink}
                className="flex-1 text-sm rounded-lg px-3 py-2 focus:outline-none"
                style={{ border: '1px solid rgb(var(--border))', backgroundColor: 'rgb(var(--muted))', color: 'rgb(var(--foreground))' }}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareLink)
                  setCopySuccess(true)
                  setTimeout(() => setCopySuccess(false), 2000)
                }}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
                style={{ backgroundColor: 'rgb(var(--primary))' }}
              >
                {copySuccess ? 'Kopiert!' : 'Kopieren'}
              </button>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              className="w-full py-2 text-sm"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* Send by Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-xl shadow-xl p-6 max-w-md w-full mx-4" style={{ backgroundColor: 'rgb(var(--card))' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'rgb(var(--foreground))' }}>Rechnung per E-Mail senden</h3>
            {emailSent ? (
              <div className="text-center py-4">
                <p className="font-medium mb-1" style={{ color: '#16a34a' }}>E-Mail wird versendet!</p>
                <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  Ihr Kunde erhält einen Link zum Anzeigen und Herunterladen der Rechnung.
                </p>
                <button
                  onClick={() => { setShowEmailModal(false); setEmailSent(false); setEmailTo('') }}
                  className="mt-4 w-full py-2 text-sm font-medium text-white rounded-lg"
                  style={{ backgroundColor: 'rgb(var(--primary))' }}
                >
                  Schließen
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm mb-4" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  Der Kunde erhält einen Link zum Anzeigen und Herunterladen der Rechnung sowie zur Zahlungsbestätigung.
                </p>
                <input
                  type="email"
                  placeholder="E-Mail-Adresse des Kunden"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none"
                  style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--foreground))', backgroundColor: 'rgb(var(--card))' }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowEmailModal(false); setEmailTo('') }}
                    className="flex-1 py-2 text-sm rounded-lg"
                    style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--foreground-muted))' }}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSendEmail}
                    disabled={!emailTo || emailSending}
                    className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'rgb(var(--primary))' }}
                  >
                    {emailSending ? 'Wird gesendet…' : 'E-Mail senden'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
