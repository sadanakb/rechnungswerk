'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import {
  FileText,
  Upload,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Loader2,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
} from 'lucide-react'
import { listInvoices, getDashboardStats, type Invoice, type DashboardStats } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import DATEVExportDialog from '@/components/DATEVExportDialog'

const LazyBarChart = dynamic(() => import('recharts').then(mod => ({ default: mod.BarChart })), { ssr: false })
const LazyBar = dynamic(() => import('recharts').then(mod => ({ default: mod.Bar })), { ssr: false })
const LazyXAxis = dynamic(() => import('recharts').then(mod => ({ default: mod.XAxis })), { ssr: false })
const LazyYAxis = dynamic(() => import('recharts').then(mod => ({ default: mod.YAxis })), { ssr: false })
const LazyCartesianGrid = dynamic(() => import('recharts').then(mod => ({ default: mod.CartesianGrid })), { ssr: false })
const LazyTooltip = dynamic(() => import('recharts').then(mod => ({ default: mod.Tooltip })), { ssr: false })
const LazyResponsiveContainer = dynamic(() => import('recharts').then(mod => ({ default: mod.ResponsiveContainer })), { ssr: false })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MonthlyData {
  month: string
  betrag: number
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
    })
  }
  return data
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

function formatEurFull(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value)
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
  ocr_processed: { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-400' },
  valid: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  invalid: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
}

// ---------------------------------------------------------------------------
// Chart Tooltip
// ---------------------------------------------------------------------------
interface TooltipPayloadEntry {
  value: number
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
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
      <p style={{ color: 'rgb(var(--primary))' }}>{formatEur(payload[0].value)}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------
export default function Dashboard() {
  useEffect(() => { document.title = 'Dashboard | RechnungsWerk' }, [])
  const { user } = useAuth()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [datevOpen, setDatevOpen] = useState(false)

  const fetchData = useCallback(async () => {
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

  useEffect(() => { fetchData() }, [fetchData])

  // Derive first name from full_name
  const firstName = useMemo(() => {
    if (!user?.full_name) return ''
    return user.full_name.split(' ')[0]
  }, [user])

  // KPI values
  const revenueThisMonth = stats?.revenue_this_month ?? 0
  const revenueLastMonth = stats?.revenue_last_month ?? 0
  const revenueTrend = revenueLastMonth > 0
    ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
    : null

  const unpaidCount = stats?.unpaid_count ?? 0
  const paidCount = stats?.paid_count ?? 0
  const overdueCount = stats?.overdue_count ?? 0
  const overdueAmount = stats?.overdue_amount ?? 0

  // Chart data
  const monthlyData = useMemo(
    () =>
      stats?.monthly_revenue
        ? stats.monthly_revenue.map((r) => ({
            month: MONTH_NAMES[parseInt(r.month.split('-')[1], 10) - 1],
            betrag: r.amount,
          }))
        : buildMonthlyData(invoices),
    [stats, invoices],
  )

  // Recent invoices (last 5)
  const recentInvoices = useMemo(() =>
    [...invoices]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5),
    [invoices],
  )

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 max-w-7xl mx-auto">

      {/* ===== Greeting ===== */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-tight"
          style={{ color: 'rgb(var(--foreground))' }}
        >
          Hallo{firstName ? `, ${firstName}` : ''}
        </h1>
        <p
          className="text-base sm:text-lg mt-1.5"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {invoicesLoading ? (
            <span className="inline-block h-5 w-64 rounded skeleton" />
          ) : unpaidCount > 0 ? (
            <>Sie haben <strong style={{ color: 'rgb(var(--foreground))' }}>{unpaidCount} offene Rechnungen</strong> im Wert von <strong style={{ color: 'rgb(var(--foreground))' }}>{formatEur(overdueAmount || revenueThisMonth)}</strong></>
          ) : (
            'Alle Rechnungen sind beglichen. Gut gemacht!'
          )}
        </p>
      </motion.div>

      {/* ===== Quick Actions ===== */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <Link
            href="/manual"
            className="group flex items-center gap-4 rounded-xl border p-4 sm:p-5 transition-all duration-150 hover:shadow-md"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
              style={{ backgroundColor: 'rgb(var(--primary-light))' }}
            >
              <Plus size={20} style={{ color: 'rgb(var(--primary))' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                Neue Rechnung
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Manuell erstellen
              </p>
            </div>
            <ArrowUpRight
              size={16}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            />
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link
            href="/ocr"
            className="group flex items-center gap-4 rounded-xl border p-4 sm:p-5 transition-all duration-150 hover:shadow-md"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgb(var(--primary-light))' }}
            >
              <Upload size={20} style={{ color: 'rgb(var(--primary))' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                Rechnung hochladen
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
                PDF per OCR einlesen
              </p>
            </div>
            <ArrowUpRight
              size={16}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            />
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <button
            onClick={() => setDatevOpen(true)}
            className="group flex items-center gap-4 rounded-xl border p-4 sm:p-5 transition-all duration-150 hover:shadow-md w-full text-left cursor-pointer"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgb(var(--primary-light))' }}
            >
              <FileSpreadsheet size={20} style={{ color: 'rgb(var(--primary))' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                DATEV Export
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Buchungsstapel exportieren
              </p>
            </div>
            <ArrowUpRight
              size={16}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            />
          </button>
        </motion.div>
      </motion.div>

      {/* ===== KPI Cards ===== */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Revenue this month */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl border p-5 transition-all duration-150 hover:shadow-md"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'rgb(var(--primary-light))' }}
            >
              <TrendingUp size={18} style={{ color: 'rgb(var(--primary))' }} />
            </div>
            {revenueTrend !== null && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full',
                  revenueTrend >= 0
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                )}
              >
                {revenueTrend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {revenueTrend >= 0 ? '+' : ''}{revenueTrend}%
              </span>
            )}
          </div>
          <p
            className="text-2xl font-bold tabular-nums leading-none mb-1"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            {invoicesLoading ? '...' : formatEur(revenueThisMonth)}
          </p>
          <p className="text-xs font-medium" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Umsatz diesen Monat
          </p>
        </motion.div>

        {/* Open invoices */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl border p-5 transition-all duration-150 hover:shadow-md"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'rgb(var(--warning-light))' }}
            >
              <Clock size={18} style={{ color: 'rgb(var(--warning))' }} />
            </div>
          </div>
          <p
            className="text-2xl font-bold tabular-nums leading-none mb-1"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            {invoicesLoading ? '...' : unpaidCount}
          </p>
          <p className="text-xs font-medium" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Offene Rechnungen
          </p>
        </motion.div>

        {/* Paid invoices */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl border p-5 transition-all duration-150 hover:shadow-md"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'rgb(var(--accent-light))' }}
            >
              <CheckCircle2 size={18} style={{ color: 'rgb(var(--status-success))' }} />
            </div>
          </div>
          <p
            className="text-2xl font-bold tabular-nums leading-none mb-1"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            {invoicesLoading ? '...' : paidCount}
          </p>
          <p className="text-xs font-medium" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Bezahlte Rechnungen
          </p>
        </motion.div>

        {/* Overdue invoices */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl border p-5 transition-all duration-150 hover:shadow-md"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: overdueCount > 0 ? 'rgb(var(--destructive) / 0.3)' : 'rgb(var(--border))',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                backgroundColor: overdueCount > 0 ? 'rgb(var(--destructive-light))' : 'rgb(var(--muted))',
              }}
            >
              <AlertTriangle
                size={18}
                style={{
                  color: overdueCount > 0 ? 'rgb(var(--destructive))' : 'rgb(var(--foreground-muted))',
                }}
              />
            </div>
          </div>
          <p
            className="text-2xl font-bold tabular-nums leading-none mb-1"
            style={{
              color: overdueCount > 0 ? 'rgb(var(--destructive))' : 'rgb(var(--foreground))',
            }}
          >
            {invoicesLoading ? '...' : overdueCount}
          </p>
          <p className="text-xs font-medium" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Überfällig{overdueCount > 0 && ` (${formatEur(overdueAmount)})`}
          </p>
        </motion.div>
      </motion.div>

      {/* ===== Chart + Recent Invoices ===== */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ===== Revenue Chart (last 6 months) ===== */}
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
              Umsatz
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Letzte 6 Monate
            </p>
          </div>
          <div className="p-5">
            {invoicesLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <Loader2 size={20} className="animate-spin" style={{ color: 'rgb(var(--foreground-muted))' }} />
              </div>
            ) : (
              <LazyResponsiveContainer width="100%" height={200}>
                <LazyBarChart data={monthlyData} barSize={32} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <LazyCartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="rgb(var(--border))"
                  />
                  <LazyXAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: 'rgb(var(--foreground-muted))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <LazyYAxis
                    tick={{ fontSize: 11, fill: 'rgb(var(--foreground-muted))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <LazyTooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--muted))' }} />
                  <LazyBar
                    dataKey="betrag"
                    fill="rgb(var(--primary))"
                    radius={[6, 6, 0, 0]}
                  />
                </LazyBarChart>
              </LazyResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* ===== Recent Invoices ===== */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl border overflow-hidden"
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
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : recentInvoices.length === 0 ? (
            <div className="p-8 text-center">
              <FileText size={32} className="mx-auto mb-2" style={{ color: 'rgb(var(--foreground-muted))' }} />
              <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                Noch keine Rechnungen
              </p>
              <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Erstellen Sie Ihre erste Rechnung, um loszulegen
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
              {recentInvoices.map((inv) => {
                const sc = STATUS_COLOR[inv.validation_status] ?? {
                  bg: 'bg-gray-100 dark:bg-gray-800',
                  text: 'text-gray-600 dark:text-gray-400',
                }
                return (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-[rgb(var(--muted))]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className="text-sm font-semibold truncate"
                          style={{ color: 'rgb(var(--foreground))' }}
                        >
                          {inv.invoice_number || inv.invoice_id?.slice(0, 12) || '—'}
                        </p>
                        <span
                          className={cn(
                            'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0',
                            sc.bg,
                            sc.text,
                          )}
                        >
                          {STATUS_LABEL[inv.validation_status] ?? inv.validation_status}
                        </span>
                      </div>
                      <p
                        className="text-xs mt-0.5 truncate"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        {inv.buyer_name || inv.seller_name || '—'} · {inv.invoice_date || '—'}
                      </p>
                    </div>
                    <p
                      className="text-sm font-semibold tabular-nums whitespace-nowrap"
                      style={{ color: 'rgb(var(--foreground))' }}
                    >
                      {inv.gross_amount != null ? formatEurFull(inv.gross_amount) : '—'}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* DATEV Export Dialog */}
      <DATEVExportDialog open={datevOpen} onOpenChange={setDatevOpen} />
    </div>
  )
}
