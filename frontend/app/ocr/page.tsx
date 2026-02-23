'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  CheckCircle,
  Loader2,
  Download,
  AlertCircle,
  Edit2,
  Save,
  FileText,
  ArrowRight,
  Cpu,
  Shield,
  XCircle,
  Layers,
} from 'lucide-react'
import {
  uploadPDFForOCR,
  uploadBatchForOCR,
  createInvoice,
  generateXRechnung,
  getErrorMessage,
  API_BASE,
  type OCRResult,
  type BatchJobResponse,
} from '@/lib/api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EditableFields {
  invoice_number: string
  invoice_date: string
  due_date: string
  seller_name: string
  seller_vat_id: string
  seller_address: string
  seller_endpoint_id: string
  buyer_name: string
  buyer_vat_id: string
  buyer_address: string
  buyer_reference: string
  buyer_endpoint_id: string
  iban: string
  bic: string
  payment_account_name: string
  net_amount: string
  tax_amount: string
  gross_amount: string
  tax_rate: string
}

function fieldsFromOCR(ocr: OCRResult): EditableFields {
  const f = ocr.suggestions ?? ocr.fields ?? {}
  return {
    invoice_number: String(f.invoice_number ?? ''),
    invoice_date: String(f.invoice_date ?? ''),
    due_date: String(f.due_date ?? ''),
    seller_name: String(f.seller_name ?? ''),
    seller_vat_id: String(f.seller_vat_id ?? ''),
    seller_address: String(f.seller_address ?? ''),
    seller_endpoint_id: String(f.seller_endpoint_id ?? ''),
    buyer_name: String(f.buyer_name ?? ''),
    buyer_vat_id: String(f.buyer_vat_id ?? ''),
    buyer_address: String(f.buyer_address ?? ''),
    buyer_reference: String(f.buyer_reference ?? ''),
    buyer_endpoint_id: String(f.buyer_endpoint_id ?? ''),
    iban: String(f.iban ?? ''),
    bic: String(f.bic ?? ''),
    payment_account_name: String(f.payment_account_name ?? ''),
    net_amount: String(f.net_amount ?? ''),
    tax_amount: String(f.tax_amount ?? ''),
    gross_amount: String(f.gross_amount ?? ''),
    tax_rate: String(f.tax_rate ?? '19'),
  }
}

const FIELD_LABELS: Record<keyof EditableFields, string> = {
  invoice_number: 'Rechnungsnummer (BT-1)',
  invoice_date: 'Rechnungsdatum (BT-2)',
  due_date: 'Fälligkeitsdatum (BT-9)',
  seller_name: 'Verkäufer Name (BT-27)',
  seller_vat_id: 'Verkäufer USt-IdNr. (BT-31)',
  seller_address: 'Verkäufer Adresse (BT-35)',
  seller_endpoint_id: 'Verkäufer E-Mail (BT-34)',
  buyer_name: 'Käufer Name (BT-44)',
  buyer_vat_id: 'Käufer USt-IdNr. (BT-48)',
  buyer_address: 'Käufer Adresse (BT-50)',
  buyer_reference: 'Leitweg-ID / Referenz (BT-10)',
  buyer_endpoint_id: 'Käufer E-Mail (BT-49)',
  iban: 'IBAN (BT-84)',
  bic: 'BIC/SWIFT (BT-86)',
  payment_account_name: 'Kontoinhaber (BT-85)',
  net_amount: 'Nettobetrag (BT-109)',
  tax_amount: 'MwSt-Betrag (BT-110)',
  gross_amount: 'Bruttobetrag (BT-112)',
  tax_rate: 'MwSt-Satz %',
}

// ---------------------------------------------------------------------------
// Processing steps for the animated progress indicator
// ---------------------------------------------------------------------------
const PROCESSING_STEPS = [
  'PDF wird hochgeladen',
  'Bild wird vorverarbeitet (denoise, CLAHE)',
  'Tesseract OCR läuft',
  'Felder werden geparst',
  'Konsistenz wird geprüft',
]

// ---------------------------------------------------------------------------
// Confidence dot component
// ---------------------------------------------------------------------------
function ConfidenceDot({ value }: { value?: number }) {
  if (value === undefined) return null
  const level = value >= 70 ? 'high' : value >= 40 ? 'medium' : 'low'
  const colors = {
    high: 'bg-emerald-500',
    medium: 'bg-amber-400',
    low: 'bg-red-500',
  }
  const titles = {
    high: `Hohe Konfidenz (${Math.round(value)}%)`,
    medium: `Mittlere Konfidenz (${Math.round(value)}%)`,
    low: `Niedrige Konfidenz (${Math.round(value)}%)`,
  }
  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full shrink-0 mt-1', colors[level])}
      title={titles[level]}
    />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OCRPage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processingStep, setProcessingStep] = useState(0)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editedFields, setEditedFields] = useState<EditableFields | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generatingXML, setGeneratingXML] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  // Batch state
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchUploading, setBatchUploading] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchJobResponse | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)

  // --- Single file dropzone ---
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    setUploadedFile(file)
    setUploading(true)
    setError(null)
    setOcrResult(null)
    setEditMode(false)
    setEditedFields(null)
    setDownloadUrl(null)
    setProcessingStep(0)

    // Simulate step progression
    const stepInterval = setInterval(() => {
      setProcessingStep((s) => Math.min(s + 1, PROCESSING_STEPS.length - 1))
    }, 900)

    try {
      const data = await uploadPDFForOCR(file)
      clearInterval(stepInterval)
      setProcessingStep(PROCESSING_STEPS.length)
      setOcrResult(data)
      setEditedFields(fieldsFromOCR(data))
    } catch (err: unknown) {
      clearInterval(stepInterval)
      setError(getErrorMessage(err, 'OCR-Verarbeitung fehlgeschlagen'))
    } finally {
      setUploading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploading,
  })

  // --- Batch dropzone ---
  const onBatchDrop = useCallback((acceptedFiles: File[]) => {
    setBatchFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      const newFiles = acceptedFiles.filter((f) => !existing.has(f.name))
      return [...prev, ...newFiles]
    })
  }, [])

  const { getRootProps: getBatchRootProps, getInputProps: getBatchInputProps, isDragActive: isBatchDragActive } = useDropzone({
    onDrop: onBatchDrop,
    accept: { 'application/pdf': ['.pdf'] },
    disabled: batchUploading,
  })

  const handleBatchUpload = async () => {
    if (!batchFiles.length) return
    setBatchUploading(true)
    setBatchError(null)
    setBatchResult(null)
    try {
      const result = await uploadBatchForOCR(batchFiles)
      setBatchResult(result)
    } catch (err: unknown) {
      setBatchError(getErrorMessage(err, 'Batch-Upload fehlgeschlagen'))
    } finally {
      setBatchUploading(false)
    }
  }

  // --- Generate XML ---
  const handleGenerateXML = async () => {
    if (!ocrResult || !editedFields) return
    setGeneratingXML(true)
    setError(null)
    try {
      const lineNet = parseFloat(editedFields.net_amount) || 0
      const taxRate = parseFloat(editedFields.tax_rate) || 19

      const invoicePayload = {
        invoice_number: editedFields.invoice_number || ocrResult.invoice_id,
        invoice_date: editedFields.invoice_date || new Date().toISOString().split('T')[0],
        due_date: editedFields.due_date || undefined,
        seller_name: editedFields.seller_name || 'Unbekannt',
        seller_vat_id: editedFields.seller_vat_id || 'DE000000000',
        seller_address: editedFields.seller_address || '',
        seller_endpoint_id: editedFields.seller_endpoint_id || undefined,
        buyer_name: editedFields.buyer_name || 'Unbekannt',
        buyer_vat_id: editedFields.buyer_vat_id || '',
        buyer_address: editedFields.buyer_address || '',
        buyer_reference: editedFields.buyer_reference || undefined,
        buyer_endpoint_id: editedFields.buyer_endpoint_id || undefined,
        iban: editedFields.iban || undefined,
        bic: editedFields.bic || undefined,
        payment_account_name: editedFields.payment_account_name || undefined,
        tax_rate: taxRate,
        line_items: [
          {
            description: 'OCR-extrahierte Rechnung',
            quantity: 1,
            unit_price: lineNet,
            net_amount: lineNet,
            tax_rate: taxRate,
          },
        ],
      }

      const invoice = await createInvoice(invoicePayload)
      const xmlResult = await generateXRechnung(invoice.invoice_id)

      const url = xmlResult?.download_url
        ? `${API_BASE}${xmlResult.download_url}`
        : `${API_BASE}/api/invoices/${invoice.invoice_id}/download-xrechnung`

      setDownloadUrl(url)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Fehler bei XML-Generierung'))
    } finally {
      setGeneratingXML(false)
    }
  }

  const inputClass =
    'w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 max-w-7xl mx-auto">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--foreground))' }}>
          OCR Upload
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
          PDF-Rechnung hochladen, Felder automatisch extrahieren und XRechnung 3.0.2 generieren
        </p>
      </motion.div>

      {/* ===== Split View Layout ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ===== LEFT: Upload + File Info ===== */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-4"
        >
          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={cn(
              'rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200',
              isDragActive
                ? 'border-blue-500 drag-active-glow'
                : uploading
                ? 'cursor-not-allowed border-opacity-50'
                : 'hover:border-blue-400'
            )}
            style={{
              borderColor: isDragActive
                ? 'rgb(var(--primary))'
                : 'rgb(var(--border-strong))',
              backgroundColor: isDragActive
                ? 'rgb(var(--primary-light))'
                : uploading
                ? 'rgb(var(--muted))'
                : 'rgb(var(--card))',
            }}
          >
            <input {...getInputProps()} />
            <AnimatePresence mode="wait">
              {uploading ? (
                <motion.div
                  key="uploading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2"
                >
                  <Loader2
                    size={36}
                    className="animate-spin"
                    style={{ color: 'rgb(var(--primary))' }}
                  />
                  <p className="font-medium text-sm" style={{ color: 'rgb(var(--foreground))' }}>
                    Wird verarbeitet...
                  </p>
                </motion.div>
              ) : isDragActive ? (
                <motion.div
                  key="drag"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Upload size={38} className="mx-auto mb-3" style={{ color: 'rgb(var(--primary))' }} />
                  <p className="font-semibold" style={{ color: 'rgb(var(--primary))' }}>
                    PDF hier ablegen...
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Upload
                    size={38}
                    className="mx-auto mb-4"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  />
                  <p className="font-semibold mb-1" style={{ color: 'rgb(var(--foreground))' }}>
                    PDF-Rechnung hier ablegen
                  </p>
                  <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    oder klicken zum Auswählen · nur PDF · max. 10 MB
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Processing Steps Indicator */}
          <AnimatePresence>
            {uploading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border overflow-hidden"
                style={{
                  backgroundColor: 'rgb(var(--card))',
                  borderColor: 'rgb(var(--border))',
                }}
              >
                <div className="px-5 py-4">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide mb-3"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    Verarbeitungsschritte
                  </p>
                  <div className="space-y-2">
                    {PROCESSING_STEPS.map((step, i) => {
                      const done = i < processingStep
                      const active = i === processingStep
                      return (
                        <div key={step} className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                            )}
                            style={{
                              backgroundColor: done
                                ? 'rgb(var(--accent))'
                                : active
                                ? 'rgb(var(--primary))'
                                : 'rgb(var(--muted))',
                            }}
                          >
                            {done ? (
                              <CheckCircle size={12} className="text-white" />
                            ) : active ? (
                              <Loader2 size={12} className="animate-spin text-white" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                            )}
                          </div>
                          <span
                            className="text-sm"
                            style={{
                              color: done || active
                                ? 'rgb(var(--foreground))'
                                : 'rgb(var(--foreground-muted))',
                              fontWeight: active ? 500 : 400,
                            }}
                          >
                            {step}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* File info card (after upload) */}
          <AnimatePresence>
            {uploadedFile && !uploading && ocrResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border p-4 flex items-start gap-4"
                style={{
                  backgroundColor: 'rgb(var(--card))',
                  borderColor: 'rgb(var(--border))',
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgb(var(--primary-light))' }}
                >
                  <FileText size={20} style={{ color: 'rgb(var(--primary))' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'rgb(var(--foreground))' }}>
                    {uploadedFile.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    {(uploadedFile.size / 1024).toFixed(1)} KB
                    {ocrResult.total_pages ? ` · ${ocrResult.total_pages} Seite${ocrResult.total_pages > 1 ? 'n' : ''}` : ''}
                    {ocrResult.ocr_engine ? ` · ${ocrResult.ocr_engine}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'rgb(var(--accent-light))',
                      color: 'rgb(var(--accent))',
                    }}
                  >
                    {Math.round(ocrResult.confidence ?? 0)}% Konfidenz
                  </span>
                  {ocrResult.completeness !== undefined && (
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'rgb(var(--primary-light))',
                        color: 'rgb(var(--primary))',
                      }}
                    >
                      {Math.round(ocrResult.completeness)}% vollständig
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Consistency checks */}
          <AnimatePresence>
            {ocrResult?.consistency_checks && ocrResult.consistency_checks.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border overflow-hidden"
                style={{
                  backgroundColor: 'rgb(var(--card))',
                  borderColor: 'rgb(var(--border))',
                }}
              >
                <div
                  className="px-5 py-3 border-b flex items-center gap-2"
                  style={{ borderColor: 'rgb(var(--border))' }}
                >
                  <Shield size={14} style={{ color: 'rgb(var(--foreground-muted))' }} />
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    Konsistenzprüfungen
                  </p>
                </div>
                <div className="p-4 space-y-2">
                  {ocrResult.consistency_checks.map((check, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      {check.passed ? (
                        <CheckCircle
                          size={14}
                          className="shrink-0 mt-0.5"
                          style={{ color: 'rgb(var(--accent))' }}
                        />
                      ) : (
                        <XCircle
                          size={14}
                          className="shrink-0 mt-0.5"
                          style={{ color: 'rgb(var(--destructive))' }}
                        />
                      )}
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                          {check.name}
                        </p>
                        <p className="text-[11px]" style={{ color: 'rgb(var(--foreground-muted))' }}>
                          {check.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border p-4 flex items-start gap-3"
                style={{
                  backgroundColor: 'rgb(var(--destructive-light))',
                  borderColor: 'rgb(var(--destructive-border))',
                }}
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: 'rgb(var(--destructive))' }} />
                <p className="text-sm" style={{ color: 'rgb(var(--destructive))' }}>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ===== RIGHT: Extracted Fields ===== */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
        >
          <AnimatePresence mode="wait">
            {!ocrResult ? (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[400px] rounded-xl border-2 border-dashed flex items-center justify-center"
                style={{
                  borderColor: 'rgb(var(--border))',
                  backgroundColor: 'rgb(var(--muted))',
                }}
              >
                <div className="text-center px-8">
                  <Cpu size={40} className="mx-auto mb-3" style={{ color: 'rgb(var(--foreground-muted))' }} />
                  <p className="font-medium text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    Extrahierte Felder erscheinen hier
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    Nach dem PDF-Upload werden die erkannten Felder angezeigt
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border overflow-hidden"
                style={{
                  backgroundColor: 'rgb(var(--card))',
                  borderColor: 'rgb(var(--border))',
                }}
              >
                {/* Result header */}
                <div
                  className="flex items-center justify-between px-5 py-4 border-b"
                  style={{ borderColor: 'rgb(var(--border))' }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} style={{ color: 'rgb(var(--accent))' }} />
                    <span className="font-semibold text-sm" style={{ color: 'rgb(var(--foreground))' }}>
                      OCR erfolgreich
                    </span>
                    {ocrResult.source && (
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded font-mono font-medium"
                        style={{
                          backgroundColor: 'rgb(var(--muted))',
                          color: 'rgb(var(--foreground-muted))',
                        }}
                      >
                        {ocrResult.source}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setEditMode((e) => !e)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors'
                    )}
                    style={{
                      backgroundColor: editMode
                        ? 'rgb(var(--primary-light))'
                        : 'rgb(var(--muted))',
                      color: editMode
                        ? 'rgb(var(--primary))'
                        : 'rgb(var(--foreground))',
                    }}
                  >
                    {editMode ? <Save size={12} /> : <Edit2 size={12} />}
                    {editMode ? 'Bearbeitung aktiv' : 'Felder bearbeiten'}
                  </button>
                </div>

                {/* Fields grid */}
                <div className="p-5">
                  {editMode && (
                    <p className="text-xs mb-3" style={{ color: 'rgb(var(--primary))' }}>
                      Felder können direkt bearbeitet werden
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {(Object.keys(FIELD_LABELS) as (keyof EditableFields)[]).map((key) => {
                      if (!editedFields) return null
                      const value = editedFields[key]
                      const hasValue = value !== '' && value !== 'null' && value !== 'undefined'
                      const confidence = ocrResult.field_confidences?.[key]

                      return (
                        <div
                          key={key}
                          className="rounded-lg p-3 border"
                          style={{
                            backgroundColor: hasValue
                              ? 'rgb(var(--muted))'
                              : 'rgb(var(--destructive-light))',
                            borderColor: hasValue
                              ? 'rgb(var(--border))'
                              : 'rgb(var(--destructive-border))',
                          }}
                        >
                          <div className="flex items-start gap-1.5 mb-1">
                            <ConfidenceDot value={confidence} />
                            <p
                              className="text-[11px] leading-tight"
                              style={{ color: 'rgb(var(--foreground-muted))' }}
                            >
                              {FIELD_LABELS[key]}
                            </p>
                          </div>
                          {editMode ? (
                            <input
                              value={editedFields[key]}
                              onChange={(e) =>
                                setEditedFields((prev) =>
                                  prev ? { ...prev, [key]: e.target.value } : prev,
                                )
                              }
                              className={cn(inputClass)}
                              style={{
                                backgroundColor: 'rgb(var(--input))',
                                borderColor: 'rgb(var(--input-border))',
                                color: 'rgb(var(--foreground))',
                              }}
                              placeholder={hasValue ? undefined : '— nicht erkannt —'}
                            />
                          ) : (
                            <p
                              className={cn('text-sm font-medium truncate')}
                              style={{
                                color: hasValue
                                  ? 'rgb(var(--foreground))'
                                  : 'rgb(var(--destructive))',
                                fontStyle: hasValue ? 'normal' : 'italic',
                              }}
                            >
                              {hasValue ? value : '— nicht erkannt —'}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Raw OCR text */}
                  {ocrResult.extracted_text && (
                    <details className="mt-4">
                      <summary
                        className="text-xs cursor-pointer hover:underline select-none"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        Roher OCR-Text anzeigen
                      </summary>
                      <pre
                        className="mt-2 text-xs rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap"
                        style={{
                          backgroundColor: 'rgb(var(--muted))',
                          color: 'rgb(var(--foreground-muted))',
                        }}
                      >
                        {ocrResult.extracted_text}
                      </pre>
                    </details>
                  )}

                  {/* Actions */}
                  <div
                    className="flex flex-wrap items-center gap-3 pt-4 mt-4 border-t"
                    style={{ borderColor: 'rgb(var(--border))' }}
                  >
                    {!downloadUrl ? (
                      <button
                        onClick={handleGenerateXML}
                        disabled={generatingXML}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                        style={{ backgroundColor: 'rgb(var(--primary))' }}
                        onMouseEnter={(e) => {
                          if (!generatingXML) e.currentTarget.style.backgroundColor = 'rgb(var(--primary-hover))'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgb(var(--primary))'
                        }}
                      >
                        {generatingXML ? (
                          <Loader2 className="animate-spin" size={15} />
                        ) : (
                          <Download size={15} />
                        )}
                        {generatingXML ? 'Generiert...' : 'XRechnung XML generieren'}
                      </button>
                    ) : (
                      <>
                        <a
                          href={downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                          style={{ backgroundColor: 'rgb(var(--accent))' }}
                        >
                          <Download size={15} /> XML herunterladen
                        </a>
                        <span
                          className="flex items-center gap-1.5 text-sm font-medium"
                          style={{ color: 'rgb(var(--accent))' }}
                        >
                          <CheckCircle size={14} /> XRechnung 3.0.2 erstellt
                        </span>
                      </>
                    )}

                    <Link
                      href="/invoices"
                      className="flex items-center gap-1 text-sm ml-auto"
                      style={{ color: 'rgb(var(--primary))' }}
                    >
                      Rechnungsliste <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ===== Batch Upload Section ===== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-8 rounded-xl border overflow-hidden"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <div
          className="px-5 py-4 border-b flex items-center gap-2"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <Layers size={16} style={{ color: 'rgb(var(--foreground-muted))' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
            Batch-Upload
          </h2>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: 'rgb(var(--primary-light))',
              color: 'rgb(var(--primary))',
            }}
          >
            Mehrere PDFs
          </span>
        </div>

        <div className="p-5">
          {/* Batch drop zone */}
          <div
            {...getBatchRootProps()}
            className={cn(
              'rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 mb-4',
            )}
            style={{
              borderColor: isBatchDragActive ? 'rgb(var(--primary))' : 'rgb(var(--border-strong))',
              backgroundColor: isBatchDragActive ? 'rgb(var(--primary-light))' : 'rgb(var(--muted))',
            }}
          >
            <input {...getBatchInputProps()} />
            <Upload size={24} className="mx-auto mb-2" style={{ color: 'rgb(var(--foreground-muted))' }} />
            <p className="text-sm" style={{ color: 'rgb(var(--foreground))' }}>
              {isBatchDragActive
                ? 'Dateien hier ablegen...'
                : 'Mehrere PDFs hier ablegen oder klicken'}
            </p>
          </div>

          {/* File list */}
          {batchFiles.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {batchFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: 'rgb(var(--muted))' }}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={14} style={{ color: 'rgb(var(--foreground-muted))' }} />
                    <span className="truncate max-w-[200px]" style={{ color: 'rgb(var(--foreground))' }}>
                      {file.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'rgb(var(--foreground-muted))' }}>
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      onClick={() => setBatchFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      style={{ color: 'rgb(var(--destructive))' }}
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleBatchUpload}
              disabled={batchFiles.length === 0 || batchUploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              {batchUploading ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <Upload size={15} />
              )}
              {batchUploading
                ? 'Wird verarbeitet...'
                : `${batchFiles.length} PDF${batchFiles.length !== 1 ? 's' : ''} verarbeiten`}
            </button>

            {batchFiles.length > 0 && (
              <button
                onClick={() => setBatchFiles([])}
                className="text-xs"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Alle entfernen
              </button>
            )}
          </div>

          {/* Batch error */}
          {batchError && (
            <div
              className="mt-3 rounded-lg border p-3 flex items-center gap-2 text-sm"
              style={{
                backgroundColor: 'rgb(var(--destructive-light))',
                borderColor: 'rgb(var(--destructive-border))',
                color: 'rgb(var(--destructive))',
              }}
            >
              <AlertCircle size={14} />
              {batchError}
            </div>
          )}

          {/* Batch results */}
          {batchResult && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Ergebnis: {batchResult.processed} verarbeitet · {batchResult.failed} Fehler
              </p>
              {batchResult.results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm border"
                  style={{
                    backgroundColor: 'rgb(var(--muted))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <span className="truncate max-w-[200px]" style={{ color: 'rgb(var(--foreground))' }}>
                    {r.filename}
                  </span>
                  <span
                    className={cn(
                      'text-[11px] font-medium px-2 py-0.5 rounded-full',
                      r.status === 'success'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700',
                    )}
                  >
                    {r.status === 'success'
                      ? `OK · ${Math.round(r.confidence ?? 0)}%`
                      : r.error_message ?? 'Fehler'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
