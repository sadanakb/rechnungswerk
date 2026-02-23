/**
 * API client for RechnungsWerk backend (Port 8001)
 */
import axios from 'axios'

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

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

/**
 * Extract a human-readable error message from an Axios error.
 */
export function getErrorMessage(err: unknown, fallback = 'Ein Fehler ist aufgetreten'): string {
  if (err && typeof err === 'object') {
    const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string }
    return axiosErr.response?.data?.detail ?? axiosErr.message ?? fallback
  }
  return fallback
}

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
  // Payment details (BG-16)
  iban?: string
  bic?: string
  payment_account_name?: string
  // Routing & Reference
  buyer_reference?: string
  seller_endpoint_id?: string
  seller_endpoint_scheme?: string
  buyer_endpoint_id?: string
  buyer_endpoint_scheme?: string
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
  // Payment details (BG-16)
  iban?: string
  bic?: string
  payment_account_name?: string
  // Routing & Reference
  buyer_reference?: string
  seller_endpoint_id?: string
  seller_endpoint_scheme?: string
  buyer_endpoint_id?: string
  buyer_endpoint_scheme?: string
  source_type: string
  ocr_confidence?: number
  validation_status: string
  xrechnung_available: boolean
  zugferd_available: boolean
  created_at: string
}

/**
 * Per-field confidence values returned by the OCR engine.
 * Each key matches a field name; value is 0–100.
 */
export interface FieldConfidences {
  invoice_number?: number
  invoice_date?: number
  due_date?: number
  seller_name?: number
  seller_vat_id?: number
  seller_address?: number
  buyer_name?: number
  buyer_vat_id?: number
  buyer_address?: number
  iban?: number
  bic?: number
  net_amount?: number
  tax_amount?: number
  gross_amount?: number
  tax_rate?: number
  [key: string]: number | undefined
}

/**
 * A single consistency check result from the backend.
 */
export interface ConsistencyCheck {
  name: string
  passed: boolean
  message: string
}

/**
 * Extended OCR result with per-field confidence and consistency checks.
 */
export interface OCRResult {
  invoice_id: string
  extracted_text: string
  /** Overall confidence in range 0–100 (percentage) */
  confidence: number
  fields: Record<string, unknown>
  suggestions: Record<string, unknown>
  /** Per-field confidence scores (0–100) */
  field_confidences?: FieldConfidences
  /** Consistency checks run against extracted values */
  consistency_checks?: ConsistencyCheck[]
  /** Completeness score 0–100: how many expected fields were found */
  completeness?: number
  /** Source type: 'tesseract' | 'ollama' | 'hybrid' */
  source?: string
  /** Total pages in the uploaded PDF */
  total_pages?: number
  /** OCR engine used: 'tesseract' | 'ollama' | 'easyocr' */
  ocr_engine?: string
}

/**
 * Result for a single file within a batch OCR job.
 */
export interface BatchFileResult {
  filename: string
  invoice_id: string
  status: 'success' | 'error' | 'pending'
  confidence?: number
  error_message?: string
  ocr_result?: OCRResult
}

/**
 * Response from initiating a batch OCR job.
 */
export interface BatchJobResponse {
  batch_id: string
  total_files: number
  processed: number
  failed: number
  status: 'processing' | 'complete' | 'error'
  results: BatchFileResult[]
  created_at: string
}

export interface HealthData {
  status: string
  database: string
  tesseract_installed: boolean
  tesseract_version?: string
  kosit_validator: string
  total_invoices: number
  xrechnung_version?: string
  /** Whether Ollama is running and available for LLM-assisted OCR */
  ollama_available?: boolean
  /** Primary OCR engine currently active */
  ocr_engine?: string
}

export interface GenerateXRechnungResult {
  invoice_id: string
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

/**
 * Upload multiple PDFs in a single batch request.
 * Returns a BatchJobResponse with a batch_id for polling.
 */
export const uploadBatchForOCR = async (files: File[]): Promise<BatchJobResponse> => {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  const response = await api.post<BatchJobResponse>('/api/upload-ocr-batch', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

/**
 * Poll the status of a batch OCR job by ID.
 */
export const getBatchStatus = async (batchId: string): Promise<BatchJobResponse> => {
  const response = await api.get<BatchJobResponse>(`/api/upload-ocr-batch/${batchId}`)
  return response.data
}

export const createInvoice = async (data: InvoiceCreate): Promise<Invoice> => {
  const response = await api.post<Invoice>('/api/invoices', data)
  return response.data
}

export interface InvoiceListResponse {
  items: Invoice[]
  total: number
  skip: number
  limit: number
}

export const listInvoices = async (skip = 0, limit = 50): Promise<InvoiceListResponse> => {
  const response = await api.get<InvoiceListResponse>('/api/invoices', {
    params: { skip, limit },
  })
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
 * Delete an invoice by ID.
 */
export const deleteInvoice = async (invoiceId: string): Promise<void> => {
  await api.delete(`/api/invoices/${invoiceId}`)
}

/**
 * Returns the full download URL for an XRechnung XML file.
 * The actual download is triggered via a plain <a href> or window.open.
 */
export const getXRechnungDownloadUrl = (invoiceId: string): string => {
  return `${API_BASE}/api/invoices/${invoiceId}/download-xrechnung`
}

// ---------------------------------------------------------------------------
// ZUGFeRD
// ---------------------------------------------------------------------------

export const generateZUGFeRD = async (invoiceId: string): Promise<{ download_url: string; message: string }> => {
  const resp = await api.post(`/api/invoices/${invoiceId}/generate-zugferd`)
  return resp.data
}

export const getZUGFeRDDownloadUrl = (invoiceId: string): string => {
  return `${API_BASE}/api/invoices/${invoiceId}/download-zugferd`
}

// ---------------------------------------------------------------------------
// Validation & Fraud
// ---------------------------------------------------------------------------

export const validateInvoice = async (invoiceId: string): Promise<{ is_valid: boolean; errors: unknown[]; warnings: unknown[] }> => {
  const resp = await api.post(`/api/invoices/${invoiceId}/validate`)
  return resp.data
}

export const checkFraud = async (invoiceId: string): Promise<{ risk_level: string; warnings: unknown[] }> => {
  const resp = await api.post(`/api/invoices/${invoiceId}/check-fraud`)
  return resp.data
}

// ---------------------------------------------------------------------------
// DATEV Export
// ---------------------------------------------------------------------------

export const exportDATEV = (format: 'buchungsstapel' | 'csv' = 'buchungsstapel', kontenrahmen: 'SKR03' | 'SKR04' = 'SKR03'): string => {
  return `${API_BASE}/api/export/datev?format=${format}&kontenrahmen=${kontenrahmen}`
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  total_invoices: number
  total_volume: number
  month_invoices: number
  month_volume: number
  ocr_success_rate: number
  xrechnung_generated: number
  monthly_volumes: { month: string; label: string; volume: number; count: number }[]
}

export const getAnalyticsSummary = async (): Promise<AnalyticsSummary> => {
  const resp = await api.get<AnalyticsSummary>('/api/analytics/summary')
  return resp.data
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export interface Supplier {
  id: number
  name: string
  vat_id: string
  address: string
  iban?: string
  bic?: string
  email?: string
  default_account?: string
  notes?: string
  invoice_count: number
  total_volume: number
  created_at: string
}

export interface SupplierCreate {
  name: string
  vat_id: string
  address?: string
  iban?: string
  bic?: string
  email?: string
  default_account?: string
  notes?: string
}

export const listSuppliers = async (skip = 0, limit = 50): Promise<{ items: Supplier[]; total: number }> => {
  const resp = await api.get('/api/suppliers', { params: { skip, limit } })
  return resp.data
}

export const createSupplier = async (data: SupplierCreate): Promise<Supplier> => {
  const resp = await api.post<Supplier>('/api/suppliers', data)
  return resp.data
}

export const updateSupplier = async (id: number, data: Partial<SupplierCreate>): Promise<Supplier> => {
  const resp = await api.put<Supplier>(`/api/suppliers/${id}`, data)
  return resp.data
}

export const deleteSupplier = async (id: number): Promise<void> => {
  await api.delete(`/api/suppliers/${id}`)
}

export const searchSuppliers = async (q: string): Promise<Supplier[]> => {
  const resp = await api.get<Supplier[]>('/api/suppliers/search', { params: { q } })
  return resp.data
}
