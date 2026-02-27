'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Euro,
  FileWarning,
  RefreshCw,
  Send,
  X,
} from 'lucide-react'
import {
  getOverdueInvoices,
  getMahnungen,
  createMahnung,
  updateMahnungStatus,
  getErrorMessage,
  type OverdueInvoice,
  type MahnungRecord,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('de-DE')
  } catch {
    return d
  }
}

const fmtDateTime = (d: string) => {
  try {
    return new Date(d).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return d
  }
}

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

interface BadgeConfig {
  label: string
  bg: string
  text: string
}

function getMahnBadge(count: number): BadgeConfig {
  switch (count) {
    case 0:
      return { label: 'Ueberfaellig', bg: 'rgb(254 243 199)', text: 'rgb(161 98 7)' }
    case 1:
      return { label: 'Zahlungserinnerung', bg: 'rgb(255 237 213)', text: 'rgb(194 65 12)' }
    case 2:
      return { label: '1. Mahnung', bg: 'rgb(254 215 170)', text: 'rgb(194 65 12)' }
    default:
      return { label: 'Letzte Mahnung', bg: 'rgb(254 202 202)', text: 'rgb(185 28 28)' }
  }
}

const MAHNUNG_LEVEL_LABELS: Record<number, string> = {
  1: 'Zahlungserinnerung',
  2: '1. Mahnung',
  3: '2. Mahnung (letzte)',
}

// ---------------------------------------------------------------------------
// Status badge for Mahnung records
// ---------------------------------------------------------------------------

const STATUS_BADGE_CONFIG: Record<string, BadgeConfig> = {
  created: { label: 'Erstellt', bg: 'rgb(var(--muted))', text: 'rgb(var(--foreground-muted))' },
  sent: { label: 'Versendet', bg: 'rgb(219 234 254)', text: 'rgb(29 78 216)' },
  paid: { label: 'Bezahlt', bg: 'rgb(220 252 231)', text: 'rgb(22 101 52)' },
  cancelled: { label: 'Storniert', bg: 'rgb(254 226 226)', text: 'rgb(185 28 28)' },
}

function MahnungStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE_CONFIG[status] ?? {
    label: status,
    bg: 'rgb(var(--muted))',
    text: 'rgb(var(--foreground-muted))',
  }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

interface ToastProps {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}

function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bg = type === 'success' ? 'rgb(220 252 231)' : 'rgb(254 226 226)'
  const color = type === 'success' ? 'rgb(22 101 52)' : 'rgb(153 27 27)'

  return (
    <div
      className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl shadow-lg border px-4 py-3 flex items-start gap-3 animate-in slide-in-from-bottom-4"
      style={{ backgroundColor: bg, color, borderColor: 'transparent' }}
    >
      <span className="text-sm flex-1">{message}</span>
      <button onClick={onClose} className="shrink-0 mt-0.5 opacity-70 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ backgroundColor: 'rgb(var(--muted))' }}
      >
        <FileWarning size={24} style={{ color: 'rgb(var(--foreground-muted))' }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
        Keine ueberfaelligen Rechnungen
      </p>
      <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: 'rgb(var(--foreground-muted))' }}>
        Alle Rechnungen wurden rechtzeitig bezahlt. Sobald eine Rechnung ihr Faelligkeitsdatum ueberschreitet, erscheint sie hier.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview cards
// ---------------------------------------------------------------------------

interface OverviewCardsProps {
  invoices: OverdueInvoice[]
}

function OverviewCards({ invoices }: OverviewCardsProps) {
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.gross_amount, 0)
  const avgDays =
    invoices.length > 0
      ? Math.round(invoices.reduce((sum, inv) => sum + inv.days_overdue, 0) / invoices.length)
      : 0

  const cards = [
    {
      label: 'Ueberfaellige Rechnungen',
      value: String(invoices.length),
      icon: AlertTriangle,
      iconColor: 'rgb(234 179 8)',
    },
    {
      label: 'Offener Gesamtbetrag',
      value: fmt(totalAmount),
      icon: Euro,
      iconColor: 'rgb(var(--primary))',
    },
    {
      label: 'Durchschnitt Tage ueberfaellig',
      value: String(avgDays),
      icon: Clock,
      iconColor: 'rgb(239 68 68)',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="rounded-xl border p-5 flex items-center gap-4"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgb(var(--muted))' }}
            >
              <Icon size={20} style={{ color: card.iconColor }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: 'rgb(var(--foreground-muted))' }}>
                {card.label}
              </p>
              <p className="text-xl font-bold mt-0.5" style={{ color: 'rgb(var(--foreground))' }}>
                {card.value}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expandable row detail — Mahnung history with status actions
// ---------------------------------------------------------------------------

interface MahnHistoryProps {
  invoiceId: string
  onStatusChange: (message: string, type: 'success' | 'error') => void
}

function MahnHistory({ invoiceId, onStatusChange }: MahnHistoryProps) {
  const [mahnungen, setMahnungen] = useState<MahnungRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadMahnungen = useCallback(async () => {
    try {
      const data = await getMahnungen(invoiceId)
      setMahnungen(data)
    } catch {
      // silently handle -- error is non-critical
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getMahnungen(invoiceId)
        if (!cancelled) setMahnungen(data)
      } catch {
        // silently handle
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [invoiceId])

  const handleStatusUpdate = async (mahnungId: string, newStatus: 'paid' | 'cancelled') => {
    setActionLoading(mahnungId)
    try {
      await updateMahnungStatus(mahnungId, newStatus)
      const label = newStatus === 'paid' ? 'als bezahlt markiert' : 'storniert'
      onStatusChange(`Mahnung wurde ${label}.`, 'success')
      // Reload mahnungen to reflect updated status
      await loadMahnungen()
    } catch (err) {
      onStatusChange(
        getErrorMessage(err, 'Status konnte nicht geaendert werden'),
        'error',
      )
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-4">
        <div className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: 'rgb(var(--muted))' }} />
      </div>
    )
  }

  if (mahnungen.length === 0) {
    return (
      <div className="px-6 py-4">
        <p className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Noch keine Mahnungen fuer diese Rechnung erstellt.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      <p className="text-xs font-semibold mb-3" style={{ color: 'rgb(var(--foreground))' }}>
        Mahnverlauf
      </p>
      <div className="space-y-2">
        {mahnungen.map((m) => {
          const isTerminal = m.status === 'paid' || m.status === 'cancelled'
          const isUpdating = actionLoading === m.mahnung_id

          return (
            <div
              key={m.mahnung_id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 text-xs"
              style={{
                backgroundColor: 'rgb(var(--background))',
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground-muted))',
              }}
            >
              <span className="font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                {MAHNUNG_LEVEL_LABELS[m.level] ?? `Stufe ${m.level}`}
              </span>
              <span>Gebuehr: {fmt(m.fee)}</span>
              <span>Zinsen: {fmt(m.interest)}</span>
              <span className="font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                Gesamt: {fmt(m.total_due)}
              </span>
              <span>{fmtDateTime(m.created_at)}</span>
              {m.sent_at && (
                <span className="text-[10px]" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  Versendet: {fmtDateTime(m.sent_at)}
                </span>
              )}
              <MahnungStatusBadge status={m.status} />

              {/* Action buttons for non-terminal statuses */}
              {!isTerminal && (
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => handleStatusUpdate(m.mahnung_id, 'paid')}
                    disabled={isUpdating}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ backgroundColor: 'rgb(220 252 231)', color: 'rgb(22 101 52)' }}
                    title="Als bezahlt markieren"
                  >
                    {isUpdating ? (
                      <RefreshCw size={10} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={10} />
                    )}
                    Bezahlt
                  </button>
                  <button
                    onClick={() => handleStatusUpdate(m.mahnung_id, 'cancelled')}
                    disabled={isUpdating}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ backgroundColor: 'rgb(254 226 226)', color: 'rgb(185 28 28)' }}
                    title="Stornieren"
                  >
                    {isUpdating ? (
                      <RefreshCw size={10} className="animate-spin" />
                    ) : (
                      <Ban size={10} />
                    )}
                    Stornieren
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MahnwesenPage() {
  const [invoices, setInvoices] = useState<OverdueInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ---------------------------------------------------------------------------
  // Load overdue invoices
  // ---------------------------------------------------------------------------

  const loadOverdue = useCallback(async () => {
    try {
      setError(null)
      const data = await getOverdueInvoices()
      setInvoices(data)
    } catch (err) {
      setError(getErrorMessage(err, 'Ueberfaellige Rechnungen konnten nicht geladen werden'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOverdue()
  }, [loadOverdue])

  // ---------------------------------------------------------------------------
  // Create Mahnung
  // ---------------------------------------------------------------------------

  const handleCreateMahnung = async (invoiceId: string) => {
    setActionLoading(invoiceId)
    try {
      await createMahnung(invoiceId)
      setToast({ message: 'Mahnung wurde erfolgreich erstellt.', type: 'success' })
      // Update the local state to reflect new mahnung_count
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.invoice_id === invoiceId
            ? { ...inv, mahnung_count: inv.mahnung_count + 1 }
            : inv,
        ),
      )
      // If expanded, collapse and re-expand to refresh history
      if (expandedId === invoiceId) {
        setExpandedId(null)
        setTimeout(() => setExpandedId(invoiceId), 50)
      }
    } catch (err) {
      setToast({
        message: getErrorMessage(err, 'Mahnung konnte nicht erstellt werden'),
        type: 'error',
      })
    } finally {
      setActionLoading(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Handle status change from MahnHistory
  // ---------------------------------------------------------------------------

  const handleStatusChange = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Mahnwesen
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Ueberfaellige Rechnungen verwalten und Mahnungen erstellen
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true)
            loadOverdue()
          }}
          title="Aktualisieren"
          className="p-2 rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground-muted))' }}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm flex items-center justify-between"
          style={{ backgroundColor: 'rgb(254 226 226)', color: 'rgb(185 28 28)' }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-lg leading-none">
            &times;
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="space-y-4">
          {/* Card skeletons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border h-24 animate-pulse"
                style={{ backgroundColor: 'rgb(var(--muted))', borderColor: 'rgb(var(--border))' }}
              />
            ))}
          </div>
          {/* Table skeleton */}
          <div
            className="rounded-xl border h-64 animate-pulse"
            style={{ backgroundColor: 'rgb(var(--muted))', borderColor: 'rgb(var(--border))' }}
          />
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Overview cards */}
          <OverviewCards invoices={invoices} />

          {/* Table */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            {/* Table header */}
            <div
              className="hidden md:grid grid-cols-[1fr_1.2fr_1fr_0.8fr_0.6fr_1fr_1fr] gap-4 px-6 py-3 text-xs font-semibold uppercase tracking-wider border-b"
              style={{
                color: 'rgb(var(--foreground-muted))',
                borderColor: 'rgb(var(--border))',
                backgroundColor: 'rgb(var(--muted))',
              }}
            >
              <span>Rechnungsnr.</span>
              <span>Kunde</span>
              <span>Betrag</span>
              <span>Faellig seit</span>
              <span>Tage</span>
              <span>Mahnstufe</span>
              <span>Aktionen</span>
            </div>

            {/* Table rows */}
            {invoices.map((inv) => {
              const badge = getMahnBadge(inv.mahnung_count)
              const isExpanded = expandedId === inv.invoice_id
              const isCreating = actionLoading === inv.invoice_id
              const maxedOut = inv.mahnung_count >= 3

              return (
                <div key={inv.invoice_id}>
                  {/* Row */}
                  <div
                    className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_1fr_0.8fr_0.6fr_1fr_1fr] gap-2 md:gap-4 px-6 py-4 items-center border-b cursor-pointer transition-colors"
                    style={{ borderColor: 'rgb(var(--border))' }}
                    onClick={() => setExpandedId(isExpanded ? null : inv.invoice_id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgb(var(--muted))'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {/* Invoice number */}
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp size={14} style={{ color: 'rgb(var(--foreground-muted))' }} />
                      ) : (
                        <ChevronDown size={14} style={{ color: 'rgb(var(--foreground-muted))' }} />
                      )}
                      <span className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                        {inv.invoice_number || '-'}
                      </span>
                    </div>

                    {/* Buyer / Kunde */}
                    <span className="text-sm truncate" style={{ color: 'rgb(var(--foreground))' }}>
                      <span className="md:hidden text-xs font-medium mr-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Kunde:
                      </span>
                      {inv.buyer_name || '-'}
                    </span>

                    {/* Amount */}
                    <span className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                      <span className="md:hidden text-xs font-medium mr-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Betrag:
                      </span>
                      {fmt(inv.gross_amount)}
                    </span>

                    {/* Due date */}
                    <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                      <span className="md:hidden text-xs font-medium mr-1">Faellig:</span>
                      {fmtDate(inv.due_date)}
                    </span>

                    {/* Days overdue */}
                    <span className="text-sm font-semibold" style={{ color: 'rgb(239 68 68)' }}>
                      <span className="md:hidden text-xs font-medium mr-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Tage:
                      </span>
                      {inv.days_overdue}
                    </span>

                    {/* Mahnstufe badge */}
                    <div>
                      <span
                        className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: badge.bg, color: badge.text }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCreateMahnung(inv.invoice_id)
                        }}
                        disabled={isCreating || maxedOut}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: maxedOut ? 'rgb(var(--muted))' : 'rgb(var(--primary))',
                          color: maxedOut ? 'rgb(var(--foreground-muted))' : '#fff',
                        }}
                        title={
                          maxedOut
                            ? 'Maximale Mahnstufe erreicht'
                            : 'Naechste Mahnstufe erstellen'
                        }
                      >
                        {isCreating ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <Send size={12} />
                        )}
                        {maxedOut ? 'Maximum' : 'Neue Mahnung'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      className="border-b"
                      style={{
                        borderColor: 'rgb(var(--border))',
                        backgroundColor: 'rgb(var(--muted))',
                      }}
                    >
                      <MahnHistory
                        invoiceId={inv.invoice_id}
                        onStatusChange={handleStatusChange}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Info box */}
          <div
            className="rounded-xl border p-5"
            style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
          >
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'rgb(var(--foreground))' }}>
              Mahnstufen-Uebersicht
            </h3>
            <div className="space-y-2 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
              <p>
                <strong style={{ color: 'rgb(var(--foreground))' }}>Stufe 1 -- Zahlungserinnerung:</strong>{' '}
                Gebuehr 5,00 EUR, keine Verzugszinsen.
              </p>
              <p>
                <strong style={{ color: 'rgb(var(--foreground))' }}>Stufe 2 -- 1. Mahnung:</strong>{' '}
                Gebuehr 10,00 EUR + 5% Verzugszinsen auf den Rechnungsbetrag.
              </p>
              <p>
                <strong style={{ color: 'rgb(var(--foreground))' }}>Stufe 3 -- 2. Mahnung (letzte):</strong>{' '}
                Gebuehr 15,00 EUR + 8% Verzugszinsen. Danach sind keine weiteren Mahnungen moeglich.
              </p>
            </div>
          </div>
        </>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
