'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Webhook,
  Plus,
  Trash2,
  Send,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react'
import {
  listWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
  getWebhookDeliveries,
  type WebhookSubscription,
  type WebhookDelivery,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_EVENTS = [
  'invoice.created',
  'invoice.validated',
  'invoice.exported',
  'mahnung.sent',
  'supplier.created',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Event Badge
// ---------------------------------------------------------------------------

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  'invoice.created':   { bg: 'rgb(var(--primary-light))',  text: 'rgb(var(--primary))' },
  'invoice.validated': { bg: 'rgba(34,197,94,0.12)',        text: 'rgb(34,197,94)' },
  'invoice.exported':  { bg: 'rgba(59,130,246,0.12)',       text: 'rgb(59,130,246)' },
  'mahnung.sent':      { bg: 'rgba(245,158,11,0.12)',        text: 'rgb(245,158,11)' },
  'supplier.created':  { bg: 'rgba(168,85,247,0.12)',        text: 'rgb(168,85,247)' },
}

function EventBadge({ event }: { event: string }) {
  const style = EVENT_COLORS[event] ?? {
    bg: 'rgb(var(--muted))',
    text: 'rgb(var(--foreground-muted))',
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {event}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Status Badge for deliveries
// ---------------------------------------------------------------------------

function DeliveryStatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase()
  let bg = 'rgb(var(--muted))'
  let color = 'rgb(var(--foreground-muted))'
  if (lower === 'success' || lower === 'delivered') {
    bg = 'rgba(34,197,94,0.12)'
    color = 'rgb(34,197,94)'
  } else if (lower === 'failed' || lower === 'error') {
    bg = 'rgba(239,68,68,0.12)'
    color = 'rgb(239,68,68)'
  } else if (lower === 'pending') {
    bg = 'rgba(245,158,11,0.12)'
    color = 'rgb(245,158,11)'
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: bg, color }}
    >
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastState {
  message: string
  type: 'success' | 'error'
}

function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
        color: toast.type === 'success' ? 'rgb(34,197,94)' : 'rgb(239,68,68)',
      }}
    >
      {toast.message}
      <button onClick={onClose} style={{ color: 'rgb(var(--foreground-muted))' }}>
        <X size={14} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Webhook Modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateWebhookModal({ onClose, onCreated }: CreateModalProps) {
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  const handleCreate = async () => {
    if (!url.trim()) {
      setError('Bitte gib eine URL ein.')
      return
    }
    if (selectedEvents.length === 0) {
      setError('Bitte wähle mindestens ein Event.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await createWebhook({ url: url.trim(), events: selectedEvents })
      setCreatedSecret(result.secret)
      onCreated()
    } catch {
      setError('Webhook konnte nicht erstellt werden.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopySecret = async () => {
    if (!createdSecret) return
    try {
      await navigator.clipboard.writeText(createdSecret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback — do nothing
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Modal box */}
      <div
        className="w-full max-w-lg rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: 'rgb(var(--primary-light))',
                color: 'rgb(var(--primary))',
              }}
            >
              <Webhook size={16} />
            </div>
            <h2 className="text-base font-bold" style={{ color: 'rgb(var(--foreground))' }}>
              Neuen Webhook erstellen
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: 'rgb(var(--foreground-muted))' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'rgb(var(--muted))')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'transparent')
            }
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Secret display — shown after successful creation */}
          {createdSecret ? (
            <div className="space-y-4">
              {/* Warning box */}
              <div
                className="flex items-start gap-3 rounded-xl p-4 border"
                style={{
                  backgroundColor: 'rgba(245,158,11,0.08)',
                  borderColor: 'rgba(245,158,11,0.3)',
                }}
              >
                <AlertTriangle
                  size={18}
                  className="shrink-0 mt-0.5"
                  style={{ color: 'rgb(245,158,11)' }}
                />
                <p className="text-sm font-medium" style={{ color: 'rgb(245,158,11)' }}>
                  Wird nur einmal angezeigt – bitte jetzt speichern! Danach kann dieses
                  Secret nicht mehr abgerufen werden.
                </p>
              </div>

              {/* Secret value */}
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Webhook Secret
                </p>
                <div
                  className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
                  style={{
                    backgroundColor: 'rgb(var(--muted))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <code
                    className="flex-1 text-xs font-mono break-all select-all"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {createdSecret}
                  </code>
                  <button
                    onClick={handleCopySecret}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                    style={{
                      borderColor: 'rgb(var(--border))',
                      backgroundColor: 'rgb(var(--card))',
                      color: copied ? 'rgb(34,197,94)' : 'rgb(var(--foreground))',
                    }}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Kopiert' : 'Kopieren'}
                  </button>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: 'rgb(var(--primary))',
                  color: '#fff',
                }}
              >
                Fertig
              </button>
            </div>
          ) : (
            <>
              {/* URL input */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Endpunkt-URL
                </label>
                <input
                  type="url"
                  placeholder="https://deine-app.de/webhooks/rechnungswerk"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'rgb(var(--background))',
                    borderColor: 'rgb(var(--border))',
                    color: 'rgb(var(--foreground))',
                  }}
                />
              </div>

              {/* Events */}
              <div>
                <p
                  className="text-sm font-medium mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Events abonnieren
                </p>
                <div className="space-y-2">
                  {ALL_EVENTS.map((event) => (
                    <label
                      key={event}
                      className="flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2 border transition-colors"
                      style={{
                        borderColor: selectedEvents.includes(event)
                          ? 'rgb(var(--primary))'
                          : 'rgb(var(--border))',
                        backgroundColor: selectedEvents.includes(event)
                          ? 'rgb(var(--primary-light))'
                          : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(event)}
                        onChange={() => toggleEvent(event)}
                        className="rounded"
                        style={{ accentColor: 'rgb(var(--primary))' }}
                      />
                      <EventBadge event={event} />
                    </label>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm" style={{ color: 'rgb(239,68,68)' }}>
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors"
                  style={{
                    borderColor: 'rgb(var(--border))',
                    color: 'rgb(var(--foreground))',
                    backgroundColor: 'transparent',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'rgb(var(--primary))',
                    color: '#fff',
                  }}
                >
                  {loading ? 'Erstellen...' : 'Erstellen'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deliveries inline panel
// ---------------------------------------------------------------------------

function DeliveriesPanel({ webhookId }: { webhookId: number }) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await getWebhookDeliveries(webhookId)
        setDeliveries(data.slice(0, 10))
      } catch {
        setError('Deliveries konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    })()
  }, [webhookId])

  if (loading) {
    return (
      <div className="px-4 pb-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 rounded-lg animate-pulse"
            style={{ backgroundColor: 'rgb(var(--muted))' }}
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 pb-4">
        <p className="text-xs" style={{ color: 'rgb(239,68,68)' }}>
          {error}
        </p>
      </div>
    )
  }

  if (deliveries.length === 0) {
    return (
      <div className="px-4 pb-4">
        <p className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Noch keine Deliveries vorhanden.
        </p>
      </div>
    )
  }

  return (
    <div
      className="mx-4 mb-4 rounded-xl border overflow-hidden"
      style={{ borderColor: 'rgb(var(--border))' }}
    >
      <table className="w-full text-xs">
        <thead>
          <tr
            style={{
              backgroundColor: 'rgb(var(--muted))',
              borderBottom: '1px solid rgb(var(--border))',
            }}
          >
            {['Event', 'Status', 'HTTP', 'Versuche', 'Zeitstempel'].map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left font-semibold uppercase tracking-wide"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr
              key={d.id}
              className="border-t"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <td className="px-3 py-2 font-mono" style={{ color: 'rgb(var(--foreground))' }}>
                {d.event_type}
              </td>
              <td className="px-3 py-2">
                <DeliveryStatusBadge status={d.status} />
              </td>
              <td className="px-3 py-2 font-mono" style={{ color: 'rgb(var(--foreground-muted))' }}>
                {d.response_code ?? '—'}
              </td>
              <td className="px-3 py-2" style={{ color: 'rgb(var(--foreground-muted))' }}>
                {d.attempts}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono" style={{ color: 'rgb(var(--foreground-muted))' }}>
                {formatDateTime(d.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Webhook Row
// ---------------------------------------------------------------------------

interface WebhookRowProps {
  webhook: WebhookSubscription
  onDeleted: () => void
  onToast: (msg: string, type: 'success' | 'error') => void
}

function WebhookRow({ webhook, onDeleted, onToast }: WebhookRowProps) {
  const [showDeliveries, setShowDeliveries] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [testing, setTesting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`Webhook "${webhook.url}" wirklich löschen?`)) return
    setDeleting(true)
    try {
      await deleteWebhook(webhook.id)
      onDeleted()
      onToast('Webhook gelöscht.', 'success')
    } catch {
      onToast('Webhook konnte nicht gelöscht werden.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await testWebhook(webhook.id)
      onToast('Test-Event erfolgreich gesendet.', 'success')
    } catch {
      onToast('Test-Event konnte nicht gesendet werden.', 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <tr
        className="border-t"
        style={{ borderColor: 'rgb(var(--border))' }}
      >
        {/* URL */}
        <td
          className="px-4 py-3 font-mono text-xs max-w-[220px] truncate"
          style={{ color: 'rgb(var(--foreground))' }}
          title={webhook.url}
        >
          {webhook.url}
        </td>

        {/* Events */}
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {webhook.events.map((e) => (
              <EventBadge key={e} event={e} />
            ))}
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: webhook.is_active
                ? 'rgba(34,197,94,0.12)'
                : 'rgb(var(--muted))',
              color: webhook.is_active
                ? 'rgb(34,197,94)'
                : 'rgb(var(--foreground-muted))',
            }}
          >
            {webhook.is_active ? 'Aktiv' : 'Inaktiv'}
          </span>
        </td>

        {/* Created */}
        <td
          className="px-4 py-3 whitespace-nowrap text-xs font-mono"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {formatDateTime(webhook.created_at)}
        </td>

        {/* Actions */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {/* Test */}
            <button
              onClick={handleTest}
              disabled={testing}
              title="Test senden"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: 'rgb(var(--border))',
                backgroundColor: 'rgb(var(--card))',
                color: 'rgb(var(--foreground))',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'rgb(var(--muted))')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = 'rgb(var(--card))')
              }
            >
              <Send size={12} />
              {testing ? 'Sende...' : 'Test'}
            </button>

            {/* Deliveries toggle */}
            <button
              onClick={() => setShowDeliveries((v) => !v)}
              title="Delivery-Log anzeigen"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{
                borderColor: 'rgb(var(--border))',
                backgroundColor: showDeliveries
                  ? 'rgb(var(--primary-light))'
                  : 'rgb(var(--card))',
                color: showDeliveries
                  ? 'rgb(var(--primary))'
                  : 'rgb(var(--foreground))',
              }}
              onMouseEnter={(e) => {
                if (!showDeliveries)
                  e.currentTarget.style.backgroundColor = 'rgb(var(--muted))'
              }}
              onMouseLeave={(e) => {
                if (!showDeliveries)
                  e.currentTarget.style.backgroundColor = 'rgb(var(--card))'
              }}
            >
              {showDeliveries ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Deliveries
            </button>

            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Webhook löschen"
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: 'rgba(239,68,68,0.3)',
                backgroundColor: 'transparent',
                color: 'rgb(239,68,68)',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = 'transparent')
              }
            >
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>

      {/* Deliveries inline expansion */}
      {showDeliveries && (
        <tr style={{ borderColor: 'rgb(var(--border))' }}>
          <td colSpan={5} className="p-0">
            <div
              style={{
                borderTop: '1px solid rgb(var(--border))',
                backgroundColor: 'rgb(var(--muted) / 0.4)',
              }}
            >
              <p
                className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Letzte Deliveries
              </p>
              <DeliveriesPanel webhookId={webhook.id} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listWebhooks()
      setWebhooks(data)
    } catch {
      setError('Webhooks konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreated = () => {
    load()
  }

  const handleDeleted = () => {
    load()
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: 'rgb(var(--primary-light))',
              color: 'rgb(var(--primary))',
            }}
          >
            <Webhook size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
              Webhooks
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Echtzeit-Benachrichtigungen an externe Endpunkte
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{
            backgroundColor: 'rgb(var(--primary))',
            color: '#fff',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.opacity = '0.9')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.opacity = '1')
          }
        >
          <Plus size={15} />
          Neuer Webhook
        </button>
      </div>

      {/* Info card */}
      <div
        className="rounded-xl border p-4"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Webhooks senden HTTP-POST-Anfragen an deine URL, sobald bestimmte Events in
          RechnungsWerk eintreten. Jede Anfrage enthält einen{' '}
          <code
            className="px-1 py-0.5 rounded text-xs font-mono"
            style={{
              backgroundColor: 'rgb(var(--muted))',
              color: 'rgb(var(--foreground))',
            }}
          >
            X-RW-Signature
          </code>{' '}
          Header zur Verifikation mit deinem Webhook-Secret.
        </p>
      </div>

      {/* Table / States */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg animate-pulse"
                style={{ backgroundColor: 'rgb(var(--muted))' }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: 'rgb(239,68,68)' }}>
              {error}
            </p>
          </div>
        ) : webhooks.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{
                backgroundColor: 'rgb(var(--primary-light))',
                color: 'rgb(var(--primary))',
              }}
            >
              <Webhook size={28} />
            </div>
            <div>
              <p
                className="text-base font-semibold"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Noch keine Webhooks konfiguriert
              </p>
              <p
                className="text-sm mt-1 max-w-md mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Klicke auf &ldquo;Neuer Webhook&rdquo;, gib deine Endpunkt-URL ein und wähle
                die Events aus, die du empfangen möchtest.
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity"
              style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Plus size={15} />
              Ersten Webhook erstellen
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: 'rgb(var(--muted))',
                    borderBottom: '1px solid rgb(var(--border))',
                  }}
                >
                  {['URL', 'Events', 'Status', 'Erstellt', 'Aktionen'].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {webhooks.map((wh) => (
                  <WebhookRow
                    key={wh.id}
                    webhook={wh}
                    onDeleted={handleDeleted}
                    onToast={showToast}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <CreateWebhookModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast toast={toast} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
