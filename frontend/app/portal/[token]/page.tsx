'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface PortalInvoice {
  invoice_number: string
  invoice_date: string | null
  due_date: string | null
  seller_name: string
  seller_address: string | null
  seller_vat_id: string | null
  buyer_name: string
  buyer_address: string | null
  buyer_vat_id: string | null
  net_amount: number
  tax_amount: number
  gross_amount: number
  tax_rate: number
  currency: string
  line_items: Array<{
    description: string
    quantity: number
    unit_price?: number
    price?: number
    total?: number
  }>
  payment_status: string
  iban: string | null
  payment_account_name: string | null
  expires_at: string | null
}

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

export default function PortalPage() {
  const params = useParams()
  const token = params?.token as string
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  useEffect(() => {
    if (!token) return
    fetch(`${apiBase}/api/portal/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Link nicht gefunden oder abgelaufen')
        return r.json()
      })
      .then(data => {
        setInvoice(data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [token, apiBase])

  const confirmPayment = async () => {
    setConfirming(true)
    try {
      const r = await fetch(`${apiBase}/api/portal/${token}/confirm-payment`, {
        method: 'POST',
      })
      if (r.ok) {
        setPaymentConfirmed(true)
        if (invoice) setInvoice({ ...invoice, payment_status: 'paid' })
      }
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
      }}>
        <p style={{ color: '#64748b' }}>Rechnung wird geladen…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
      }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: '#ef4444', fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {error}
          </p>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Der Link ist möglicherweise abgelaufen oder wurde widerrufen.
          </p>
        </div>
      </div>
    )
  }

  if (!invoice) return null

  const isPaid = invoice.payment_status === 'paid' || paymentConfirmed
  const isOverdue = invoice.payment_status === 'overdue'
  const statusColor = isPaid ? '#16a34a' : isOverdue ? '#dc2626' : '#d97706'
  const statusLabel = isPaid ? 'Bezahlt' : isOverdue ? 'Überfällig' : 'Offen'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f1f5f9',
      fontFamily: 'system-ui, sans-serif',
      padding: '2rem 1rem',
    }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}>
          <div>
            <p style={{
              fontSize: '0.75rem',
              color: '#64748b',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              RechnungsWerk
            </p>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Ihre Rechnung
            </h1>
          </div>
          <span style={{
            padding: '0.375rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: isPaid ? '#dcfce7' : isOverdue ? '#fee2e2' : '#fef3c7',
            color: statusColor,
          }}>
            {statusLabel}
          </span>
        </div>

        {/* Invoice card */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          padding: '2rem',
          marginBottom: '1.5rem',
        }}>

          {/* Seller / Buyer columns */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}>
            <div>
              <p style={{
                fontSize: '0.75rem',
                color: '#64748b',
                marginBottom: '0.25rem',
                textTransform: 'uppercase',
              }}>
                Rechnungssteller
              </p>
              <p style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.seller_name}</p>
              {invoice.seller_address && (
                <p style={{ fontSize: '0.875rem', color: '#475569', whiteSpace: 'pre-line' }}>
                  {invoice.seller_address}
                </p>
              )}
              {invoice.seller_vat_id && (
                <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  USt-ID: {invoice.seller_vat_id}
                </p>
              )}
            </div>
            <div>
              <p style={{
                fontSize: '0.75rem',
                color: '#64748b',
                marginBottom: '0.25rem',
                textTransform: 'uppercase',
              }}>
                Rechnungsempfänger
              </p>
              <p style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.buyer_name}</p>
              {invoice.buyer_address && (
                <p style={{ fontSize: '0.875rem', color: '#475569', whiteSpace: 'pre-line' }}>
                  {invoice.buyer_address}
                </p>
              )}
            </div>
          </div>

          {/* Invoice metadata row */}
          <div style={{
            display: 'flex',
            gap: '2rem',
            padding: '1rem',
            background: '#f8fafc',
            borderRadius: '8px',
            marginBottom: '2rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Rechnungsnummer</p>
              <p style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.invoice_number}</p>
            </div>
            {invoice.invoice_date && (
              <div>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Datum</p>
                <p style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.invoice_date}</p>
              </div>
            )}
            {invoice.due_date && (
              <div>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Fällig am</p>
                <p style={{ fontWeight: 600, color: isOverdue ? '#dc2626' : '#0f172a' }}>
                  {invoice.due_date}
                </p>
              </div>
            )}
          </div>

          {/* Line items table */}
          {invoice.line_items && invoice.line_items.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: '#64748b', fontWeight: 500 }}>
                      Beschreibung
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0', color: '#64748b', fontWeight: 500 }}>
                      Menge
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0', color: '#64748b', fontWeight: 500 }}>
                      Preis
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0', color: '#64748b', fontWeight: 500 }}>
                      Gesamt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.line_items.map((item, i) => {
                    const qty = Number(item.quantity || 1)
                    const price = Number(item.unit_price || item.price || 0)
                    const total = Number(item.total || qty * price)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 0', color: '#0f172a' }}>
                          {item.description}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem 0', color: '#475569' }}>
                          {qty}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem 0', color: '#475569' }}>
                          {fmt(price, invoice.currency)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '0.75rem 0', fontWeight: 500, color: '#0f172a' }}>
                          {fmt(total, invoice.currency)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ minWidth: '240px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#475569',
                }}>
                  <span>Nettobetrag</span>
                  <span>{fmt(invoice.net_amount, invoice.currency)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem',
                  fontSize: '0.875rem',
                  color: '#475569',
                }}>
                  <span>MwSt. ({invoice.tax_rate}%)</span>
                  <span>{fmt(invoice.tax_amount, invoice.currency)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  borderTop: '2px solid #e2e8f0',
                  paddingTop: '0.75rem',
                }}>
                  <span>Gesamtbetrag</span>
                  <span>{fmt(invoice.gross_amount, invoice.currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bank details */}
          {invoice.iban && (
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#f0fdf4',
              borderRadius: '8px',
              borderLeft: '3px solid #16a34a',
            }}>
              <p style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600, marginBottom: '0.25rem' }}>
                Bankverbindung
              </p>
              {invoice.payment_account_name && (
                <p style={{ fontSize: '0.875rem', color: '#166534' }}>
                  {invoice.payment_account_name}
                </p>
              )}
              <p style={{ fontSize: '0.875rem', color: '#166534', fontFamily: 'monospace' }}>
                {invoice.iban}
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <a
            href={`${apiBase}/api/portal/${token}/download-pdf`}
            download
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '0.875rem',
              background: '#14b8a6',
              color: 'white',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            PDF herunterladen
          </a>
          <a
            href={`${apiBase}/api/portal/${token}/download-xml`}
            download
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '0.875rem',
              background: 'white',
              color: '#0f172a',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.875rem',
              border: '1px solid #e2e8f0',
            }}
          >
            XRechnung (XML)
          </a>
          {!isPaid && (
            <button
              onClick={confirmPayment}
              disabled={confirming}
              style={{
                flex: 1,
                minWidth: '160px',
                padding: '0.875rem',
                background: confirming ? '#d1d5db' : '#16a34a',
                color: 'white',
                borderRadius: '8px',
                fontWeight: 600,
                border: 'none',
                cursor: confirming ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
              }}
            >
              {confirming ? 'Bestätigung…' : 'Zahlung bestätigen'}
            </button>
          )}
          {isPaid && (
            <div style={{
              flex: 1,
              minWidth: '160px',
              padding: '0.875rem',
              background: '#dcfce7',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#16a34a',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}>
              Zahlung bestätigt ✓
            </div>
          )}
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          marginTop: '2rem',
          fontSize: '0.75rem',
          color: '#94a3b8',
        }}>
          Bereitgestellt von{' '}
          <a href="https://rechnungswerk.io" style={{ color: '#14b8a6' }}>
            RechnungsWerk
          </a>
          {invoice.expires_at &&
            ` · Link gültig bis ${new Date(invoice.expires_at).toLocaleDateString('de-DE')}`
          }
        </p>
      </div>
    </div>
  )
}
