'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { Upload, Download, FileText, CheckCircle, AlertCircle, SkipForward, RefreshCw, Info } from 'lucide-react'
import { importCsv, downloadImportTemplate, ImportResult } from '@/lib/api'

type Tab = 'import' | 'template'

const COLUMN_DOCS = [
  { header: 'invoice_number', description: 'Eindeutige Rechnungsnummer (Pflichtfeld)', example: 'RE-2026-0001' },
  { header: 'invoice_date', description: 'Rechnungsdatum im Format JJJJ-MM-TT', example: '2026-01-15' },
  { header: 'due_date', description: 'Fälligkeitsdatum im Format JJJJ-MM-TT', example: '2026-02-15' },
  { header: 'buyer_name', description: 'Name des Käufers / Leistungsempfängers', example: 'ACME GmbH' },
  { header: 'buyer_vat_id', description: 'USt-IdNr. des Käufers (optional)', example: 'DE123456789' },
  { header: 'seller_name', description: 'Name des Verkäufers / Leistungserbringers', example: 'Meine Firma GmbH' },
  { header: 'seller_vat_id', description: 'USt-IdNr. des Verkäufers (optional)', example: 'DE987654321' },
  { header: 'net_amount', description: 'Nettobetrag in der Rechnungswährung', example: '1000.00' },
  { header: 'tax_rate', description: 'Steuersatz in Prozent (z. B. 19 oder 7)', example: '19' },
  { header: 'gross_amount', description: 'Bruttobetrag (Netto + Steuer)', example: '1190.00' },
  { header: 'currency', description: 'ISO 4217 Währungscode (Standard: EUR)', example: 'EUR' },
  { header: 'payment_status', description: 'Zahlungsstatus: unpaid, paid, partial, overdue, cancelled', example: 'unpaid' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<Tab>('import')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError('Nur CSV-Dateien werden unterstützt.')
      return
    }
    setSelectedFile(file)
    setResult(null)
    setImportError(null)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleImport = async () => {
    if (!selectedFile) return
    setIsImporting(true)
    setImportError(null)
    setResult(null)
    try {
      const res = await importCsv(selectedFile)
      setResult(res)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string }
      setImportError(
        axiosErr.response?.data?.detail ?? axiosErr.message ?? 'Ein Fehler ist aufgetreten.'
      )
    } finally {
      setIsImporting(false)
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setResult(null)
    setImportError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownloadTemplate = async () => {
    setIsDownloading(true)
    try {
      await downloadImportTemplate()
    } catch {
      // silently ignore download errors
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div className="max-w-3xl mx-auto">
        {/* Page Header */}
        <div className="mb-6">
          <h1
            className="text-2xl font-bold tracking-tight mb-1"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Rechnungen importieren
          </h1>
          <p style={{ color: 'rgb(var(--foreground-muted))' }} className="text-sm">
            Importieren Sie mehrere Rechnungen auf einmal via CSV-Datei.
          </p>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-0 mb-6 border rounded-xl overflow-hidden w-fit"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          {(['import', 'template'] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = {
              import: 'CSV importieren',
              template: 'Vorlage herunterladen',
            }
            const active = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-5 py-2.5 text-sm font-medium transition-colors duration-150"
                style={{
                  backgroundColor: active ? 'rgb(var(--primary))' : 'transparent',
                  color: active ? '#fff' : 'rgb(var(--foreground-muted))',
                }}
              >
                {labels[tab]}
              </button>
            )
          })}
        </div>

        {/* ===== Tab: CSV importieren ===== */}
        {activeTab === 'import' && (
          <div
            className="rounded-2xl border p-6"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            {!result ? (
              <>
                {/* Drop zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className="rounded-xl border-2 border-dashed cursor-pointer transition-colors duration-150 flex flex-col items-center justify-center gap-3 py-12 px-6 text-center select-none"
                  style={{
                    borderColor: isDragging
                      ? 'rgb(var(--primary))'
                      : selectedFile
                      ? 'rgb(var(--primary))'
                      : 'rgb(var(--border))',
                    backgroundColor: isDragging
                      ? 'rgb(var(--primary-light))'
                      : 'transparent',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleInputChange}
                  />
                  {selectedFile ? (
                    <>
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgb(var(--primary-light))' }}
                      >
                        <FileText size={22} style={{ color: 'rgb(var(--primary))' }} />
                      </div>
                      <div>
                        <p
                          className="font-semibold text-sm"
                          style={{ color: 'rgb(var(--foreground))' }}
                        >
                          {selectedFile.name}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
                          {formatBytes(selectedFile.size)}
                        </p>
                      </div>
                      <p className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        Klicken zum Ändern
                      </p>
                    </>
                  ) : (
                    <>
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgb(var(--muted))' }}
                      >
                        <Upload size={22} style={{ color: 'rgb(var(--foreground-muted))' }} />
                      </div>
                      <div>
                        <p
                          className="font-medium text-sm"
                          style={{ color: 'rgb(var(--foreground))' }}
                        >
                          CSV-Datei hier ablegen oder klicken
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                          Nur .csv-Dateien werden unterstützt
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {importError && (
                  <div
                    className="mt-4 flex items-start gap-3 rounded-xl px-4 py-3"
                    style={{
                      backgroundColor: 'rgb(239 68 68 / 0.08)',
                      border: '1px solid rgb(239 68 68 / 0.3)',
                    }}
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: '#ef4444' }} />
                    <p className="text-sm" style={{ color: '#ef4444' }}>{importError}</p>
                  </div>
                )}

                {/* Import button */}
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={handleImport}
                    disabled={!selectedFile || isImporting}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity duration-150 disabled:opacity-40"
                    style={{
                      backgroundColor: 'rgb(var(--primary))',
                      color: '#fff',
                    }}
                  >
                    {isImporting ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw size={15} className="animate-spin" />
                        Importiere Rechnungen...
                      </span>
                    ) : (
                      'Importieren'
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Results panel */
              <div>
                <h2
                  className="text-base font-semibold mb-4"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Import-Ergebnis
                </h2>

                <div className="flex flex-col gap-3 mb-5">
                  {/* Imported */}
                  <div
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{
                      backgroundColor: 'rgb(34 197 94 / 0.08)',
                      border: '1px solid rgb(34 197 94 / 0.25)',
                    }}
                  >
                    <CheckCircle size={18} style={{ color: '#22c55e' }} />
                    <p className="text-sm font-medium" style={{ color: '#16a34a' }}>
                      {result.imported} {result.imported === 1 ? 'Rechnung' : 'Rechnungen'} importiert
                    </p>
                  </div>

                  {/* Skipped */}
                  {result.skipped > 0 && (
                    <div
                      className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{
                        backgroundColor: 'rgb(var(--muted))',
                        border: '1px solid rgb(var(--border))',
                      }}
                    >
                      <SkipForward size={18} style={{ color: 'rgb(var(--foreground-muted))' }} />
                      <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground-muted))' }}>
                        {result.skipped} {result.skipped === 1 ? 'Rechnung' : 'Rechnungen'} übersprungen (Duplikate)
                      </p>
                    </div>
                  )}

                  {/* Info line */}
                  <div
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{
                      backgroundColor: 'rgb(var(--muted))',
                      border: '1px solid rgb(var(--border))',
                    }}
                  >
                    <Info size={18} style={{ color: 'rgb(var(--foreground-muted))' }} />
                    <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                      {result.total_rows} Zeilen insgesamt verarbeitet
                    </p>
                  </div>
                </div>

                {/* Error table */}
                {result.errors.length > 0 && (
                  <div className="mb-5">
                    <div
                      className="flex items-center gap-2 mb-3 rounded-xl px-4 py-3"
                      style={{
                        backgroundColor: 'rgb(239 68 68 / 0.08)',
                        border: '1px solid rgb(239 68 68 / 0.25)',
                      }}
                    >
                      <AlertCircle size={16} style={{ color: '#ef4444' }} />
                      <p className="text-sm font-medium" style={{ color: '#ef4444' }}>
                        {result.errors.length} {result.errors.length === 1 ? 'Fehler' : 'Fehler'} beim Import
                      </p>
                    </div>
                    <div
                      className="rounded-xl border overflow-hidden"
                      style={{ borderColor: 'rgb(var(--border))' }}
                    >
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ backgroundColor: 'rgb(var(--muted))' }}>
                            <th
                              className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider"
                              style={{ color: 'rgb(var(--foreground-muted))' }}
                            >
                              Zeile
                            </th>
                            <th
                              className="text-left px-4 py-2.5 font-semibold text-xs uppercase tracking-wider"
                              style={{ color: 'rgb(var(--foreground-muted))' }}
                            >
                              Fehlermeldung
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.errors.map((err, i) => (
                            <tr
                              key={i}
                              style={{
                                borderTop: i > 0 ? '1px solid rgb(var(--border))' : undefined,
                              }}
                            >
                              <td
                                className="px-4 py-2.5 font-mono text-xs"
                                style={{ color: 'rgb(var(--foreground))' }}
                              >
                                {err.row}
                              </td>
                              <td
                                className="px-4 py-2.5 text-xs"
                                style={{ color: '#ef4444' }}
                              >
                                {err.error}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-colors duration-150"
                  style={{
                    borderColor: 'rgb(var(--border))',
                    color: 'rgb(var(--foreground))',
                    backgroundColor: 'transparent',
                  }}
                >
                  <RefreshCw size={15} />
                  Weiteren Import starten
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== Tab: Vorlage herunterladen ===== */}
        {activeTab === 'template' && (
          <div
            className="rounded-2xl border p-6"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
          >
            <div className="mb-5">
              <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Laden Sie die CSV-Vorlage herunter und füllen Sie Ihre Rechnungsdaten ein.
                Die Datei kann direkt mit Excel oder LibreOffice Calc geöffnet werden.
              </p>
            </div>

            {/* Column reference table */}
            <div
              className="rounded-xl border overflow-hidden mb-6"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'rgb(var(--muted))' }}>
                    <th
                      className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Spalte
                    </th>
                    <th
                      className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Beschreibung
                    </th>
                    <th
                      className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Beispiel
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMN_DOCS.map((col, i) => (
                    <tr
                      key={col.header}
                      style={{
                        borderTop: i > 0 ? '1px solid rgb(var(--border))' : undefined,
                        backgroundColor: i % 2 === 0 ? 'transparent' : 'rgb(var(--muted) / 0.4)',
                      }}
                    >
                      <td className="px-4 py-2.5">
                        <code
                          className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: 'rgb(var(--primary-light))',
                            color: 'rgb(var(--primary))',
                          }}
                        >
                          {col.header}
                        </code>
                      </td>
                      <td
                        className="px-4 py-2.5 text-xs"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        {col.description}
                      </td>
                      <td
                        className="px-4 py-2.5 text-xs font-mono"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        {col.example}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleDownloadTemplate}
              disabled={isDownloading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity duration-150 disabled:opacity-50"
              style={{
                backgroundColor: 'rgb(var(--primary))',
                color: '#fff',
              }}
            >
              {isDownloading ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  Wird heruntergeladen...
                </>
              ) : (
                <>
                  <Download size={15} />
                  Vorlage herunterladen
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
