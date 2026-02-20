'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Link from 'next/link'
import {
  Upload,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Download,
  AlertCircle,
  Edit2,
  Save,
} from 'lucide-react'
import { uploadPDFForOCR, createInvoice, generateXRechnung, type OCRResult } from '@/lib/api'

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
// Page
// ---------------------------------------------------------------------------

export default function OCRPage() {
  const [uploading, setUploading] = useState(false)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editedFields, setEditedFields] = useState<EditableFields | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generatingXML, setGeneratingXML] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  // --- Dropzone ---
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setOcrResult(null)
    setEditMode(false)
    setEditedFields(null)
    setDownloadUrl(null)
    try {
      const data = await uploadPDFForOCR(file)
      setOcrResult(data)
      setEditedFields(fieldsFromOCR(data))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(e.response?.data?.detail ?? `Fehler: ${e.message}`)
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

  // --- Generate XML from (possibly edited) fields ---
  const handleGenerateXML = async () => {
    if (!ocrResult || !editedFields) return
    setGeneratingXML(true)
    setError(null)
    try {
      // We need a proper invoice record – create it first from edited data, then generate XML
      const lineNet = parseFloat(editedFields.net_amount) || 0
      const unitPrice = lineNet  // single line item from OCR
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
            unit_price: unitPrice,
            net_amount: lineNet,
            tax_rate: taxRate,
          },
        ],
      }

      const invoice = await createInvoice(invoicePayload)
      const xmlResult = await generateXRechnung(invoice.invoice_id)

      const url = xmlResult?.download_url
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}${xmlResult.download_url}`
        : `http://localhost:8001/api/invoices/${invoice.invoice_id}/download-xrechnung`

      setDownloadUrl(url)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(e.response?.data?.detail ?? 'Fehler bei XML-Generierung')
    } finally {
      setGeneratingXML(false)
    }
  }

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">OCR Upload</h1>
          <p className="text-sm text-gray-400">Modus A · PDF hochladen → Felder extrahieren → XML generieren</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : uploading
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
        }`}
      >
        <input {...getInputProps()} />
        <Upload
          className={`mx-auto mb-4 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`}
          size={38}
        />
        {uploading ? (
          <p className="text-gray-500 font-medium">Wird verarbeitet...</p>
        ) : isDragActive ? (
          <p className="text-blue-600 font-medium">PDF hier ablegen...</p>
        ) : (
          <>
            <p className="text-gray-700 font-medium mb-1">PDF-Rechnung hier ablegen</p>
            <p className="text-gray-400 text-sm">oder klicken zum Auswählen (nur PDF, max. 10 MB)</p>
          </>
        )}
      </div>

      {/* OCR spinner */}
      {uploading && (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3">
          <Loader2 className="animate-spin text-blue-600 shrink-0" size={22} />
          <div>
            <p className="text-gray-700 font-medium">Tesseract OCR läuft...</p>
            <p className="text-gray-400 text-sm">
              Bild vorverarbeiten (denoise, CLAHE) → Text extrahieren → Felder parsen
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* OCR Result + editable fields */}
      {ocrResult && editedFields && (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Result header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CheckCircle className="text-green-500 shrink-0" size={18} />
              <span className="font-semibold text-gray-800">OCR erfolgreich</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                Confidence: {Math.round((ocrResult.confidence || 0))}%
              </span>
              <button
                onClick={() => setEditMode((e) => !e)}
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors ${
                  editMode
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {editMode ? <Save size={13} /> : <Edit2 size={13} />}
                {editMode ? 'Bearbeitung aktiv' : 'Felder bearbeiten'}
              </button>
            </div>
          </div>

          {/* Fields grid */}
          <div className="p-5">
            <p className="text-xs text-gray-400 uppercase font-medium mb-3">
              Extrahierte Felder
              {editMode && (
                <span className="ml-2 text-blue-500 normal-case font-normal">
                  — Werte direkt bearbeitbar
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(FIELD_LABELS) as (keyof EditableFields)[]).map((key) => {
                const value = editedFields[key]
                const hasValue = value !== '' && value !== 'null' && value !== 'undefined'
                return (
                  <div key={key} className={`rounded-lg p-3 ${hasValue ? 'bg-gray-50' : 'bg-red-50/40'}`}>
                    <p className="text-xs text-gray-400 mb-1">{FIELD_LABELS[key]}</p>
                    {editMode ? (
                      <input
                        value={editedFields[key]}
                        onChange={(e) =>
                          setEditedFields((prev) =>
                            prev ? { ...prev, [key]: e.target.value } : prev
                          )
                        }
                        className={inputClass}
                        placeholder={hasValue ? undefined : '— nicht erkannt —'}
                      />
                    ) : (
                      <p
                        className={`text-sm font-medium truncate ${
                          hasValue ? 'text-gray-700' : 'text-red-400 italic'
                        }`}
                      >
                        {hasValue ? value : '— nicht erkannt —'}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Raw text preview */}
            {ocrResult.extracted_text && (
              <details className="mt-4">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                  Roher OCR-Text anzeigen
                </summary>
                <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                  {ocrResult.extracted_text}
                </pre>
              </details>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-4 mt-4 border-t border-gray-100">
              {!downloadUrl ? (
                <button
                  onClick={handleGenerateXML}
                  disabled={generatingXML}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
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
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
                  >
                    <Download size={15} /> XML herunterladen
                  </a>
                  <CheckCircle className="text-green-500" size={16} />
                  <span className="text-sm text-green-700 font-medium">XRechnung 3.0.2 erstellt</span>
                </>
              )}

              <Link href="/invoices" className="text-sm text-blue-600 hover:underline ml-auto">
                → Zur Rechnungsliste
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
