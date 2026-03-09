'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Send,
  Edit2,
  Trash2,
  Check,
  X,
  Clock,
  Download,
  FileText,
  Loader2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import {
  getQuote,
  deleteQuote,
  sendQuote,
  acceptQuote,
  rejectQuote,
  convertQuoteToInvoice,
  getQuotePdfUrl,
  getErrorMessage,
  type QuoteDetail,
} from '@/lib/api'
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

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span
      className={cn('inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full', cfg.bg, cfg.text)}
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
// Info box component
// ---------------------------------------------------------------------------
function InfoBox({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'rgb(var(--foreground-muted))' }}
      >
        {title}
      </p>
      {children}
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono = false,
  bold = false,
}: {
  label: string
  value?: string | null
  mono?: boolean
  bold?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span style={{ color: 'rgb(var(--foreground-muted))' }} className="shrink-0">
        {label}
      </span>
      <span
        className={cn(mono && 'font-mono', bold && 'font-semibold', 'text-right break-all')}
        style={{ color: 'rgb(var(--foreground))' }}
      >
        {value || '\u2014'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AngebotDetailPage() {
  useEffect(() => { document.title = 'Angebotsdetails | RechnungsWerk' }, [])
  const params = useParams()
  const router = useRouter()
  const quoteId = params.id as string

  const [quote, setQuote] = useState<QuoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchQuote = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getQuote(quoteId)
      setQuote(data)
    } catch (err) {
      setError(getErrorMessage(err, 'Angebot konnte nicht geladen werden'))
    } finally {
      setLoading(false)
    }
  }, [quoteId])

  useEffect(() => {
    fetchQuote()
  }, [fetchQuote])

  const handleSend = useCallback(async () => {
    setActionLoading(true)
    try {
      const updated = await sendQuote(quoteId)
      setQuote(updated)
      toast.success('Angebot als gesendet markiert')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Fehler beim Senden'))
    } finally {
      setActionLoading(false)
    }
  }, [quoteId])

  const handleAccept = useCallback(async () => {
    setActionLoading(true)
    try {
      const updated = await acceptQuote(quoteId)
      setQuote(updated)
      toast.success('Angebot als angenommen markiert')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Fehler beim Markieren'))
    } finally {
      setActionLoading(false)
    }
  }, [quoteId])

  const handleReject = useCallback(async () => {
    setActionLoading(true)
    try {
      const updated = await rejectQuote(quoteId)
      setQuote(updated)
      toast.success('Angebot als abgelehnt markiert')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Fehler beim Markieren'))
    } finally {
      setActionLoading(false)
    }
  }, [quoteId])

  const handleConvert = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await convertQuoteToInvoice(quoteId)
      toast.success('Angebot in Rechnung umgewandelt')
      // Navigate to the created invoice
      if (result.invoice_id) {
        router.push(`/invoices`)
      } else {
        fetchQuote()
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Fehler bei der Umwandlung'))
    } finally {
      setActionLoading(false)
    }
  }, [quoteId, router, fetchQuote])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await deleteQuote(quoteId)
      toast.success('Angebot geloescht')
      router.push('/angebote')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Angebot konnte nicht geloescht werden'))
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }, [quoteId, router])

  // Check if quote is expired
  const isExpired = quote?.valid_until
    ? new Date(quote.valid_until) < new Date() && quote.status !== 'accepted' && quote.status !== 'converted'
    : false

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'rgb(var(--foreground-muted))' }} />
        <span className="ml-2 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>Angebot wird geladen...</span>
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto">
        <div
          className="rounded-xl border p-6 flex items-start gap-3"
          style={{
            backgroundColor: 'rgb(var(--destructive-light))',
            borderColor: 'rgb(var(--destructive-border))',
          }}
        >
          <AlertCircle size={20} className="shrink-0 mt-0.5" style={{ color: 'rgb(var(--destructive))' }} />
          <div>
            <p className="font-medium text-sm" style={{ color: 'rgb(var(--destructive))' }}>
              {error || 'Angebot nicht gefunden'}
            </p>
            <Link href="/angebote" className="text-xs underline mt-1 inline-block" style={{ color: 'rgb(var(--destructive))' }}>
              Zurueck zur Angebotsliste
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 max-w-4xl mx-auto">

      {/* Delete dialog */}
      {showDeleteDialog && (
        <DeleteConfirmDialog
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          loading={deleting}
        />
      )}

      {/* ===== Header ===== */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4 mb-6"
      >
        <div className="flex items-center gap-3">
          <Link
            href="/angebote"
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'rgb(var(--foreground-muted))' }}
            title="Zurueck"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'rgb(var(--foreground))' }}>
                {quote.quote_number || 'Angebot'}
              </h1>
              <StatusBadge status={quote.status} />
            </div>
            <p className="text-xs font-mono mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
              {quote.quote_id}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Draft actions */}
          {quote.status === 'draft' && (
            <>
              <button
                onClick={handleSend}
                disabled={actionLoading}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'rgb(var(--primary))' }}
              >
                <Send size={14} /> Senden
              </button>
              <Link
                href={`/angebote/neu?edit=${quote.quote_id}`}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
                style={{
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground))',
                  backgroundColor: 'rgb(var(--card))',
                }}
              >
                <Edit2 size={14} /> Bearbeiten
              </Link>
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors text-red-600"
                style={{ backgroundColor: 'rgb(239 68 68 / 0.1)' }}
              >
                <Trash2 size={14} /> Loeschen
              </button>
            </>
          )}

          {/* Sent actions */}
          {quote.status === 'sent' && (
            <>
              <button
                onClick={handleAccept}
                disabled={actionLoading}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'rgb(16 185 129)' }}
              >
                <Check size={14} /> Als angenommen markieren
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 text-red-600"
                style={{ backgroundColor: 'rgb(239 68 68 / 0.1)' }}
              >
                <X size={14} /> Als abgelehnt markieren
              </button>
            </>
          )}

          {/* Accepted actions */}
          {quote.status === 'accepted' && (
            <button
              onClick={handleConvert}
              disabled={actionLoading}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              <ArrowRight size={14} /> In Rechnung umwandeln
            </button>
          )}

          {/* Converted: link to invoice */}
          {quote.status === 'converted' && quote.converted_invoice_id && (
            <Link
              href="/invoices"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white transition-colors"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              <FileText size={14} /> Zur Rechnung
            </Link>
          )}

          {/* Rejected: new quote option */}
          {quote.status === 'rejected' && (
            <Link
              href="/angebote/neu"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white transition-colors"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              <FileText size={14} /> Neues Angebot erstellen
            </Link>
          )}

          {/* PDF download */}
          {quote.pdf_path && (
            <a
              href={getQuotePdfUrl(quote.quote_id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
              style={{
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
                backgroundColor: 'rgb(var(--card))',
              }}
            >
              <Download size={14} /> PDF herunterladen
            </a>
          )}
        </div>
      </motion.div>

      {/* ===== Expiry warning ===== */}
      {isExpired && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-xl border p-4 flex items-start gap-3"
          style={{
            backgroundColor: 'rgb(245 158 11 / 0.08)',
            borderColor: 'rgb(245 158 11 / 0.3)',
          }}
        >
          <Clock size={18} className="shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Dieses Angebot ist abgelaufen
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
              Gueltig bis: {new Date(quote.valid_until!).toLocaleDateString('de-DE')}
            </p>
          </div>
        </motion.div>
      )}

      {/* ===== Intro text ===== */}
      {quote.intro_text && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border p-4 mb-4"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            Einleitungstext
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground))' }}>
            {quote.intro_text}
          </p>
        </motion.div>
      )}

      {/* ===== Two column layout ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Left: Absender + Empfaenger */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <InfoBox title="Absender">
            <InfoRow label="Firma" value={quote.seller_name} bold />
            <InfoRow label="USt-IdNr." value={quote.seller_vat_id} mono />
            <InfoRow label="Adresse" value={quote.seller_address} />
          </InfoBox>

          <InfoBox title="Empfaenger">
            <InfoRow label="Firma" value={quote.buyer_name} bold />
            <InfoRow label="USt-IdNr." value={quote.buyer_vat_id} mono />
            <InfoRow label="Adresse" value={quote.buyer_address} />
          </InfoBox>

          <InfoBox title="Daten">
            <InfoRow label="Angebotsdatum" value={quote.quote_date ? new Date(quote.quote_date).toLocaleDateString('de-DE') : null} />
            <InfoRow
              label="Gueltig bis"
              value={quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('de-DE') : null}
            />
            <InfoRow label="Erstellt am" value={new Date(quote.created_at).toLocaleString('de-DE')} />
            {quote.updated_at && (
              <InfoRow label="Aktualisiert" value={new Date(quote.updated_at).toLocaleString('de-DE')} />
            )}
          </InfoBox>

          {/* Payment info */}
          {(quote.iban || quote.bic || quote.payment_account_name) && (
            <InfoBox title="Zahlungsinformationen">
              {quote.iban && <InfoRow label="IBAN" value={quote.iban} mono />}
              {quote.bic && <InfoRow label="BIC" value={quote.bic} mono />}
              {quote.payment_account_name && <InfoRow label="Kontoinhaber" value={quote.payment_account_name} />}
            </InfoBox>
          )}
        </motion.div>

        {/* Right: Positionen + Betraege */}
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-4"
        >
          {/* Line items table */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgb(var(--border))' }}>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Positionen
              </p>
            </div>
            {quote.line_items && quote.line_items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'rgb(var(--border))' }}>
                      <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Beschreibung
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Menge
                      </th>
                      <th className="text-right px-2 py-2 text-xs font-semibold" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Einzelpreis
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-semibold" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Netto
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
                    {quote.line_items.map((item, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5" style={{ color: 'rgb(var(--foreground))' }}>
                          {item.description}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums" style={{ color: 'rgb(var(--foreground))' }}>
                          {item.quantity}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: 'rgb(var(--foreground))' }}>
                          {item.unit_price.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                          {item.net_amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Keine Positionen vorhanden
              </div>
            )}
          </div>

          {/* Amounts summary */}
          <InfoBox title="Betraege">
            <InfoRow
              label="Nettobetrag"
              value={quote.net_amount != null ? `${quote.net_amount.toFixed(2)} ${quote.currency || 'EUR'}` : null}
            />
            <InfoRow
              label={`MwSt${quote.tax_rate != null ? ` (${quote.tax_rate}%)` : ''}`}
              value={quote.tax_amount != null ? `${quote.tax_amount.toFixed(2)} ${quote.currency || 'EUR'}` : null}
            />
            <div
              className="pt-2 mt-2 border-t"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <InfoRow
                label="Bruttobetrag"
                value={quote.gross_amount != null ? `${quote.gross_amount.toFixed(2)} ${quote.currency || 'EUR'}` : null}
                bold
              />
            </div>
          </InfoBox>
        </motion.div>
      </div>

      {/* ===== Closing text ===== */}
      {quote.closing_text && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border p-4 mb-4"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            Schlusstext
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground))' }}>
            {quote.closing_text}
          </p>
        </motion.div>
      )}

      {/* ===== Internal notes ===== */}
      {quote.internal_notes && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl border p-4"
          style={{
            backgroundColor: 'rgb(245 158 11 / 0.05)',
            borderColor: 'rgb(245 158 11 / 0.2)',
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-wider mb-2 text-amber-600 dark:text-amber-400"
          >
            Interne Notizen (nicht auf PDF sichtbar)
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground))' }}>
            {quote.internal_notes}
          </p>
        </motion.div>
      )}
    </div>
  )
}
