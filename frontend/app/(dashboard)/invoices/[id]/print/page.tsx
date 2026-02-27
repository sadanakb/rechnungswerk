'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getInvoice, type InvoiceDetail } from '@/lib/api'

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

function formatQuantity(qty: number | null | undefined): string {
  if (qty == null) return '—'
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(qty)
}

function computeDueDate(invoice: InvoiceDetail): string {
  if (invoice.due_date) return formatDate(invoice.due_date)
  // Fallback: invoice_date + 30 days
  if (invoice.invoice_date) {
    const d = new Date(invoice.invoice_date)
    d.setDate(d.getDate() + 30)
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return '—'
}

// ---------------------------------------------------------------------------
// Print page
// ---------------------------------------------------------------------------

export default function InvoicePrintPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = typeof params.id === 'string' ? params.id : (Array.isArray(params.id) ? params.id[0] : '')

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial, sans-serif', color: '#6b7280' }}>
        Rechnung wird geladen...
      </div>
    )
  }

  if (notFound || !invoice) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial, sans-serif', gap: '12px' }}>
        <p style={{ color: '#374151', fontWeight: 600 }}>Rechnung nicht gefunden</p>
        <button
          onClick={() => router.back()}
          style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
        >
          Zuruck
        </button>
      </div>
    )
  }

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : []
  const dueDate = computeDueDate(invoice)

  return (
    <>
      {/* ===== Print CSS ===== */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: #fff; }
          .invoice-document { border: none !important; box-shadow: none !important; }
          @page { margin: 10mm; }
        }
        @media screen {
          body { background: #f3f4f6; }
        }
        * { box-sizing: border-box; }
      `}</style>

      {/* ===== Screen-only action bar ===== */}
      <div
        className="no-print"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 500,
            color: '#374151',
            background: '#f9fafb',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          ← Zurück
        </button>

        <span style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>
          Druckansicht · {invoice.invoice_number}
        </span>

        <button
          onClick={() => window.print()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 600,
            color: '#ffffff',
            background: '#0d9488',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Drucken
        </button>
      </div>

      {/* ===== Page wrapper ===== */}
      <div
        style={{
          padding: '32px 16px 64px',
          minHeight: '100vh',
          backgroundColor: '#f3f4f6',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* ===== A4 invoice document ===== */}
        <div
          className="invoice-document"
          style={{
            maxWidth: '800px',
            margin: '0 auto',
            backgroundColor: '#ffffff',
            color: '#000000',
            border: '1px solid #e5e7eb',
            borderRadius: '4px',
            padding: '40px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}
        >

          {/* ===== TOP ROW: Company name left, RECHNUNG title right ===== */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
            {/* Seller / company block */}
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                {invoice.seller_name || 'Unbekannter Absender'}
              </div>
              {invoice.seller_address && (
                <div style={{ fontSize: '13px', color: '#4b5563', whiteSpace: 'pre-line', lineHeight: 1.5, marginBottom: '4px' }}>
                  {invoice.seller_address}
                </div>
              )}
              {invoice.seller_vat_id && (
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  USt-IdNr.: <span style={{ fontFamily: 'monospace' }}>{invoice.seller_vat_id}</span>
                </div>
              )}
            </div>

            {/* RECHNUNG title block */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#0d9488', letterSpacing: '-0.5px', lineHeight: 1 }}>
                RECHNUNG
              </div>
              <div style={{ fontSize: '14px', color: '#374151', marginTop: '8px' }}>
                Nr. {invoice.invoice_number}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                Datum: {formatDate(invoice.invoice_date)}
              </div>
              {invoice.due_date && (
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                  Fällig: {formatDate(invoice.due_date)}
                </div>
              )}
            </div>
          </div>

          {/* ===== Divider ===== */}
          <div style={{ borderTop: '2px solid #0d9488', marginBottom: '24px' }} />

          {/* ===== Sender / Buyer two-column info ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
            {/* Absender */}
            <div style={{ padding: '16px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: '8px' }}>
                Absender
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                {invoice.seller_name || '—'}
              </div>
              {invoice.seller_address && (
                <div style={{ fontSize: '12px', color: '#4b5563', whiteSpace: 'pre-line', lineHeight: 1.5, marginBottom: '4px' }}>
                  {invoice.seller_address}
                </div>
              )}
              {invoice.seller_vat_id && (
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  USt-IdNr.: <span style={{ fontFamily: 'monospace' }}>{invoice.seller_vat_id}</span>
                </div>
              )}
              {invoice.iban && (
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                  IBAN: <span style={{ fontFamily: 'monospace' }}>{invoice.iban}</span>
                </div>
              )}
            </div>

            {/* Rechnungsempfänger */}
            <div style={{ padding: '16px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: '8px' }}>
                Rechnungsempfanger
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                {invoice.buyer_name || '—'}
              </div>
              {invoice.buyer_address && (
                <div style={{ fontSize: '12px', color: '#4b5563', whiteSpace: 'pre-line', lineHeight: 1.5, marginBottom: '4px' }}>
                  {invoice.buyer_address}
                </div>
              )}
              {invoice.buyer_vat_id && (
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  USt-IdNr.: <span style={{ fontFamily: 'monospace' }}>{invoice.buyer_vat_id}</span>
                </div>
              )}
              {invoice.buyer_reference && (
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                  Leitweg-ID: <span style={{ fontFamily: 'monospace' }}>{invoice.buyer_reference}</span>
                </div>
              )}
            </div>
          </div>

          {/* ===== Meta row: Leistungszeitraum / Zahlungsziel ===== */}
          <div
            style={{
              display: 'flex',
              gap: '32px',
              padding: '12px 16px',
              backgroundColor: '#f0fdfa',
              border: '1px solid #99f6e4',
              borderRadius: '4px',
              marginBottom: '28px',
              fontSize: '13px',
              color: '#134e4a',
            }}
          >
            <div>
              <span style={{ fontWeight: 600 }}>Rechnungsdatum:</span>{' '}
              {formatDate(invoice.invoice_date)}
            </div>
            <div>
              <span style={{ fontWeight: 600 }}>Zahlungsziel:</span>{' '}
              {dueDate}
            </div>
            <div>
              <span style={{ fontWeight: 600 }}>Wahrung:</span>{' '}
              {invoice.currency || 'EUR'}
            </div>
          </div>

          {/* ===== Line items table ===== */}
          <div style={{ marginBottom: '28px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#0d9488', color: '#ffffff' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', width: '40px' }}>
                    Pos.
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Beschreibung
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', width: '70px' }}>
                    Menge
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', width: '100px' }}>
                    Einzelpreis
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', width: '70px' }}>
                    MwSt
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', width: '110px' }}>
                    Gesamt (netto)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length > 0 ? (
                  lineItems.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      <td style={{ padding: '10px 12px', color: '#9ca3af', fontFamily: 'monospace', fontSize: '12px' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#111827', fontWeight: 500 }}>
                        {item.description}
                        {item.unit && item.unit !== 'Stk.' && (
                          <span style={{ color: '#6b7280', fontSize: '11px', marginLeft: '4px' }}>({item.unit})</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>
                        {formatQuantity(item.quantity)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>
                        {formatCurrency(item.unit_price, invoice.currency)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>
                        {item.tax_rate != null ? `${item.tax_rate} %` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#111827', fontWeight: 600 }}>
                        {formatCurrency(item.net_amount, invoice.currency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: '20px 12px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}
                    >
                      Keine Positionen vorhanden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ===== Totals ===== */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
            <div style={{ width: '280px' }}>
              {/* Nettobetrag */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb', fontSize: '14px' }}>
                <span style={{ color: '#6b7280' }}>Nettobetrag</span>
                <span style={{ color: '#111827' }}>{formatCurrency(invoice.net_amount, invoice.currency)}</span>
              </div>
              {/* MwSt */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb', fontSize: '14px' }}>
                <span style={{ color: '#6b7280' }}>
                  MwSt {invoice.tax_rate != null ? `(${invoice.tax_rate} %)` : ''}
                </span>
                <span style={{ color: '#111827' }}>{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
              </div>
              {/* Bruttobetrag */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  marginTop: '4px',
                  backgroundColor: '#0d9488',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                <span>Bruttobetrag</span>
                <span>{formatCurrency(invoice.gross_amount, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {/* ===== Divider ===== */}
          <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: '24px' }} />

          {/* ===== Payment section ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
            {/* Bankverbindung */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: '10px' }}>
                Bankverbindung
              </div>
              {invoice.payment_account_name && (
                <div style={{ display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ color: '#6b7280', minWidth: '100px' }}>Kontoinhaber</span>
                  <span style={{ color: '#111827', fontWeight: 500 }}>{invoice.payment_account_name}</span>
                </div>
              )}
              {invoice.iban && (
                <div style={{ display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ color: '#6b7280', minWidth: '100px' }}>IBAN</span>
                  <span style={{ color: '#111827', fontFamily: 'monospace', fontSize: '12px' }}>{invoice.iban}</span>
                </div>
              )}
              {invoice.bic && (
                <div style={{ display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ color: '#6b7280', minWidth: '100px' }}>BIC</span>
                  <span style={{ color: '#111827', fontFamily: 'monospace' }}>{invoice.bic}</span>
                </div>
              )}
              {!invoice.iban && !invoice.bic && !invoice.payment_account_name && (
                <div style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>
                  Keine Bankdaten hinterlegt
                </div>
              )}
            </div>

            {/* Zahlungshinweis */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: '10px' }}>
                Zahlungshinweis
              </div>
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>
                Bitte uberweisen Sie den Betrag von{' '}
                <strong>{formatCurrency(invoice.gross_amount, invoice.currency)}</strong>{' '}
                bis spatestens{' '}
                <strong>{dueDate}</strong>{' '}
                unter Angabe der Rechnungsnummer{' '}
                <strong>{invoice.invoice_number}</strong>.
              </div>
            </div>
          </div>

          {/* ===== Footer ===== */}
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '16px',
              textAlign: 'center',
              fontSize: '11px',
              color: '#9ca3af',
            }}
          >
            Generiert mit RechnungsWerk · rechnungswerk.de
          </div>

        </div>
      </div>
    </>
  )
}
