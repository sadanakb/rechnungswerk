'use client'

import { useState } from 'react'
import { Download, Loader2, FileSpreadsheet } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { exportDATEV } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DATEVExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return yyyy-MM-dd for the first day of the current month. */
function firstOfMonth(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

/** Return yyyy-MM-dd for today. */
function today(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DATEVExportDialog({ open, onOpenChange }: DATEVExportDialogProps) {
  const [kontenrahmen, setKontenrahmen] = useState<'SKR03' | 'SKR04'>('SKR03')
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = exportDATEV('buchungsstapel', kontenrahmen)
      // Trigger file download via hidden link
      const link = document.createElement('a')
      link.href = url
      link.download = ''
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Close dialog after short delay so user sees the download started
      setTimeout(() => {
        setLoading(false)
        onOpenChange(false)
      }, 600)
    } catch {
      setError('Export fehlgeschlagen. Ist das Backend erreichbar?')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'rgb(var(--accent) / 0.12)' }}
            >
              <FileSpreadsheet size={18} style={{ color: 'rgb(var(--accent))' }} />
            </div>
            <DialogTitle>DATEV Export</DialogTitle>
          </div>
        </DialogHeader>

        <DialogDescription className="sr-only">
          Exportieren Sie Ihre Rechnungen im DATEV-kompatiblen Format.
        </DialogDescription>

        {/* Body */}
        <div className="px-6 py-2 space-y-5">
          {/* SKR selection */}
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wider mb-2.5 text-slate-500 dark:text-slate-400">
              Kontenrahmen
            </legend>
            <div className="space-y-2">
              <label
                className={`
                  flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors
                  ${kontenrahmen === 'SKR03'
                    ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}
                `}
              >
                <input
                  type="radio"
                  name="kontenrahmen"
                  value="SKR03"
                  checked={kontenrahmen === 'SKR03'}
                  onChange={() => setKontenrahmen('SKR03')}
                  className="mt-0.5 accent-teal-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    SKR03
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Standardkontenrahmen &mdash; am weitesten verbreitet
                  </p>
                </div>
              </label>

              <label
                className={`
                  flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors
                  ${kontenrahmen === 'SKR04'
                    ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}
                `}
              >
                <input
                  type="radio"
                  name="kontenrahmen"
                  value="SKR04"
                  checked={kontenrahmen === 'SKR04'}
                  onChange={() => setKontenrahmen('SKR04')}
                  className="mt-0.5 accent-teal-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    SKR04
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Erweiterter Kontenrahmen &mdash; fuer groessere Unternehmen
                  </p>
                </div>
              </label>
            </div>
          </fieldset>

          {/* Date range */}
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wider mb-2.5 text-slate-500 dark:text-slate-400">
              Zeitraum
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="datev-from"
                  className="block text-xs font-medium mb-1 text-slate-500 dark:text-slate-400"
                >
                  Von
                </label>
                <input
                  id="datev-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500
                    border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950
                    text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label
                  htmlFor="datev-to"
                  className="block text-xs font-medium mb-1 text-slate-500 dark:text-slate-400"
                >
                  Bis
                </label>
                <input
                  id="datev-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500
                    border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950
                    text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </fieldset>

          {/* Info box */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2.5">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Exportiert als DATEV-CSV kompatibel mit DATEV Unternehmen online
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2.5">
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors
              border-slate-200 dark:border-slate-800
              text-slate-700 dark:text-slate-300
              hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors
              bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Exportiere...
              </>
            ) : (
              <>
                <Download size={15} />
                Exportieren
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
