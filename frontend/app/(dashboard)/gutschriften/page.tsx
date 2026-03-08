'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, FileText } from 'lucide-react'
import { listCreditNotes, type CreditNote, type CreditNoteListResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatCurrency(amount: number | null | undefined, currency = 'EUR'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function GutschriftenPage() {
  useEffect(() => { document.title = 'Gutschriften | RechnungsWerk' }, [])
  const router = useRouter()
  const [data, setData] = useState<CreditNoteListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const limit = 50

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listCreditNotes(page * limit, limit, { search: search || undefined })
      setData(result)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(0)
    fetchData()
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Gutschriften
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {data ? `${data.total} Gutschriften` : 'Wird geladen…'}
          </p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          />
          <input
            type="text"
            placeholder="Suche nach Nummer, Kunde…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
            style={{
              backgroundColor: 'rgb(var(--input))',
              borderColor: 'rgb(var(--input-border))',
              color: 'rgb(var(--foreground))',
            }}
          />
        </div>
      </form>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'rgb(var(--border))' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: 'rgb(var(--border))', backgroundColor: 'rgb(var(--muted))' }}
              >
                {['Nummer', 'Datum', 'Kunde', 'Betrag', 'Grund'].map((col) => (
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
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: 'rgb(var(--border))' }}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div
                          className="h-4 rounded animate-pulse"
                          style={{ backgroundColor: 'rgb(var(--muted))', width: j === 0 ? 120 : j === 4 ? 180 : 100 }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data && data.items.length > 0 ? (
                data.items.map((cn, idx) => (
                  <tr
                    key={cn.id}
                    onClick={() => router.push(`/gutschriften/${cn.credit_note_id}`)}
                    className="border-b cursor-pointer transition-colors"
                    style={{
                      borderColor: 'rgb(var(--border))',
                      backgroundColor: idx % 2 === 0 ? 'rgb(var(--card))' : 'rgb(var(--muted))',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgb(var(--sidebar-item-hover))' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'rgb(var(--card))' : 'rgb(var(--muted))' }}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                      {cn.credit_note_number}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'rgb(var(--foreground-muted))' }}>
                      {formatDate(cn.credit_note_date)}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'rgb(var(--foreground))' }}>
                      {cn.buyer_name}
                    </td>
                    <td className="px-4 py-3 text-right font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                      {formatCurrency(cn.gross_amount)}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'rgb(var(--foreground-muted))' }}>
                      {cn.reason}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <FileText size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                      Keine Gutschriften vorhanden
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {page * limit + 1}–{Math.min((page + 1) * limit, data.total)} von {data.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm rounded-lg border disabled:opacity-50"
              style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
            >
              Zurück
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * limit >= data.total}
              className="px-3 py-1.5 text-sm rounded-lg border disabled:opacity-50"
              style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
            >
              Weiter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
