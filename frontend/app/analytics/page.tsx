'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { TrendingUp, FileText, Receipt, CheckCircle, Download } from 'lucide-react'
import { getAnalyticsSummary, exportDATEV, type AnalyticsSummary } from '@/lib/api'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getAnalyticsSummary()
      .then(setData)
      .catch(() => setError('Analytics konnten nicht geladen werden'))
      .finally(() => setLoading(false))
  }, [])

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

  const fmt = (n: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>Analytics</h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Rechnungsvolumen, OCR-Erfolgsquote und Trends
          </p>
        </div>
        <div className="flex gap-2">
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

      {/* Charts */}
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
    </div>
  )
}
