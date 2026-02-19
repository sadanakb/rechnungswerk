'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  Upload,
  List,
  CheckCircle,
  Activity,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { getHealth } from '@/lib/api'

interface HealthData {
  status: string
  database: string
  tesseract_installed: boolean
  tesseract_version?: string
  kosit_validator: string
  total_invoices: number
  xrechnung_version?: string
}

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthError, setHealthError] = useState(false)

  const fetchHealth = async () => {
    setHealthLoading(true)
    setHealthError(false)
    try {
      const data = await getHealth()
      setHealth(data)
    } catch {
      setHealthError(true)
    } finally {
      setHealthLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  const isBackendOnline = !healthError && health?.status === 'healthy'

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          E-Rechnung leicht gemacht
        </h1>
        <p className="text-gray-500 max-w-xl mx-auto">
          PDF per OCR einlesen oder Formular ausfüllen – in Sekunden ein
          XRechnung 3.0.2 konformes UBL XML erstellen.
        </p>
      </div>

      {/* Backend Status Bar */}
      <div className="mb-8 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {healthLoading ? (
              <Loader2 className="animate-spin text-gray-400" size={16} />
            ) : healthError ? (
              <AlertCircle className="text-red-500" size={16} />
            ) : (
              <Activity
                className={isBackendOnline ? 'text-green-500' : 'text-yellow-500'}
                size={16}
              />
            )}
            <span className="text-sm font-medium text-gray-700">
              Backend Status:{' '}
              <span
                className={
                  healthLoading
                    ? 'text-gray-400'
                    : healthError
                    ? 'text-red-600'
                    : isBackendOnline
                    ? 'text-green-600'
                    : 'text-yellow-600'
                }
              >
                {healthLoading
                  ? 'Prüfe...'
                  : healthError
                  ? 'Nicht erreichbar (Port 8001)'
                  : isBackendOnline
                  ? 'Online'
                  : 'Eingeschränkt'}
              </span>
            </span>
          </div>

          {/* Stats chips */}
          {health && !healthError && (
            <div className="flex flex-wrap gap-3 text-xs">
              <StatusChip
                label="Rechnungen"
                value={String(health.total_invoices)}
                color="blue"
              />
              <StatusChip
                label="Tesseract"
                value={health.tesseract_installed ? health.tesseract_version ?? 'OK' : 'Fehlt'}
                color={health.tesseract_installed ? 'green' : 'red'}
              />
              <StatusChip
                label="XRechnung"
                value={health.xrechnung_version ?? '3.0.2'}
                color="blue"
              />
              <StatusChip
                label="KoSIT"
                value={
                  health.kosit_validator === 'available'
                    ? 'Online'
                    : health.kosit_validator === 'not_running'
                    ? 'Nicht aktiv'
                    : 'N/A'
                }
                color={health.kosit_validator === 'available' ? 'green' : 'gray'}
              />
            </div>
          )}

          <button
            onClick={fetchHealth}
            disabled={healthLoading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
            title="Neu laden"
          >
            <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Mode cards */}
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Was möchten Sie tun?</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Modus A */}
        <Link
          href="/ocr"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-400 hover:shadow-md transition-all block group"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="bg-blue-100 rounded-lg p-3 group-hover:bg-blue-200 transition-colors">
              <Upload className="text-blue-600" size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-blue-500 uppercase tracking-wide">Modus A</p>
              <h3 className="text-base font-semibold text-gray-800 leading-tight">OCR Upload</h3>
            </div>
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">
            PDF-Rechnung hochladen → Felder automatisch via Tesseract OCR extrahieren →
            XRechnung 3.0.2 XML generieren.
          </p>
          <span className="mt-4 inline-flex items-center text-xs text-blue-600 font-medium">
            Jetzt PDF hochladen →
          </span>
        </Link>

        {/* Modus B */}
        <Link
          href="/manual"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-green-400 hover:shadow-md transition-all block group"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="bg-green-100 rounded-lg p-3 group-hover:bg-green-200 transition-colors">
              <FileText className="text-green-600" size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Modus B</p>
              <h3 className="text-base font-semibold text-gray-800 leading-tight">
                Manuelle Eingabe
              </h3>
            </div>
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">
            Alle BT-Felder (BT-1, BT-2, BT-27, BT-31, BT-44 …) direkt eingeben und
            XRechnung 3.0.2 konformes UBL XML generieren.
          </p>
          <span className="mt-4 inline-flex items-center text-xs text-green-600 font-medium">
            Formular öffnen →
          </span>
        </Link>

        {/* Modus C */}
        <Link
          href="/invoices"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-purple-400 hover:shadow-md transition-all block group"
        >
          <div className="flex items-center gap-4 mb-3">
            <div className="bg-purple-100 rounded-lg p-3 group-hover:bg-purple-200 transition-colors">
              <List className="text-purple-600" size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-purple-500 uppercase tracking-wide">Modus C</p>
              <h3 className="text-base font-semibold text-gray-800 leading-tight">
                Rechnungsliste
              </h3>
            </div>
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">
            Alle Rechnungen anzeigen, XRechnung XML herunterladen und Verarbeitungsstatus
            prüfen.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="inline-flex items-center text-xs text-purple-600 font-medium">
              Alle Rechnungen anzeigen →
            </span>
            {health && !healthError && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                {health.total_invoices}
              </span>
            )}
          </div>
        </Link>

        {/* Modus D – coming soon */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 opacity-50 cursor-not-allowed select-none">
          <div className="flex items-center gap-4 mb-3">
            <div className="bg-orange-100 rounded-lg p-3">
              <CheckCircle className="text-orange-600" size={22} />
            </div>
            <div>
              <p className="text-xs font-medium text-orange-500 uppercase tracking-wide">Modus D</p>
              <h3 className="text-base font-semibold text-gray-800 leading-tight">
                KoSIT Validator
              </h3>
            </div>
          </div>
          <p className="text-gray-500 text-sm leading-relaxed">
            XRechnung XML gegen XRechnung 3.0.2 Schematron validieren.
          </p>
          <span className="mt-4 block text-xs text-orange-500">
            Benötigt KoSIT Docker Container (Port 8080)
          </span>
        </div>
      </div>

      {/* Info footer */}
      <div className="mt-10 rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          XRechnung 3.0.2 – Pflichtfelder (Auswahl)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-500">
          {[
            'BT-1 Rechnungsnummer',
            'BT-2 Rechnungsdatum',
            'BT-3 Rechnungstyp (380)',
            'BT-5 Währung (EUR)',
            'BT-27 Verkäufername',
            'BT-31 USt-IdNr. Verkäufer',
            'BT-44 Käufername',
            'BT-109 Nettobetrag',
            'BT-110 MwSt-Betrag',
            'BT-112 Zahlbetrag (Brutto)',
          ].map((bt) => (
            <span
              key={bt}
              className="bg-gray-50 rounded px-2 py-1 font-mono"
            >
              {bt}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Seit 01.01.2025 Empfangspflicht für alle B2B-Unternehmen · Ab 01.01.2027
          Sendepflicht für Unternehmen &gt;800.000 EUR · Ab 01.01.2028 für alle
        </p>
      </div>
    </main>
  )
}

function StatusChip({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: 'green' | 'red' | 'blue' | 'gray'
}) {
  const colors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`px-2 py-1 rounded-full font-medium ${colors[color]}`}>
      {label}: {value}
    </span>
  )
}
