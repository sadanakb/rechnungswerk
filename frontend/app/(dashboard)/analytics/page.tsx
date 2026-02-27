'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { TrendingUp, FileText, Receipt, CheckCircle, Download, Calendar } from 'lucide-react'
import {
  getAnalyticsSummary, exportDATEV, getTopSuppliers, getCategoryBreakdown,
  type AnalyticsSummary, type TopSupplier, type CategoryBreakdown,
} from '@/lib/api'

const PIE_COLORS = [
  'rgb(var(--primary))',
  'rgb(var(--accent))',
  'rgb(var(--warning, 245 158 11))',
  'rgb(var(--success, 34 197 94))',
  'rgb(var(--danger, 239 68 68))',
]

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
}) {
  return (
    <div
      className="rounded-xl border p-5 flex items-start gap-4"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
      }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'rgb(var(--primary-light))', color: 'rgb(var(--primary))' }}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium" style={{ color: 'rgb(var(--foreground-muted))' }}>{label}</p>
        <p className="text-2xl font-bold mt-0.5" style={{ color: 'rgb(var(--foreground))' }}>{value}</p>
        {sub && <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [topSuppliers, setTopSuppliers] = useState<TopSupplier[]>([])
  const [categoryData, setCategoryData] = useState<CategoryBreakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Date range state
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const fmt = useCallback(
    (n: number) =>
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n),
    [],
  )

  // Load summary once
  useEffect(() => {
    getAnalyticsSummary()
      .then(setData)
      .catch(() => setError('Analytics konnten nicht geladen werden'))
      .finally(() => setLoading(false))
  }, [])

  // Load filtered data whenever date range changes
  useEffect(() => {
    const from = fromDate || undefined
    const to = toDate || undefined

    getTopSuppliers(from, to)
      .then(setTopSuppliers)
      .catch(() => setTopSuppliers([]))

    getCategoryBreakdown(from, to)
      .then(setCategoryData)
      .catch(() => setCategoryData([]))
  }, [fromDate, toDate])

  // CSV export handler for analytics data
  const handleCSVExport = useCallback(() => {
    const rows: string[] = []

    // Top Suppliers section
    rows.push('--- Top Lieferanten ---')
    rows.push('Name;Rechnungen;Gesamtbetrag')
    topSuppliers.forEach((s) => {
      rows.push(`${s.name};${s.invoice_count};${s.total_amount.toFixed(2).replace('.', ',')}`)
    })

    rows.push('')

    // Category breakdown section
    rows.push('--- Umsatz nach Steuersatz ---')
    rows.push('Steuersatz;Label;Rechnungen;Gesamtbetrag')
    categoryData.forEach((c) => {
      rows.push(
        `${c.tax_rate}%;${c.label};${c.invoice_count};${c.total_amount.toFixed(2).replace('.', ',')}`,
      )
    })

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [topSuppliers, categoryData])

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>Analytics</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-xl animate-pulse" style={{ backgroundColor: 'rgb(var(--muted))' }} />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'rgb(var(--foreground))' }}>Analytics</h1>
        <p style={{ color: 'rgb(var(--danger))' }}>{error || 'Keine Daten verfügbar'}</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>Analytics</h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Rechnungsvolumen, OCR-Erfolgsquote und Trends
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCSVExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
              backgroundColor: 'rgb(var(--card))',
            }}
          >
            <Download size={14} />
            Analytics CSV
          </button>
          <a
            href={exportDATEV('csv')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
              backgroundColor: 'rgb(var(--card))',
            }}
          >
            <Download size={14} />
            CSV Export
          </a>
          <a
            href={exportDATEV('buchungsstapel')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'rgb(var(--primary))',
              color: '#fff',
            }}
          >
            <Download size={14} />
            DATEV Export
          </a>
        </div>
      </div>

      {/* Date Range Filter */}
      <div
        className="rounded-xl border p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
      >
        <div className="flex items-center gap-2">
          <Calendar size={16} style={{ color: 'rgb(var(--foreground-muted))' }} />
          <span className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
            Zeitraum filtern
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>Von</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: 'rgb(var(--background))',
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
              }}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>Bis</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: 'rgb(var(--background))',
                borderColor: 'rgb(var(--border))',
                color: 'rgb(var(--foreground))',
              }}
            />
          </label>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate('') }}
              className="text-xs px-2 py-1 rounded-md border transition-colors"
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Gesamtrechnungen"
          value={data.total_invoices.toString()}
          icon={FileText}
        />
        <StatCard
          label="Gesamtvolumen"
          value={fmt(data.total_volume)}
          icon={TrendingUp}
        />
        <StatCard
          label="Dieser Monat"
          value={fmt(data.month_volume)}
          sub={`${data.month_invoices} Rechnungen`}
          icon={Receipt}
        />
        <StatCard
          label="OCR-Erfolgsquote"
          value={`${data.ocr_success_rate}%`}
          sub={`${data.xrechnung_generated} XRechnung generiert`}
          icon={CheckCircle}
        />
      </div>

      {/* Monthly Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Volume Bar Chart */}
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'rgb(var(--foreground))' }}>
            Rechnungsvolumen (6 Monate)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly_volumes}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'rgb(var(--foreground-muted))' }} />
                <YAxis tick={{ fontSize: 12, fill: 'rgb(var(--foreground-muted))' }} />
                <Tooltip
                  formatter={(value: number | undefined) => [fmt(value ?? 0), 'Volumen']}
                  contentStyle={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: 'rgb(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="volume" fill="rgb(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Count Line Chart */}
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'rgb(var(--foreground))' }}>
            Rechnungsanzahl (6 Monate)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthly_volumes}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'rgb(var(--foreground-muted))' }} />
                <YAxis tick={{ fontSize: 12, fill: 'rgb(var(--foreground-muted))' }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number | undefined) => [value ?? 0, 'Rechnungen']}
                  contentStyle={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: 'rgb(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="rgb(var(--accent))"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'rgb(var(--accent))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Enhanced Analytics: Top Suppliers + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Suppliers Horizontal Bar Chart */}
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'rgb(var(--foreground))' }}>
            Top 5 Lieferanten
            {(fromDate || toDate) && (
              <span className="font-normal ml-2" style={{ color: 'rgb(var(--foreground-muted))' }}>
                ({fromDate || '...'} – {toDate || '...'})
              </span>
            )}
          </h2>
          {topSuppliers.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Keine Daten im gewählten Zeitraum
              </p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSuppliers} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: 'rgb(var(--foreground-muted))' }}
                    tickFormatter={(v) => fmt(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11, fill: 'rgb(var(--foreground-muted))' }}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === 'total_amount') return [fmt(Number(value ?? 0)), 'Umsatz']
                      return [Number(value ?? 0), 'Rechnungen']
                    }}
                    contentStyle={{
                      backgroundColor: 'rgb(var(--card))',
                      borderColor: 'rgb(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="total_amount" fill="rgb(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Category Breakdown Pie Chart */}
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'rgb(var(--foreground))' }}>
            Umsatz nach Steuersatz
            {(fromDate || toDate) && (
              <span className="font-normal ml-2" style={{ color: 'rgb(var(--foreground-muted))' }}>
                ({fromDate || '...'} – {toDate || '...'})
              </span>
            )}
          </h2>
          {categoryData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Keine Daten im gewählten Zeitraum
              </p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="total_amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props) =>
                      `${props.name ?? ''} (${((props.percent ?? 0) * 100).toFixed(0)}%)`
                    }
                    labelLine
                  >
                    {categoryData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | undefined) => [fmt(value ?? 0), 'Umsatz']}
                    contentStyle={{
                      backgroundColor: 'rgb(var(--card))',
                      borderColor: 'rgb(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value: string) => (
                      <span style={{ color: 'rgb(var(--foreground-muted))', fontSize: 12 }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
