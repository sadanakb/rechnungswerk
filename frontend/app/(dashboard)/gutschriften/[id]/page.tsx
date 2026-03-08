'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Download, AlertCircle } from 'lucide-react'
import { getCreditNote, getCreditNoteXmlUrl, getCreditNotePdfUrl, type CreditNoteDetail } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatCurrency(amount: number | null | undefined, currency = 'EUR'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}

function InfoBox({ title, name, address, vatId }: { title: string; name?: string; address?: string; vatId?: string }) {
  return (
    <div className="rounded-xl border p-5 space-y-3" style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--foreground-muted))' }}>{title}</p>
      {name && <p className="font-semibold text-sm" style={{ color: 'rgb(var(--foreground))' }}>{name}</p>}
      {address && <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>{address}</p>}
      {vatId && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <span className="font-medium">USt-IdNr.:</span>
          <span className="font-mono">{vatId}</span>
        </div>
      )}
    </div>
  )
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded', className)} style={{ backgroundColor: 'rgb(var(--muted))' }} />
}

function DetailSkeleton() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )
}

export default function CreditNoteDetailPage() {
  useEffect(() => { document.title = 'Gutschrift | RechnungsWerk' }, [])
  const params = useParams()
  const creditNoteId = typeof params.id === 'string' ? params.id : (params.id?.[0] ?? '')

  const [cn, setCn] = useState<CreditNoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!creditNoteId) return
    setLoading(true)
    getCreditNote(creditNoteId)
      .then((data) => { setCn(data); setLoading(false) })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [creditNoteId])

  if (loading) return <DetailSkeleton />

  if (notFound || !cn) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-16 max-w-6xl mx-auto flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--muted))' }}>
          <AlertCircle size={28} style={{ color: 'rgb(var(--foreground-muted))' }} />
        </div>
        <h2 className="text-xl font-semibold" style={{ color: 'rgb(var(--foreground))' }}>Gutschrift nicht gefunden</h2>
        <Link href="/gutschriften" className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border" style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}>
          <ArrowLeft size={15} /> Zurück zu Gutschriften
        </Link>
      </div>
    )
  }

  const lineItems = Array.isArray(cn.line_items) ? cn.line_items : []
  const token = typeof window !== 'undefined' ? localStorage.getItem('rw-access-token') : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-16 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-5">
        <Link href="/gutschriften" className="inline-flex items-center gap-1.5 text-sm transition-colors" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <ArrowLeft size={15} /> Gutschriften
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--foreground))' }}>{cn.credit_note_number}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400">
              Gutschrift
            </span>
            <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>Erstellt: {formatDate(cn.created_at)}</span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgb(var(--muted))', color: 'rgb(var(--foreground-muted))' }}>
              {cn.credit_note_id}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {cn.xrechnung_available && token && (
            <a
              href={`${getCreditNoteXmlUrl(cn.credit_note_id)}?token=${encodeURIComponent(token)}`}
              download
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              <Download size={14} /> XRechnung XML
            </a>
          )}
          {cn.zugferd_available && token && (
            <a
              href={`${getCreditNotePdfUrl(cn.credit_note_id)}?token=${encodeURIComponent(token)}`}
              download
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
              style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))', backgroundColor: 'rgb(var(--card))' }}
            >
              <Download size={14} /> ZUGFeRD PDF
            </a>
          )}
        </div>
      </div>

      {/* Reference + Reason */}
      <div className="rounded-xl border px-5 py-4 mb-5" style={{ backgroundColor: 'rgb(254 242 242)', borderColor: 'rgb(254 202 202)' }}>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgb(153 27 27)' }}>Bezug auf Rechnung</p>
            <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>{cn.original_invoice_number || `#${cn.original_invoice_id}`}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgb(153 27 27)' }}>Grund der Gutschrift</p>
            <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>{cn.reason}</p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-xl border px-5 py-4 mb-5 grid grid-cols-2 sm:grid-cols-3 gap-4" style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}>
        {[
          { label: 'Gutschriftdatum', value: formatDate(cn.credit_note_date) },
          { label: 'Währung', value: cn.currency || 'EUR' },
          { label: 'Bruttobetrag', value: formatCurrency(cn.gross_amount, cn.currency) },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>{label}</p>
            <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Seller / Buyer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <InfoBox title="Gutschrift von" name={cn.seller_name} address={cn.seller_address} vatId={cn.seller_vat_id} />
        <InfoBox title="Gutschrift an" name={cn.buyer_name} address={cn.buyer_address} vatId={cn.buyer_vat_id} />
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className="rounded-xl border overflow-hidden mb-5" style={{ borderColor: 'rgb(var(--border))' }}>
          <div className="px-5 py-3 border-b" style={{ backgroundColor: 'rgb(var(--muted))', borderColor: 'rgb(var(--border))' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--foreground-muted))' }}>Positionen</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'rgb(var(--border))', backgroundColor: 'rgb(var(--card))' }}>
                  {['Pos.', 'Beschreibung', 'Menge', 'Einzelpreis', 'Netto'].map((col) => (
                    <th key={col} className="px-4 py-3 text-left font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap" style={{ color: 'rgb(var(--foreground-muted))' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr key={idx} className="border-b last:border-0" style={{ borderColor: 'rgb(var(--border))', backgroundColor: idx % 2 === 0 ? 'rgb(var(--card))' : 'rgb(var(--muted))' }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>{idx + 1}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'rgb(var(--foreground))' }}>{item.description}</td>
                    <td className="px-4 py-3 text-right" style={{ color: 'rgb(var(--foreground))' }}>{item.quantity}</td>
                    <td className="px-4 py-3 text-right" style={{ color: 'rgb(var(--foreground))' }}>{formatCurrency(item.unit_price, cn.currency)}</td>
                    <td className="px-4 py-3 text-right" style={{ color: 'rgb(var(--foreground))' }}>{formatCurrency(item.net_amount, cn.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="rounded-xl border p-5 w-full max-w-xs space-y-2" style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}>
          <div className="flex items-center justify-between gap-6 text-sm">
            <span style={{ color: 'rgb(var(--foreground-muted))' }}>Nettobetrag</span>
            <span style={{ color: 'rgb(var(--foreground))' }}>{formatCurrency(cn.net_amount, cn.currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-6 text-sm">
            <span style={{ color: 'rgb(var(--foreground-muted))' }}>MwSt {cn.tax_rate != null ? `(${cn.tax_rate} %)` : ''}</span>
            <span style={{ color: 'rgb(var(--foreground))' }}>{formatCurrency(cn.tax_amount, cn.currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-6 pt-2 border-t text-base font-bold" style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}>
            <span>Gutschriftbetrag</span>
            <span>{formatCurrency(cn.gross_amount, cn.currency)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
