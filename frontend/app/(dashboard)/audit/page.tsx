'use client'

import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Download, Filter, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getAuditLog,
  type AuditLogEntry,
  type AuditLogParams,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Action badge coloring
// ---------------------------------------------------------------------------

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  invoice_created:  { bg: 'rgb(var(--primary-light))',        text: 'rgb(var(--primary))' },
  invoice_deleted:  { bg: 'rgb(var(--primary-light))',        text: 'rgb(var(--primary))' },
  invoice_updated:  { bg: 'rgb(var(--primary-light))',        text: 'rgb(var(--primary))' },
  user_profile_updated: { bg: 'rgba(34,197,94,0.12)',         text: 'rgb(34,197,94)' },
  password_changed: { bg: 'rgba(245,158,11,0.12)',            text: 'rgb(245,158,11)' },
  member_invited:   { bg: 'rgba(168,85,247,0.12)',            text: 'rgb(168,85,247)' },
  member_removed:   { bg: 'rgba(168,85,247,0.12)',            text: 'rgb(168,85,247)' },
  member_role_changed: { bg: 'rgba(168,85,247,0.12)',         text: 'rgb(168,85,247)' },
}

function getActionStyle(action: string): { bg: string; text: string } {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action]
  if (action.startsWith('invoice_')) return { bg: 'rgb(var(--primary-light))', text: 'rgb(var(--primary))' }
  if (action.startsWith('user_') || action.startsWith('password_')) {
    return { bg: 'rgba(34,197,94,0.12)', text: 'rgb(34,197,94)' }
  }
  if (action.startsWith('member_')) return { bg: 'rgba(168,85,247,0.12)', text: 'rgb(168,85,247)' }
  return { bg: 'rgb(var(--muted))', text: 'rgb(var(--foreground-muted))' }
}

function ActionBadge({ action }: { action: string }) {
  const style = getActionStyle(action)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {action}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Date/time formatter
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
// CSV export helper
// ---------------------------------------------------------------------------

function exportToCSV(entries: AuditLogEntry[]): void {
  const header = 'Zeitstempel;Benutzer;Aktion;Ressourcentyp;Ressource-ID;IP-Adresse;Details'
  const rows = entries.map((e) => {
    const details = e.details ? JSON.stringify(e.details).replace(/;/g, ',') : ''
    return [
      formatDateTime(e.created_at),
      e.user_email ?? '—',
      e.action,
      e.resource_type ?? '—',
      e.resource_id ?? '—',
      e.ip_address ?? '—',
      details,
    ].join(';')
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit_protokoll_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Available action filter options
// ---------------------------------------------------------------------------

const ACTION_OPTIONS = [
  { value: '', label: 'Alle Aktionen' },
  { value: 'invoice_created', label: 'Rechnung erstellt' },
  { value: 'invoice_deleted', label: 'Rechnung gelöscht' },
  { value: 'invoice_updated', label: 'Rechnung aktualisiert' },
  { value: 'user_profile_updated', label: 'Profil aktualisiert' },
  { value: 'password_changed', label: 'Passwort geändert' },
  { value: 'member_invited', label: 'Mitglied eingeladen' },
  { value: 'member_removed', label: 'Mitglied entfernt' },
  { value: 'member_role_changed', label: 'Rolle geändert' },
]

const PAGE_SIZE = 50

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: AuditLogParams = { page, page_size: PAGE_SIZE }
      if (actionFilter) params.action = actionFilter
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const data = await getAuditLog(params)
      setEntries(data.items)
      setTotal(data.total)
    } catch {
      setError('Protokoll konnte nicht geladen werden. Zugriff nur für Owner und Admin.')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [load])

  // Reset to page 1 when filters change
  const handleFilterChange = useCallback((
    setter: (v: string) => void,
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(e.target.value)
    setPage(1)
  }, [])

  const resetFilters = useCallback(() => {
    setActionFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }, [])

  const hasFilters = actionFilter || dateFrom || dateTo

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgb(var(--primary-light))', color: 'rgb(var(--primary))' }}
          >
            <ClipboardList size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
              Aktivitätsprotokoll
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
              {total} Einträge insgesamt
            </p>
          </div>
        </div>

        <button
          onClick={() => exportToCSV(entries)}
          disabled={entries.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            borderColor: 'rgb(var(--border))',
            color: 'rgb(var(--foreground))',
            backgroundColor: 'rgb(var(--card))',
          }}
        >
          <Download size={14} />
          Als CSV exportieren
        </button>
      </div>

      {/* Filters */}
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
      >
        <div className="flex items-center gap-2">
          <Filter size={15} style={{ color: 'rgb(var(--foreground-muted))' }} />
          <span className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
            Filter
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Action filter */}
          <select
            value={actionFilter}
            onChange={handleFilterChange(setActionFilter)}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{
              backgroundColor: 'rgb(var(--background))',
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
            }}
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Date from */}
          <label className="flex items-center gap-2">
            <Calendar size={14} style={{ color: 'rgb(var(--foreground-muted))' }} />
            <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>Von</span>
            <input
              type="date"
              value={dateFrom}
              onChange={handleFilterChange(setDateFrom)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: 'rgb(var(--background))',
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
              }}
            />
          </label>

          {/* Date to */}
          <label className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>Bis</span>
            <input
              type="date"
              value={dateTo}
              onChange={handleFilterChange(setDateTo)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: 'rgb(var(--background))',
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
              }}
            />
          </label>

          {hasFilters && (
            <button
              onClick={resetFilters}
              className="text-xs px-2 py-1 rounded-md border"
              style={{
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground-muted))',
              }}
            >
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
      >
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-10 rounded-lg animate-pulse"
                style={{ backgroundColor: 'rgb(var(--muted))' }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: 'rgb(var(--danger, 239 68 68))' }}>{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList
              size={40}
              className="mx-auto mb-3 opacity-30"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            />
            <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Keine Einträge gefunden
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{
                    borderColor: 'rgb(var(--border))',
                    backgroundColor: 'rgb(var(--muted))',
                  }}
                >
                  {['Zeitstempel', 'Benutzer', 'Aktion', 'Ressource', 'Details', 'IP-Adresse'].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-4 py-3 font-semibold text-xs uppercase tracking-wide"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        {col}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className="border-b last:border-0 transition-colors"
                    style={{
                      borderColor: 'rgb(var(--border))',
                      backgroundColor:
                        idx % 2 === 0 ? 'transparent' : 'rgb(var(--muted) / 0.3)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgb(var(--sidebar-item-hover))'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        idx % 2 === 0 ? 'transparent' : 'rgb(var(--muted) / 0.3)'
                    }}
                  >
                    {/* Zeitstempel */}
                    <td
                      className="px-4 py-3 whitespace-nowrap font-mono text-xs"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      {formatDateTime(entry.created_at)}
                    </td>

                    {/* Benutzer */}
                    <td
                      className="px-4 py-3 max-w-[160px] truncate"
                      style={{ color: 'rgb(var(--foreground))' }}
                    >
                      {entry.user_email ?? (
                        <span style={{ color: 'rgb(var(--foreground-muted))' }}>System</span>
                      )}
                    </td>

                    {/* Aktion */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ActionBadge action={entry.action} />
                    </td>

                    {/* Ressource */}
                    <td
                      className="px-4 py-3 font-mono text-xs max-w-[160px] truncate"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                      title={entry.resource_id ?? undefined}
                    >
                      {entry.resource_type && (
                        <span
                          className="mr-1.5 font-semibold not-italic"
                          style={{ color: 'rgb(var(--foreground))' }}
                        >
                          {entry.resource_type}
                        </span>
                      )}
                      {entry.resource_id ?? '—'}
                    </td>

                    {/* Details */}
                    <td
                      className="px-4 py-3 max-w-[200px] truncate text-xs"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                      title={entry.details ? JSON.stringify(entry.details) : undefined}
                    >
                      {entry.details
                        ? Object.entries(entry.details)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ')
                        : '—'}
                    </td>

                    {/* IP */}
                    <td
                      className="px-4 py-3 font-mono text-xs whitespace-nowrap"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      {entry.ip_address ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Seite {page} von {totalPages} &middot; {total} Einträge
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
                backgroundColor: 'rgb(var(--card))',
              }}
            >
              <ChevronLeft size={14} />
              Zurück
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
                backgroundColor: 'rgb(var(--card))',
              }}
            >
              Weiter
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
