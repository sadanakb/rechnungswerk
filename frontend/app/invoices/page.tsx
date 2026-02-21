'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  RefreshCw,
  FileText,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react'
import { listInvoices, generateXRechnung, getErrorMessage, API_BASE, type Invoice } from '@/lib/api'

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  xrechnung_generated: {
    label: 'XML erstellt',
    className: 'bg-green-100 text-green-700 border border-green-200',
  },
  pending: {
    label: 'Ausstehend',
    className: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  },
  error: {
    label: 'Fehler',
    className: 'bg-red-100 text-red-700 border border-red-200',
  },
  ocr_processed: {
    label: 'OCR verarbeitet',
    className: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  valid: {
    label: 'Validiert',
    className: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
  invalid: {
    label: 'Ungültig',
    className: 'bg-red-100 text-red-700 border border-red-200',
  },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-600 border border-gray-200',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, string> = {
    manual: 'Manuell',
    ocr: 'OCR',
    xml: 'XML',
  }
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
      {map[source] ?? source}
    </span>
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
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  const fetchInvoices = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listInvoices()
      setInvoices(data.items)
      setTotal(data.total)
    } catch {
      setError('Backend nicht erreichbar. Läuft der Server auf Port 8001?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [])

  const handleGenerateXML = async (invoiceId: string) => {
    setGeneratingId(invoiceId)
    try {
      await generateXRechnung(invoiceId)
      await fetchInvoices()
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Fehler bei XML-Generierung'))
    } finally {
      setGeneratingId(null)
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Rechnungen</h1>
            <p className="text-sm text-gray-400">
              Modus C · {total} Rechnung{total !== 1 ? 'en' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/ocr"
            className="flex items-center gap-1 text-sm bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Plus size={14} /> OCR Upload
          </Link>
          <Link
            href="/manual"
            className="flex items-center gap-1 text-sm bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:border-green-400 hover:text-green-600 transition-colors"
          >
            <Plus size={14} /> Manuelle Eingabe
          </Link>
          <button
            onClick={fetchInvoices}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 p-1.5 rounded"
            title="Aktualisieren"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* States */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
          <Loader2 className="animate-spin" size={22} />
          <span>Lade Rechnungen...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-red-700 font-medium">{error}</p>
            <p className="text-red-500 text-sm mt-1">
              Backend starten:{' '}
              <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono text-xs">
                uvicorn app.main:app --port 8001 --reload
              </code>
            </p>
          </div>
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="mx-auto mb-4 text-gray-300" size={48} />
          <p className="text-gray-500 font-medium mb-1">Noch keine Rechnungen vorhanden</p>
          <p className="text-gray-400 text-sm mb-6">
            Starten Sie mit OCR Upload oder manueller Eingabe
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/ocr"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              OCR Upload
            </Link>
            <Link
              href="/manual"
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Manuell eingeben
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    'Rechnung',
                    'Quelle',
                    'Verkäufer',
                    'Käufer',
                    'Netto',
                    'Brutto',
                    'Status',
                    'Datum',
                    'Aktionen',
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-gray-50/70 transition-colors group"
                  >
                    {/* Rechnung */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800">
                        {inv.invoice_number || '—'}
                      </p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        {inv.invoice_id?.slice(0, 22)}
                      </p>
                    </td>

                    {/* Quelle */}
                    <td className="px-4 py-3">
                      <SourceBadge source={inv.source_type} />
                      {inv.ocr_confidence != null && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {Math.round(inv.ocr_confidence)}% conf.
                        </p>
                      )}
                    </td>

                    {/* Verkäufer */}
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[140px]">
                      <p className="truncate">{inv.seller_name || '—'}</p>
                    </td>

                    {/* Käufer */}
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[140px]">
                      <p className="truncate">{inv.buyer_name || '—'}</p>
                    </td>

                    {/* Netto */}
                    <td className="px-4 py-3 text-sm text-gray-600 text-right tabular-nums whitespace-nowrap">
                      {inv.net_amount != null ? `${inv.net_amount.toFixed(2)} €` : '—'}
                    </td>

                    {/* Brutto */}
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right tabular-nums whitespace-nowrap">
                      {inv.gross_amount != null ? `${inv.gross_amount.toFixed(2)} €` : '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.validation_status} />
                    </td>

                    {/* Datum */}
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {inv.invoice_date || '—'}
                    </td>

                    {/* Aktionen */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Generate XML button (only if not yet generated) */}
                        {inv.validation_status !== 'xrechnung_generated' && (
                          <button
                            onClick={() => handleGenerateXML(inv.invoice_id)}
                            disabled={generatingId === inv.invoice_id}
                            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 transition-colors whitespace-nowrap font-medium"
                          >
                            {generatingId === inv.invoice_id ? (
                              <Loader2 className="animate-spin inline" size={12} />
                            ) : (
                              'XML erstellen'
                            )}
                          </button>
                        )}

                        {/* Download XML button */}
                        {inv.xrechnung_available && (
                          <a
                            href={`${API_BASE}/api/invoices/${inv.invoice_id}/download-xrechnung`}
                            className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-2 py-1 rounded transition-colors font-medium whitespace-nowrap border border-green-200"
                            download
                            title="XRechnung XML herunterladen"
                          >
                            <Download size={12} /> XML
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}
