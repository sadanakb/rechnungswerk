'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  FileText,
  Upload,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Activity,
  ArrowUpRight,
  CloudUpload,
  Cpu,
} from 'lucide-react'
import { getHealth, listInvoices, getDashboardStats, type HealthData, type Invoice, type DashboardStats } from '@/lib/api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface KPI {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
  bgColor: string
  href?: string
}

interface MonthlyData {
  month: string
  betrag: number
  anzahl: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function buildMonthlyData(invoices: Invoice[]): MonthlyData[] {
  const now = new Date()
  const data: MonthlyData[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = MONTH_NAMES[d.getMonth()]

    const monthInvoices = invoices.filter((inv) => {
      const invDate = inv.invoice_date || inv.created_at || ''
      return invDate.startsWith(monthKey)
    })

    data.push({
      month: label,
      betrag: monthInvoices.reduce((sum, inv) => sum + (inv.gross_amount || 0), 0),
      anzahl: monthInvoices.length,
    })
  }

  return data
}

function calcMonthlyRevenue(invoices: Invoice[]): number {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return invoices
    .filter((inv) => (inv.invoice_date || inv.created_at || '').startsWith(thisMonth))
    .reduce((sum, inv) => sum + (inv.gross_amount || 0), 0)
}

function calcOcrSuccessRate(invoices: Invoice[]): string {
  const ocrInvoices = invoices.filter((inv) => inv.source_type === 'ocr')
  if (!ocrInvoices.length) return '—'
  const successful = ocrInvoices.filter((inv) => (inv.ocr_confidence ?? 0) >= 60).length
  return `${Math.round((successful / ocrInvoices.length) * 100)}%`
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

const STATUS_LABEL: Record<string, string> = {
  xrechnung_generated: 'XML erstellt',
  pending: 'Ausstehend',
  ocr_processed: 'OCR',
  valid: 'Validiert',
  invalid: 'Ungültig',
  error: 'Fehler',
}

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  xrechnung_generated: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  pending: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  ocr_processed: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  valid: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  invalid: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
}

// ---------------------------------------------------------------------------
// Custom recharts tooltip
// ---------------------------------------------------------------------------
interface TooltipPayloadEntry {
  value: number
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
        color: 'rgb(var(--foreground))',
      }}
    >
      <p className="font-semibold mb-0.5">{label}</p>
      <p style={{ color: 'rgb(var(--primary))' }}>
        {formatEur(payload[0].value)}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const router = useRouter()

  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthError, setHealthError] = useState(false)

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)

  const [uploadDragging, setUploadDragging] = useState(false)
  const [uploadDropped, setUploadDropped] = useState<File | null>(null)

  // Fetch health
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true)
    setHealthError(false)
    try {
      setHealth(await getHealth())
    } catch {
      setHealthError(true)
    } finally {
      setHealthLoading(false)
    }
  }, [])

  // Fetch invoices and stats
  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true)
    try {
      const [data, statsData] = await Promise.all([
        listInvoices(0, 100),
        getDashboardStats(),
      ])
      setInvoices(data.items)
      setStats(statsData)
    } catch {
      setInvoices([])
    } finally {
      setInvoicesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    fetchInvoices()
  }, [fetchHealth, fetchInvoices])

  // Dropzone: forward to OCR page with file stored in sessionStorage
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return
    setUploadDropped(acceptedFiles[0])
    // Brief visual feedback then navigate
    setTimeout(() => router.push('/ocr'), 600)
  }, [router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    onDragEnter: () => setUploadDragging(true),
    onDragLeave: () => setUploadDragging(false),
  })

  // KPIs
  const xrechnungCount = invoices.filter(
    (inv) => inv.xrechnung_available || inv.validation_status === 'xrechnung_generated',
  ).length

  const kpis: KPI[] = [
    {
      label: 'Rechnungen gesamt',
      value: stats?.total_invoices ?? health?.total_invoices ?? invoices.length,
      sub: 'Alle gespeicherten Rechnungen',
      icon: FileText,
      color: 'rgb(var(--primary))',
      bgColor: 'rgb(var(--primary-light))',
      href: '/invoices',
    },
    {
      label: 'Diesen Monat',
      value: invoicesLoading ? '...' : (stats?.invoices_this_month ?? 0),
      sub: 'Neue Rechnungen',
      icon: TrendingUp,
      color: 'rgb(var(--accent))',
      bgColor: 'rgb(var(--accent-light))',
    },
    {
      label: 'Umsatz (Monat)',
      value: invoicesLoading ? '...' : formatEur(stats?.revenue_this_month ?? calcMonthlyRevenue(invoices)),
      sub: 'Brutto, aktueller Monat',
      icon: Cpu,
      color: '#7c3aed',
      bgColor: '#f3f4ff',
    },
    {
      label: 'Überfällig',
      value: stats?.overdue_count ?? 0,
      sub: stats && stats.overdue_count > 0 ? formatEur(stats.overdue_amount) : 'Keine überfälligen',
      icon: CheckCircle,
      color: stats && stats.overdue_count > 0 ? 'rgb(239 68 68)' : 'rgb(var(--accent))',
      bgColor: stats && stats.overdue_count > 0 ? 'rgb(239 68 68 / 0.1)' : 'rgb(var(--accent-light))',
      href: '/invoices',
    },
  ]

  const monthlyData = stats?.monthly_revenue
    ? stats.monthly_revenue.map((r) => ({
        month: MONTH_NAMES[parseInt(r.month.split('-')[1], 10) - 1],
        betrag: r.amount,
        anzahl: 0,
      }))
    : buildMonthlyData(invoices)
  const recentInvoices = [...invoices]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const isBackendOnline = !healthError && health?.status === 'healthy'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 max-w-7xl mx-auto">
      {/* ===== Page Header ===== */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--foreground))' }}>
            Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Willkommen bei RechnungsWerk — E-Rechnung XRechnung 3.0.2
          </p>
        </div>

        {/* Backend status indicator */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
            style={{
              backgroundColor: healthLoading
                ? 'rgb(var(--muted))'
                : healthError
                ? 'rgb(var(--destructive-light))'
                : isBackendOnline
                ? 'rgb(var(--accent-light))'
                : 'rgb(var(--warning-light))',
              borderColor: healthLoading
                ? 'rgb(var(--border))'
                : healthError
                ? 'rgb(var(--destructive-border))'
                : isBackendOnline
                ? 'rgb(var(--accent-border))'
                : 'rgb(var(--warning-border))',
              color: healthLoading
                ? 'rgb(var(--foreground-muted))'
                : healthError
                ? 'rgb(var(--destructive))'
                : isBackendOnline
                ? 'rgb(var(--accent))'
                : 'rgb(var(--warning))',
            }}
          >
            {healthLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : healthError ? (
              <AlertCircle size={12} />
            ) : (
              <Activity size={12} />
            )}
            {healthLoading
              ? 'Prüfe Backend...'
              : healthError
              ? 'Backend offline'
              : isBackendOnline
              ? 'Backend online'
              : 'Eingeschränkt'}
          </div>

          <button
            onClick={() => { fetchHealth(); fetchInvoices() }}
            disabled={healthLoading || invoicesLoading}
            className="p-1.5 rounded-md transition-colors disabled:opacity-40"
            style={{ color: 'rgb(var(--foreground-muted))' }}
            title="Aktualisieren"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgb(var(--muted))'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <RefreshCw
              size={14}
              className={healthLoading || invoicesLoading ? 'animate-spin' : ''}
            />
          </button>
        </div>
      </motion.div>

      {/* ===== KPI Row ===== */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          const inner = (
            <motion.div
              variants={itemVariants}
              className="rounded-xl border p-4 transition-all duration-150 hover:shadow-md"
              style={{
                backgroundColor: 'rgb(var(--card))',
                borderColor: 'rgb(var(--border))',
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: kpi.bgColor }}
                >
                  <Icon size={18} style={{ color: kpi.color }} />
                </div>
                {kpi.href && (
                  <ArrowUpRight
                    size={14}
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  />
                )}
              </div>
              <p
                className="text-2xl font-bold tabular-nums leading-none mb-1"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                {kpi.value}
              </p>
              <p
                className="text-xs font-medium"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                {kpi.label}
              </p>
              {kpi.sub && (
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {kpi.sub}
                </p>
              )}
            </motion.div>
          )

          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={kpi.label}>{inner}</div>
          )
        })}
      </motion.div>

      {/* ===== Main Content Grid ===== */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-5 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ===== Drop Zone (spans 2 cols on large) ===== */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div
            className="rounded-xl border h-full flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div
              className="px-5 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                Schnell-Upload
              </h2>
              <Link
                href="/ocr"
                className="text-xs font-medium flex items-center gap-1"
                style={{ color: 'rgb(var(--primary))' }}
              >
                OCR-Seite <ArrowUpRight size={11} />
              </Link>
            </div>
            <div className="flex-1 p-5">
              <div
                {...getRootProps()}
                className={cn(
                  'h-full min-h-[160px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-200 select-none',
                  (isDragActive || uploadDragging) ? 'drag-active-glow' : ''
                )}
                style={{
                  borderColor: isDragActive || uploadDragging
                    ? 'rgb(var(--primary))'
                    : 'rgb(var(--border-strong))',
                  backgroundColor: isDragActive || uploadDragging
                    ? 'rgb(var(--primary-light))'
                    : 'rgb(var(--muted))',
                }}
              >
                <input {...getInputProps()} />
                <AnimatePresence mode="wait">
                  {uploadDropped ? (
                    <motion.div
                      key="dropped"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <CheckCircle size={32} style={{ color: 'rgb(var(--accent))' }} />
                      <p className="text-sm font-medium" style={{ color: 'rgb(var(--accent))' }}>
                        Datei erkannt — wird weitergeleitet...
                      </p>
                    </motion.div>
                  ) : isDragActive ? (
                    <motion.div
                      key="active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <CloudUpload size={36} style={{ color: 'rgb(var(--primary))' }} />
                      <p className="text-sm font-semibold" style={{ color: 'rgb(var(--primary))' }}>
                        PDF hier ablegen...
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-2 text-center px-4"
                    >
                      <Upload size={28} style={{ color: 'rgb(var(--foreground-muted))' }} />
                      <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                        PDF hier ablegen
                      </p>
                      <p className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        oder klicken zum Auswählen
                      </p>
                      <p className="text-[11px]" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Nur PDF · max. 10 MB
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Quick action links */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href="/manual"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors duration-150"
                  style={{
                    borderColor: 'rgb(var(--border))',
                    color: 'rgb(var(--foreground))',
                    backgroundColor: 'rgb(var(--muted))',
                  }}
                >
                  <FileText size={13} /> Manuell eingeben
                </Link>
                <Link
                  href="/invoices"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors duration-150"
                  style={{
                    borderColor: 'rgb(var(--border))',
                    color: 'rgb(var(--foreground))',
                    backgroundColor: 'rgb(var(--muted))',
                  }}
                >
                  <FileText size={13} /> Rechnungsliste
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ===== Right Column ===== */}
        <div className="lg:col-span-3 flex flex-col gap-6">

          {/* ===== Monatliches Volumen Chart ===== */}
          <motion.div
            variants={itemVariants}
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div
              className="px-5 py-4 border-b"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                Rechnungsvolumen
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Bruttobetrag der letzten 6 Monate
              </p>
            </div>
            <div className="p-5">
              {invoicesLoading ? (
                <div className="h-[160px] flex items-center justify-center">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'rgb(var(--foreground-muted))' }} />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={monthlyData} barSize={28} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="rgb(var(--border))"
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: 'rgb(var(--foreground-muted))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'rgb(var(--foreground-muted))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--muted))' }} />
                    <Bar
                      dataKey="betrag"
                      fill="rgb(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {/* ===== Letzte 5 Rechnungen ===== */}
          <motion.div
            variants={itemVariants}
            className="rounded-xl border overflow-hidden flex-1"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div
              className="px-5 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                Letzte Rechnungen
              </h2>
              <Link
                href="/invoices"
                className="text-xs font-medium flex items-center gap-1"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Alle anzeigen <ArrowUpRight size={11} />
              </Link>
            </div>

            {invoicesLoading ? (
              <div className="p-5 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton h-8 w-full" />
                ))}
              </div>
            ) : recentInvoices.length === 0 ? (
              <div className="p-8 text-center">
                <FileText size={32} className="mx-auto mb-2" style={{ color: 'rgb(var(--foreground-muted))' }} />
                <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                  Noch keine Rechnungen
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  PDF hochladen oder manuell eingeben um zu starten
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr
                      className="text-xs font-semibold uppercase tracking-wide border-b"
                      style={{
                        color: 'rgb(var(--foreground-muted))',
                        borderColor: 'rgb(var(--border))',
                        backgroundColor: 'rgb(var(--muted))',
                      }}
                    >
                      <th className="text-left px-5 py-2.5 whitespace-nowrap">Rechnung</th>
                      <th className="text-left px-3 py-2.5 whitespace-nowrap">Verkäufer</th>
                      <th className="text-right px-3 py-2.5 whitespace-nowrap">Betrag</th>
                      <th className="text-left px-3 py-2.5 whitespace-nowrap">Status</th>
                      <th className="text-left px-3 py-2.5 pr-5 whitespace-nowrap">Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((inv, idx) => {
                      const sc = STATUS_COLOR[inv.validation_status] ?? {
                        bg: 'bg-gray-100',
                        text: 'text-gray-600',
                      }
                      return (
                        <tr
                          key={inv.id}
                          className="border-b last:border-b-0 transition-colors duration-100"
                          style={{ borderColor: 'rgb(var(--border))' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgb(var(--muted))'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          <td className="px-5 py-3">
                            <p
                              className="text-sm font-semibold"
                              style={{ color: 'rgb(var(--foreground))' }}
                            >
                              {inv.invoice_number || '—'}
                            </p>
                            <p
                              className="text-[11px] font-mono"
                              style={{ color: 'rgb(var(--foreground-muted))' }}
                            >
                              {inv.invoice_id?.slice(0, 18)}
                            </p>
                          </td>
                          <td
                            className="px-3 py-3 text-sm max-w-[120px]"
                            style={{ color: 'rgb(var(--foreground))' }}
                          >
                            <p className="truncate">{inv.seller_name || '—'}</p>
                          </td>
                          <td
                            className="px-3 py-3 text-sm font-semibold text-right tabular-nums whitespace-nowrap"
                            style={{ color: 'rgb(var(--foreground))' }}
                          >
                            {inv.gross_amount != null
                              ? `${inv.gross_amount.toFixed(2)} €`
                              : '—'}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full',
                                sc.bg,
                                sc.text,
                              )}
                            >
                              {STATUS_LABEL[inv.validation_status] ?? inv.validation_status}
                            </span>
                          </td>
                          <td
                            className="px-3 py-3 pr-5 text-xs whitespace-nowrap"
                            style={{ color: 'rgb(var(--foreground-muted))' }}
                          >
                            {inv.invoice_date || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* ===== XRechnung Info Footer ===== */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="mt-6 rounded-xl border p-4"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
            XRechnung 3.0.2 Pflicht:
          </p>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: 'rgb(var(--accent-light))',
              color: 'rgb(var(--accent))',
            }}
          >
            Seit 01.01.2025 Empfangspflicht B2B
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: 'rgb(var(--warning-light))',
              color: 'rgb(var(--warning))',
            }}
          >
            Ab 01.01.2027 Sendepflicht {'>'} 800k EUR
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: 'rgb(var(--primary-light))',
              color: 'rgb(var(--primary))',
            }}
          >
            Ab 01.01.2028 für alle
          </span>
        </div>
      </motion.div>
    </div>
  )
}
