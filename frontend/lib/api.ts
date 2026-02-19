/**
 * API client for RechnungsWerk backend (Port 8001)
 */
import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error?.response?.status, error?.config?.url)
    return Promise.reject(error)
  },
)

export { api }

// ---------------------------------------------------------------------------
// TypeScript Types
// ---------------------------------------------------------------------------

export interface LineItem {
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  tax_rate: number
}

export interface InvoiceCreate {
  invoice_number: string
  invoice_date: string
  due_date?: string
  seller_name: string
  seller_vat_id: string
  seller_address: string
  buyer_name: string
  buyer_vat_id: string
  buyer_address: string
  line_items: LineItem[]
  tax_rate: number
}

export interface Invoice {
  id: number
  invoice_id: string
  invoice_number: string
  invoice_date: string
  due_date?: string
  seller_name: string
  buyer_name: string
  net_amount: number
  tax_amount: number
  gross_amount: number
  source_type: string
  ocr_confidence?: number
  validation_status: string
  xrechnung_xml_path?: string
  zugferd_pdf_path?: string
  created_at: string
}

export interface OCRResult {
  invoice_id: string
  extracted_text: string
  /** Confidence in range 0–100 (percentage) */
  confidence: number
  fields: Record<string, unknown>
  suggestions: Record<string, unknown>
}

export interface HealthData {
  status: string
  database: string
  tesseract_installed: boolean
  tesseract_version?: string
  kosit_validator: string
  total_invoices: number
  xrechnung_version?: string
}

export interface GenerateXRechnungResult {
  invoice_id: string
  xml_path: string
  /** Relative path e.g. /api/invoices/{id}/download-xrechnung */
  download_url: string
  message: string
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const getHealth = async (): Promise<HealthData> => {
  const response = await api.get<HealthData>('/api/health')
  return response.data
}

export const uploadPDFForOCR = async (file: File): Promise<OCRResult> => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post<OCRResult>('/api/upload-ocr', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export const createInvoice = async (data: InvoiceCreate): Promise<Invoice> => {
  const response = await api.post<Invoice>('/api/invoices', data)
  return response.data
}

export const listInvoices = async (): Promise<Invoice[]> => {
  const response = await api.get<Invoice[]>('/api/invoices')
  return response.data
}

export const getInvoice = async (invoiceId: string): Promise<Invoice> => {
  const response = await api.get<Invoice>(`/api/invoices/${invoiceId}`)
  return response.data
}

export const generateXRechnung = async (
  invoiceId: string,
): Promise<GenerateXRechnungResult> => {
  const response = await api.post<GenerateXRechnungResult>(
    `/api/invoices/${invoiceId}/generate-xrechnung`,
  )
  return response.data
}

/**
 * Returns the full download URL for an XRechnung XML file.
 * The actual download is triggered via a plain <a href> or window.open.
 */
export const getXRechnungDownloadUrl = (invoiceId: string): string => {
  return `${API_BASE}/api/invoices/${invoiceId}/download-xrechnung`
}
