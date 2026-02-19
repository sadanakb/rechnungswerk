'use client'
import { useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react'
import { createInvoice, generateXRechnung, type InvoiceCreate } from '@/lib/api'

type FormData = InvoiceCreate

// ---------------------------------------------------------------------------
// Live totals helper (pure, used in render)
// ---------------------------------------------------------------------------
function calcTotals(
  lineItems: { quantity?: number; unit_price?: number }[],
  taxRate: number,
) {
  const net = lineItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
  }, 0)
  const tax = net * (taxRate / 100)
  const gross = net + tax
  return { net, tax, gross }
}

// ---------------------------------------------------------------------------
export default function ManualPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ invoiceId: string; downloadUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, control, handleSubmit } = useForm<FormData>({
    defaultValues: {
      invoice_number: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      seller_name: '',
      seller_vat_id: '',
      seller_address: '',
      buyer_name: '',
      buyer_vat_id: '',
      buyer_address: '',
      tax_rate: 19,
      line_items: [{ description: '', quantity: 1, unit_price: 0, net_amount: 0, tax_rate: 19 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' })

  // Live-watch for totals preview
  const watchedItems = useWatch({ control, name: 'line_items' }) ?? []
  const watchedTaxRate = useWatch({ control, name: 'tax_rate' }) ?? 19
  const { net, tax, gross } = calcTotals(watchedItems, watchedTaxRate)

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError(null)
    try {
      // Compute net_amount per line item
      const processedData: FormData = {
        ...data,
        line_items: data.line_items.map((item) => ({
          ...item,
          net_amount: (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
        })),
      }
      const invoice = await createInvoice(processedData)
      const xmlResult = await generateXRechnung(invoice.invoice_id)
      setSuccess({
        invoiceId: invoice.invoice_id,
        downloadUrl:
          xmlResult?.download_url
            ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}${xmlResult.download_url}`
            : `http://localhost:8001/api/invoices/${invoice.invoice_id}/download-xrechnung`,
      })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(e.response?.data?.detail ?? `Fehler: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ------ Success screen ------
  if (success) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center max-w-md w-full">
          <CheckCircle className="mx-auto mb-4 text-green-500" size={48} />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Rechnung erstellt!</h2>
          <p className="text-gray-500 mb-1 text-sm">
            ID:{' '}
            <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">
              {success.invoiceId}
            </code>
          </p>
          <p className="text-gray-400 text-sm mb-6">
            XRechnung 3.0.2 UBL XML wurde generiert.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={success.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              <Download size={16} /> XML herunterladen
            </a>
            <Link
              href="/invoices"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium text-center"
            >
              Zur Rechnungsliste
            </Link>
            <button
              onClick={() => setSuccess(null)}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Neue Rechnung
            </button>
          </div>
        </div>
      </main>
    )
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white'

  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manuelle Eingabe</h1>
          <p className="text-sm text-gray-400">Modus B · XRechnung 3.0.2 UBL XML erstellen</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ---- Rechnungsinfo ---- */}
        <Section title="Rechnungsinformationen">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Rechnungsnummer <BT>BT-1</BT> *
              </label>
              <input
                {...register('invoice_number', { required: true })}
                className={inputClass}
                placeholder="RE-2026-001"
              />
            </div>
            <div>
              <label className={labelClass}>
                Rechnungsdatum <BT>BT-2</BT> *
              </label>
              <input
                type="date"
                {...register('invoice_date', { required: true })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Fälligkeitsdatum <BT>BT-9</BT>
              </label>
              <input type="date" {...register('due_date')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                MwSt-Satz % <BT>BT-119</BT>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                {...register('tax_rate', { valueAsNumber: true })}
                className={inputClass}
              />
            </div>
          </div>
        </Section>

        {/* ---- Verkäufer ---- */}
        <Section title="Verkäufer (Seller)">
          <p className="text-xs text-gray-400 mb-3">BT-27 bis BT-40</p>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>
                Firmenname <BT>BT-27</BT> *
              </label>
              <input
                {...register('seller_name', { required: true })}
                className={inputClass}
                placeholder="Muster GmbH"
              />
            </div>
            <div>
              <label className={labelClass}>
                USt-IdNr. <BT>BT-31</BT> *
                <span className="ml-1 text-xs font-normal text-orange-500">
                  (Pflicht ab XRechnung 3.0.2)
                </span>
              </label>
              <input
                {...register('seller_vat_id', { required: true })}
                className={inputClass}
                placeholder="DE123456789"
              />
            </div>
            <div>
              <label className={labelClass}>
                Adresse <BT>BT-35</BT> *
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (Straße, PLZ Stadt)
                </span>
              </label>
              <textarea
                {...register('seller_address', { required: true })}
                rows={2}
                className={inputClass}
                placeholder="Musterstraße 1, 60311 Frankfurt am Main"
              />
            </div>
          </div>
        </Section>

        {/* ---- Käufer ---- */}
        <Section title="Käufer (Buyer)">
          <p className="text-xs text-gray-400 mb-3">BT-44 bis BT-55</p>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>
                Firmenname <BT>BT-44</BT> *
              </label>
              <input
                {...register('buyer_name', { required: true })}
                className={inputClass}
                placeholder="Kunde AG"
              />
            </div>
            <div>
              <label className={labelClass}>
                USt-IdNr. <BT>BT-48</BT>
                <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                {...register('buyer_vat_id')}
                className={inputClass}
                placeholder="DE987654321"
              />
            </div>
            <div>
              <label className={labelClass}>
                Adresse <BT>BT-50</BT> *
                <span className="ml-1 text-xs font-normal text-gray-400">
                  (Straße, PLZ Stadt)
                </span>
              </label>
              <textarea
                {...register('buyer_address', { required: true })}
                rows={2}
                className={inputClass}
                placeholder="Kundenstraße 5, 10115 Berlin"
              />
            </div>
          </div>
        </Section>

        {/* ---- Positionen ---- */}
        <Section title="Rechnungspositionen (BG-25)">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400">
              Netto-Betrag = Menge × Einzelpreis (live berechnet)
            </p>
            <button
              type="button"
              onClick={() =>
                append({ description: '', quantity: 1, unit_price: 0, net_amount: 0, tax_rate: 19 })
              }
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <Plus size={15} /> Position hinzufügen
            </button>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium uppercase mb-1 px-1">
            <div className="col-span-5">Beschreibung</div>
            <div className="col-span-2 text-center">Menge</div>
            <div className="col-span-3 text-right">Einzelpreis €</div>
            <div className="col-span-2 text-right">Netto €</div>
          </div>

          <div className="space-y-2">
            {fields.map((field, index) => {
              const qty = Number(watchedItems[index]?.quantity) || 0
              const price = Number(watchedItems[index]?.unit_price) || 0
              const lineNet = qty * price
              return (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <input
                      {...register(`line_items.${index}.description`, { required: true })}
                      className={inputClass}
                      placeholder="Beratungsleistung"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      {...register(`line_items.${index}.quantity`, { valueAsNumber: true })}
                      className={`${inputClass} text-center`}
                      placeholder="1"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      {...register(`line_items.${index}.unit_price`, { valueAsNumber: true })}
                      className={`${inputClass} text-right`}
                      placeholder="100.00"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-sm font-medium text-gray-700 tabular-nums">
                      {lineNet.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      className="text-red-400 hover:text-red-600 disabled:opacity-30 transition-colors p-0.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Live totals */}
          <div className="mt-4 border-t border-gray-100 pt-4 space-y-1">
            <TotalRow label="Netto (BT-109)" value={net} />
            <TotalRow label={`MwSt ${watchedTaxRate}% (BT-110)`} value={tax} />
            <TotalRow label="Brutto / Zahlbetrag (BT-112)" value={gross} bold />
          </div>
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Rechnung wird erstellt...
            </>
          ) : (
            'Rechnung erstellen & XRechnung 3.0.2 generieren'
          )}
        </button>
      </form>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function BT({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 text-xs font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
      {children}
    </span>
  )
}

function TotalRow({
  label,
  value,
  bold = false,
}: {
  label: string
  value: number
  bold?: boolean
}) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value.toFixed(2)} €</span>
    </div>
  )
}
