'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Download, BarChart3, Calendar, AlertTriangle } from 'lucide-react'
import {
  getTaxSummary, getCashflow, getOverdueAging,
  type TaxSummaryRow, type CashflowMonth, type OverdueAgingBucket,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgb(var(--primary-light))', color: 'rgb(var(--primary))' }}
        >
          <Icon size={16} />
        </div>
        <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tax Summary Section
// ---------------------------------------------------------------------------

function TaxSummarySection() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [rows, setRows] = useState<TaxSummaryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getTaxSummary(year)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [year])

  const handleCSVDownload = useCallback(() => {
    const lines = ['Steuersatz;Bezeichnung;Rechnungen;Netto;USt;Brutto']
    rows.forEach((r) => {
      lines.push(
        `${r.tax_rate}%;${r.label};${r.count};${r.net.toFixed(2).replace('.', ',')};${r.vat.toFixed(2).replace('.', ',')};${r.gross.toFixed(2).replace('.', ',')}`,
      )
    })
    // Totals row
    const totalNet = rows.reduce((s, r) => s + r.net, 0)
    const totalVat = rows.reduce((s, r) => s + r.vat, 0)
    const totalGross = rows.reduce((s, r) => s + r.gross, 0)
    const totalCount = rows.reduce((s, r) => s + r.count, 0)
    lines.push(`Gesamt;;${totalCount};${totalNet.toFixed(2).replace('.', ',')};${totalVat.toFixed(2).replace('.', ',')};${totalGross.toFixed(2).replace('.', ',')}`)

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `steuerauswertung_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [rows, year])

  const yearOptions = [currentYear - 2, currentYear - 1, currentYear]

  return (
    <SectionCard title="Steuerauswertung" icon={BarChart3}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Year selector */}
        <div className="flex items-center gap-2">
          <Calendar size={14} style={{ color: 'rgb(var(--foreground-muted))' }} />
          <span className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>Jahr:</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border px-2 py-1 text-sm"
            style={{
              backgroundColor: 'rgb(var(--background))',
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
            }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCSVDownload}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            borderColor: 'rgb(var(--border))',
            color: 'rgb(var(--foreground))',
            backgroundColor: 'rgb(var(--card))',
          }}
        >
          <Download size={12} />
          Als CSV
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg animate-pulse" style={{ backgroundColor: 'rgb(var(--muted))' }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Keine Daten für {year}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgb(var(--border))' }}>
                {['Steuersatz', 'Bezeichnung', 'Rechnungen', 'Netto', 'USt', 'Brutto'].map((h) => (
                  <th
                    key={h}
                    className="pb-2 text-left font-semibold text-xs pr-4"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.tax_rate}
                  style={{ borderBottom: '1px solid rgb(var(--border))' }}
                >
                  <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: 'rgb(var(--foreground))' }}>
                    {row.tax_rate}%
                  </td>
                  <td className="py-2.5 pr-4" style={{ color: 'rgb(var(--foreground))' }}>
                    {row.label}
                  </td>
                  <td className="py-2.5 pr-4 text-right" style={{ color: 'rgb(var(--foreground))' }}>
                    {row.count}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs" style={{ color: 'rgb(var(--foreground))' }}>
                    {fmt(row.net)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs" style={{ color: 'rgb(var(--foreground))' }}>
                    {fmt(row.vat)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                    {fmt(row.gross)}
                  </td>
                </tr>
              ))}
              {/* Totals */}
              <tr>
                <td colSpan={2} className="pt-3 text-xs font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                  Gesamt
                </td>
                <td className="pt-3 text-right text-xs font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                  {rows.reduce((s, r) => s + r.count, 0)}
                </td>
                <td className="pt-3 text-right font-mono text-xs font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                  {fmt(rows.reduce((s, r) => s + r.net, 0))}
                </td>
                <td className="pt-3 text-right font-mono text-xs font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                  {fmt(rows.reduce((s, r) => s + r.vat, 0))}
                </td>
                <td className="pt-3 text-right font-mono text-xs font-semibold" style={{ color: 'rgb(var(--primary))' }}>
                  {fmt(rows.reduce((s, r) => s + r.gross, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Cashflow Section
// ---------------------------------------------------------------------------

function CashflowSection() {
  const [data, setData] = useState<CashflowMonth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCashflow(6)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <SectionCard title="Monatlicher Cashflow (6 Monate)" icon={BarChart3}>
      {loading ? (
        <div className="h-52 rounded-lg animate-pulse" style={{ backgroundColor: 'rgb(var(--muted))' }} />
      ) : data.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Keine Daten verfügbar
        </p>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'rgb(var(--foreground-muted))' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'rgb(var(--foreground-muted))' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => [fmt(Number(value ?? 0)), 'Umsatz']}
                contentStyle={{
                  backgroundColor: 'rgb(var(--card))',
                  borderColor: 'rgb(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="total_amount" fill="rgb(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Overdue Aging Section
// ---------------------------------------------------------------------------

const BUCKET_COLORS: Record<string, string> = {
  '0-30': 'rgb(var(--warning, 245 158 11))',
  '31-60': 'rgb(var(--accent))',
  '61-90': 'rgb(var(--danger, 239 68 68))',
  '90+': 'rgb(180 0 0)',
}

function OverdueAgingSection() {
  const [buckets, setBuckets] = useState<OverdueAgingBucket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getOverdueAging()
      .then(setBuckets)
      .catch(() => setBuckets([]))
      .finally(() => setLoading(false))
  }, [])

  const totalOverdue = buckets.reduce((s, b) => s + b.total_amount, 0)
  const totalCount = buckets.reduce((s, b) => s + b.count, 0)

  return (
    <SectionCard title="Fälligkeitsanalyse (Overdue Aging)" icon={AlertTriangle}>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 rounded-lg animate-pulse" style={{ backgroundColor: 'rgb(var(--muted))' }} />
          ))}
        </div>
      ) : (
        <>
          {totalCount === 0 && (
            <p className="text-sm py-2 mb-3" style={{ color: 'rgb(var(--success, 34 197 94))' }}>
              Keine überfälligen Rechnungen. Alles aktuell.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgb(var(--border))' }}>
                  {['Zeitraum', 'Anzahl', 'Gesamtbetrag', 'Anteil'].map((h) => (
                    <th
                      key={h}
                      className="pb-2 text-left font-semibold text-xs pr-4"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buckets.map((bucket) => {
                  const share = totalOverdue > 0
                    ? ((bucket.total_amount / totalOverdue) * 100).toFixed(1)
                    : '0.0'
                  return (
                    <tr
                      key={bucket.bucket}
                      style={{ borderBottom: '1px solid rgb(var(--border))' }}
                    >
                      <td className="py-2.5 pr-4">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${BUCKET_COLORS[bucket.bucket] ?? 'rgb(var(--muted))'} 15%, transparent)`,
                            color: BUCKET_COLORS[bucket.bucket] ?? 'rgb(var(--foreground))',
                          }}
                        >
                          {bucket.bucket} Tage
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right" style={{ color: 'rgb(var(--foreground))' }}>
                        {bucket.count}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs" style={{ color: 'rgb(var(--foreground))' }}>
                        {fmt(bucket.total_amount)}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${share}%`,
                              maxWidth: 80,
                              backgroundColor: BUCKET_COLORS[bucket.bucket] ?? 'rgb(var(--muted))',
                              opacity: 0.7,
                            }}
                          />
                          <span className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                            {share}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {/* Totals */}
                {totalCount > 0 && (
                  <tr>
                    <td className="pt-3 text-xs font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                      Gesamt
                    </td>
                    <td className="pt-3 text-right text-xs font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                      {totalCount}
                    </td>
                    <td className="pt-3 text-right font-mono text-xs font-semibold" style={{ color: 'rgb(var(--danger, 239 68 68))' }}>
                      {fmt(totalOverdue)}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BerichtePage() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
          Berichte
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Steuerauswertung, Cashflow-Vorschau und Fälligkeitsanalyse
        </p>
      </div>

      {/* 3-section grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Tax Summary — full width on first row */}
        <div className="xl:col-span-2">
          <TaxSummarySection />
        </div>

        {/* Cashflow chart */}
        <CashflowSection />

        {/* Overdue Aging */}
        <OverdueAgingSection />
      </div>
    </div>
  )
}
