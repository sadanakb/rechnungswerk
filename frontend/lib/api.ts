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

// Add token to all requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('rw-access-token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

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
  unit?: string
}

/**
 * Extended invoice detail — includes all fields returned by
 * GET /api/invoices/{invoice_id} (line items, addresses, VAT IDs, etc.)
 */
export interface InvoiceDetail {
  id: number
  invoice_id: string
  invoice_number: string
  invoice_date: string
  due_date?: string
  // Seller
  seller_name: string
  seller_vat_id?: string
  seller_address?: string
  // Buyer
  buyer_name: string
  buyer_vat_id?: string
  buyer_address?: string
  // Amounts
  net_amount: number
  tax_amount: number
  gross_amount: number
  tax_rate?: number
  currency: string
  // Line items
  line_items: LineItem[]
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
  // Payment status lifecycle
  payment_status: string
  paid_date?: string | null
  payment_method?: string | null
  payment_reference?: string | null
  // Status & meta
  source_type: string
  ocr_confidence?: number
  validation_status: string
  validation_errors?: Array<{ code?: string; message: string; location?: string }>
  xrechnung_available: boolean
  zugferd_available: boolean
  created_at: string
  org_id?: number
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
  // Payment status lifecycle
  payment_status: string
  paid_date?: string | null
  payment_method?: string | null
  payment_reference?: string | null
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

export interface InvoiceFilters {
  status?: string
  supplier?: string
  search?: string
  date_from?: string
  date_to?: string
  amount_min?: number
  amount_max?: number
  payment_status?: string
}

export const listInvoices = async (
  skip = 0,
  limit = 50,
  filters?: InvoiceFilters,
): Promise<InvoiceListResponse> => {
  const params = new URLSearchParams()
  params.set('skip', String(skip))
  params.set('limit', String(limit))
  if (filters?.status) params.set('status', filters.status)
  if (filters?.supplier) params.set('supplier', filters.supplier)
  if (filters?.search) params.set('search', filters.search)
  if (filters?.date_from) params.set('date_from', filters.date_from)
  if (filters?.date_to) params.set('date_to', filters.date_to)
  if (filters?.amount_min != null) params.set('amount_min', String(filters.amount_min))
  if (filters?.amount_max != null) params.set('amount_max', String(filters.amount_max))
  if (filters?.payment_status) params.set('payment_status', filters.payment_status)
  const response = await api.get<InvoiceListResponse>(`/api/invoices?${params.toString()}`)
  return response.data
}

export async function updatePaymentStatus(
  id: string,
  status: string,
  paidDate?: string,
  paymentMethod?: string,
  paymentReference?: string,
): Promise<void> {
  await api.patch(`/api/invoices/${id}/payment-status`, {
    status,
    paid_date: paidDate,
    payment_method: paymentMethod,
    payment_reference: paymentReference,
  })
}

export const getInvoice = async (invoiceId: string): Promise<InvoiceDetail> => {
  const response = await api.get<InvoiceDetail>(`/api/invoices/${invoiceId}`)
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

// ---------------------------------------------------------------------------
// Bulk Operations
// ---------------------------------------------------------------------------

export interface BulkDeleteResult {
  deleted: number
  skipped: number
}

export interface BulkValidateEntry {
  id: number
  invoice_id?: string
  invoice_number?: string
  valid: boolean
  errors: string[]
}

export interface BulkValidateResult {
  results: BulkValidateEntry[]
}

/**
 * Bulk-delete invoices by their integer DB id.
 * Returns how many were deleted vs. skipped (not found / wrong org).
 */
export const bulkDeleteInvoices = async (ids: number[]): Promise<BulkDeleteResult> => {
  const resp = await api.post<BulkDeleteResult>('/api/invoices/bulk-delete', { ids })
  return resp.data
}

/**
 * Bulk-validate invoices by their integer DB id.
 * Returns per-invoice validation results with error lists.
 */
export const bulkValidateInvoices = async (ids: number[]): Promise<BulkValidateResult> => {
  const resp = await api.post<BulkValidateResult>('/api/invoices/bulk-validate', { ids })
  return resp.data
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

/**
 * Download ZUGFeRD PDF for an invoice directly to the browser.
 * Generates the PDF on-the-fly if it has not been pre-generated yet.
 */
export async function downloadZugferd(invoiceId: string, invoiceNumber: string): Promise<void> {
  const resp = await api.get(`/api/invoices/${invoiceId}/download-zugferd`, {
    responseType: 'blob',
  })
  const blob = new Blob([resp.data], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${invoiceNumber}_ZUGFeRD.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Validation & Fraud
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  code: string
  message: string
  location: string
}

export interface ValidationResult {
  validation_id: string
  is_valid: boolean
  error_count: number
  warning_count: number
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  report_html?: string | null
  validator: 'kosit' | 'local' | string
}

export const validateInvoice = async (invoiceId: string): Promise<ValidationResult> => {
  const resp = await api.post<ValidationResult>(`/api/invoices/${invoiceId}/validate`)
  return resp.data
}

export const validateXML = async (xmlContent: string): Promise<ValidationResult> => {
  const resp = await api.post<ValidationResult>('/api/v1/validate', { xml_content: xmlContent })
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

export async function exportDatev(year: number, quarter?: number): Promise<void> {
  const params = new URLSearchParams({ year: String(year) })
  if (quarter) params.set('quarter', String(quarter))
  const res = await api.get(`/api/invoices/export-datev?${params}`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `DATEV_${year}${quarter ? `_Q${quarter}` : ''}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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

export interface TopSupplier {
  name: string
  invoice_count: number
  total_amount: number
}

export interface CategoryBreakdown {
  tax_rate: number
  label: string
  invoice_count: number
  total_amount: number
}

export const getTopSuppliers = async (from?: string, to?: string): Promise<TopSupplier[]> => {
  const params: Record<string, string> = {}
  if (from) params.from = from
  if (to) params.to = to
  const resp = await api.get<TopSupplier[]>('/api/analytics/top-suppliers', { params })
  return resp.data
}

export const getCategoryBreakdown = async (from?: string, to?: string): Promise<CategoryBreakdown[]> => {
  const params: Record<string, string> = {}
  if (from) params.from = from
  if (to) params.to = to
  const resp = await api.get<CategoryBreakdown[]>('/api/analytics/category-breakdown', { params })
  return resp.data
}

export interface TaxSummaryRow {
  tax_rate: string
  label: string
  count: number
  net: number
  vat: number
  gross: number
}

export interface CashflowMonth {
  month: string
  label: string
  total_amount: number
  invoice_count: number
}

export interface AgingInvoice {
  id: string
  number: string
  amount: number
  days_overdue: number
}

export interface OverdueAgingBucket {
  bucket: string
  label: string
  count: number
  total_amount: number
  invoices: AgingInvoice[]
}

export const getTaxSummary = async (year?: number): Promise<TaxSummaryRow[]> => {
  const params: Record<string, number> = {}
  if (year !== undefined) params.year = year
  const resp = await api.get<TaxSummaryRow[]>('/api/analytics/tax-summary', { params })
  return resp.data
}

export const getCashflow = async (months = 6): Promise<CashflowMonth[]> => {
  const resp = await api.get<CashflowMonth[]>('/api/analytics/cashflow', { params: { months } })
  return resp.data
}

export const getOverdueAging = async (): Promise<OverdueAgingBucket[]> => {
  const resp = await api.get<OverdueAgingBucket[]>('/api/analytics/overdue-aging')
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

// ---------------------------------------------------------------------------
// Recurring Invoices
// ---------------------------------------------------------------------------

export interface RecurringLineItem {
  description: string
  quantity: number
  unit_price: number
  net_amount: number
  tax_rate: number
}

export interface RecurringTemplate {
  id: number
  template_id: string
  name: string
  active: boolean
  frequency: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
  next_date: string
  last_generated: string | null
  number_prefix: string
  payment_days: number
  seller_name: string
  seller_vat_id: string
  seller_address: string | null
  buyer_name: string
  buyer_vat_id: string | null
  buyer_address: string | null
  line_items: RecurringLineItem[]
  tax_rate: number
  currency: string
  iban: string | null
  bic: string | null
  payment_account_name: string | null
  buyer_reference: string | null
  seller_endpoint_id: string | null
  buyer_endpoint_id: string | null
  net_amount: number
  created_at: string
  updated_at: string | null
}

export interface RecurringCreate {
  name: string
  frequency: 'monthly' | 'quarterly' | 'half-yearly' | 'yearly'
  next_date: string
  number_prefix?: string
  payment_days?: number
  seller_name: string
  seller_vat_id: string
  seller_address?: string
  buyer_name: string
  buyer_vat_id?: string
  buyer_address?: string
  line_items: RecurringLineItem[]
  tax_rate?: number
  currency?: string
  iban?: string
  bic?: string
  payment_account_name?: string
  buyer_reference?: string
}

export interface TriggerResult {
  message: string
  invoice_id: string
  invoice_number: string
  gross_amount: number
  next_date: string
}

export const listRecurring = async (
  skip = 0,
  limit = 50,
): Promise<{ items: RecurringTemplate[]; total: number }> => {
  const resp = await api.get('/api/recurring', { params: { skip, limit } })
  return resp.data
}

export const createRecurring = async (data: RecurringCreate): Promise<RecurringTemplate> => {
  const resp = await api.post<RecurringTemplate>('/api/recurring', data)
  return resp.data
}

export const deleteRecurring = async (templateId: string): Promise<void> => {
  await api.delete(`/api/recurring/${templateId}`)
}

export const toggleRecurring = async (templateId: string): Promise<RecurringTemplate> => {
  const resp = await api.post<RecurringTemplate>(`/api/recurring/${templateId}/toggle`)
  return resp.data
}

export const triggerRecurring = async (templateId: string): Promise<TriggerResult> => {
  const resp = await api.post<TriggerResult>(`/api/recurring/${templateId}/trigger`)
  return resp.data
}

// ---------------------------------------------------------------------------
// AI Categorization
// ---------------------------------------------------------------------------

export interface CategorizationResult {
  invoice_id: string
  invoice_number: string
  category: string
  skr03_account: string
  skr04_account: string
  confidence: number
  reasoning: string
}

export const categorizeInvoice = async (invoiceId: string): Promise<CategorizationResult> => {
  const resp = await api.post<CategorizationResult>(`/api/invoices/${invoiceId}/categorize`)
  return resp.data
}

// ---------------------------------------------------------------------------
// Mahnwesen (Dunning)
// ---------------------------------------------------------------------------

export interface OverdueInvoice {
  invoice_id: string
  invoice_number: string
  buyer_name: string
  gross_amount: number
  due_date: string
  days_overdue: number
  mahnung_count: number
}

export interface MahnungRecord {
  mahnung_id: string
  invoice_id: string
  level: number
  fee: number
  interest: number
  total_due: number
  status: string
  sent_at: string | null
  created_at: string
}

export async function getOverdueInvoices(): Promise<OverdueInvoice[]> {
  const resp = await api.get<OverdueInvoice[]>('/api/mahnwesen/overdue')
  return resp.data
}

export async function getMahnungen(invoiceId: string): Promise<MahnungRecord[]> {
  const resp = await api.get<MahnungRecord[]>(`/api/mahnwesen/${invoiceId}`)
  return resp.data
}

export async function createMahnung(invoiceId: string): Promise<MahnungRecord> {
  const resp = await api.post<MahnungRecord>(`/api/mahnwesen/${invoiceId}/mahnung`)
  return resp.data
}

export async function updateMahnungStatus(
  mahnungId: string,
  status: 'paid' | 'cancelled',
): Promise<MahnungRecord> {
  const resp = await api.patch<MahnungRecord>(`/api/mahnwesen/${mahnungId}/status`, { status })
  return resp.data
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface RegisterData {
  email: string
  password: string
  full_name: string
  organization_name: string
}

export interface LoginData {
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user?: { id: number; email: string; full_name: string }
  organization?: { id: number; name: string; slug: string; plan: string }
}

export async function registerUser(data: RegisterData): Promise<AuthResponse> {
  const resp = await api.post<AuthResponse>('/api/auth/register', data)
  return resp.data
}

export async function loginUser(data: LoginData): Promise<AuthResponse> {
  const resp = await api.post<AuthResponse>('/api/auth/login', data)
  return resp.data
}

export async function getMe(): Promise<{
  id: number
  email: string
  full_name: string
  organization: { id: number; name: string; slug: string; plan: string }
  role: string
}> {
  const resp = await api.get('/api/auth/me')
  return resp.data
}

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: number
  email: string
  full_name: string | null
  is_verified: boolean
  created_at: string | null
  organization: { id: number; name: string } | null
}

export interface UserProfileUpdateData {
  full_name?: string
  current_password?: string
  new_password?: string
}

export async function getUserProfile(): Promise<UserProfile> {
  const resp = await api.get<UserProfile>('/api/users/me')
  return resp.data
}

export async function updateUserProfile(data: UserProfileUpdateData): Promise<UserProfile> {
  const resp = await api.patch<UserProfile>('/api/users/me', data)
  return resp.data
}

// ---------------------------------------------------------------------------
// Onboarding / Company Info
// ---------------------------------------------------------------------------

export interface OnboardingStatus {
  completed: boolean
  org_name: string
  has_vat_id: boolean
  has_address: boolean
  vat_id: string | null
  address: string | null
}

export interface CompanyUpdateData {
  name?: string
  vat_id?: string
  address?: string
  logo_url?: string
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const resp = await api.get<OnboardingStatus>('/api/onboarding/status')
  return resp.data
}

export async function updateCompanyInfo(data: CompanyUpdateData): Promise<OnboardingStatus> {
  const resp = await api.post<OnboardingStatus>('/api/onboarding/company', data)
  return resp.data
}

// ---------------------------------------------------------------------------
// Billing / Stripe
// ---------------------------------------------------------------------------

export interface SubscriptionInfo {
  plan: string
  plan_status: 'active' | 'trialing' | 'past_due' | 'cancelled'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  /** Unix timestamp (seconds) — end of current billing period */
  period_end: number | null
}

export interface CheckoutSessionRequest {
  plan: 'starter' | 'professional'
  billing_cycle?: 'monthly' | 'yearly'
}

export async function getSubscription(): Promise<SubscriptionInfo> {
  const resp = await api.get<SubscriptionInfo>('/api/billing/subscription')
  return resp.data
}

export async function createCheckoutSession(
  plan: 'starter' | 'professional',
  billingCycle: 'monthly' | 'yearly' = 'monthly',
): Promise<{ url: string }> {
  const resp = await api.post<{ url: string }>('/api/billing/checkout', {
    plan,
    billing_cycle: billingCycle,
  })
  return resp.data
}

export async function createPortalSession(): Promise<{ url: string }> {
  const resp = await api.post<{ url: string }>('/api/billing/portal')
  return resp.data
}

// ---------------------------------------------------------------------------
// API Key Management
// ---------------------------------------------------------------------------

export interface ApiKeyItem {
  id: number
  name: string
  key_prefix: string
  scopes: string[]
  created_at: string | null
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
}

export interface ApiKeyCreateResult extends ApiKeyItem {
  full_key: string
  warning: string
}

export async function listApiKeys(): Promise<ApiKeyItem[]> {
  const resp = await api.get<ApiKeyItem[]>('/api/api-keys')
  return resp.data
}

export async function createApiKey(
  name: string,
  scopes: string[],
  expiresAt?: string | null,
): Promise<ApiKeyCreateResult> {
  const resp = await api.post<ApiKeyCreateResult>('/api/api-keys', {
    name,
    scopes,
    expires_at: expiresAt ?? null,
  })
  return resp.data
}

export async function revokeApiKey(id: number): Promise<void> {
  await api.delete(`/api/api-keys/${id}`)
}

// ---------------------------------------------------------------------------
// Invoice Templates
// ---------------------------------------------------------------------------

export interface InvoiceTemplate {
  id: number
  org_id: number
  name: string
  primary_color: string
  footer_text: string | null
  payment_terms_days: number
  bank_iban: string | null
  bank_bic: string | null
  bank_name: string | null
  default_vat_rate: string
  notes_template: string | null
  is_default: boolean
  created_at: string
}

export interface InvoiceTemplateCreate {
  name: string
  primary_color?: string
  footer_text?: string
  payment_terms_days?: number
  bank_iban?: string
  bank_bic?: string
  bank_name?: string
  default_vat_rate?: string
  notes_template?: string
  is_default?: boolean
}

export async function listTemplates(): Promise<InvoiceTemplate[]> {
  const resp = await api.get<InvoiceTemplate[]>('/api/templates')
  return resp.data
}

export async function createTemplate(data: InvoiceTemplateCreate): Promise<InvoiceTemplate> {
  const resp = await api.post<InvoiceTemplate>('/api/templates', data)
  return resp.data
}

export async function updateTemplate(
  id: number,
  data: Partial<InvoiceTemplateCreate>,
): Promise<InvoiceTemplate> {
  const resp = await api.put<InvoiceTemplate>(`/api/templates/${id}`, data)
  return resp.data
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(`/api/templates/${id}`)
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: number
  org_id: number
  user_id: number | null
  user_email: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string | null
}

export interface AuditLogListResponse {
  items: AuditLogEntry[]
  total: number
  page: number
  page_size: number
}

export interface AuditLogParams {
  page?: number
  page_size?: number
  action?: string
  resource_type?: string
  date_from?: string
  date_to?: string
}

export async function getAuditLog(params?: AuditLogParams): Promise<AuditLogListResponse> {
  const queryParams: Record<string, string | number> = {}
  if (params?.page) queryParams.page = params.page
  if (params?.page_size) queryParams.page_size = params.page_size
  if (params?.action) queryParams.action = params.action
  if (params?.resource_type) queryParams.resource_type = params.resource_type
  if (params?.date_from) queryParams.date_from = params.date_from
  if (params?.date_to) queryParams.date_to = params.date_to
  const resp = await api.get<AuditLogListResponse>('/api/audit', { params: queryParams })
  return resp.data
}

// ---------------------------------------------------------------------------
// Webhook Management
// ---------------------------------------------------------------------------

export interface WebhookSubscription {
  id: number
  url: string
  events: string[]
  is_active: boolean
  created_at: string
}

export interface WebhookDelivery {
  id: number
  event_type: string
  status: string
  response_code: number | null
  attempts: number
  created_at: string
  last_attempted_at: string | null
}

export async function listWebhooks(): Promise<WebhookSubscription[]> {
  const resp = await api.get<WebhookSubscription[]>('/api/webhooks')
  return resp.data
}

export async function createWebhook(data: {
  url: string
  events: string[]
}): Promise<{ id: number; secret: string }> {
  const resp = await api.post<{ id: number; secret: string }>('/api/webhooks', data)
  return resp.data
}

export async function deleteWebhook(id: number): Promise<void> {
  await api.delete(`/api/webhooks/${id}`)
}

export async function testWebhook(id: number): Promise<void> {
  await api.post(`/api/webhooks/${id}/test`)
}

export async function getWebhookDeliveries(id: number): Promise<WebhookDelivery[]> {
  const resp = await api.get<WebhookDelivery[]>(`/api/webhooks/${id}/deliveries`)
  return resp.data
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: number
  type: string
  title: string
  message: string
  is_read: boolean
  link: string | null
  created_at: string
}

export async function getNotifications(): Promise<AppNotification[]> {
  try {
    const resp = await api.get<AppNotification[]>('/api/notifications')
    return resp.data
  } catch {
    return []
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const resp = await api.get<{ count: number }>('/api/notifications/unread-count')
    return resp.data.count
  } catch {
    return 0
  }
}

export async function markNotificationsRead(ids?: number[]): Promise<void> {
  await api.post('/api/notifications/mark-read', ids ? { ids } : { all: true })
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface Contact {
  id: number
  org_id: number
  type: 'customer' | 'supplier'
  name: string
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2?: string | null
  city: string | null
  zip: string | null
  country: string
  vat_id: string | null
  payment_terms: number
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface ContactCreate {
  type: string
  name: string
  email?: string
  phone?: string
  address_line1?: string
  address_line2?: string
  city?: string
  zip?: string
  country?: string
  vat_id?: string
  payment_terms?: number
  notes?: string
}

export async function listContacts(params?: { type?: string; search?: string }): Promise<Contact[]> {
  const p = new URLSearchParams()
  if (params?.type) p.set('type', params.type)
  if (params?.search) p.set('search', params.search)
  const res = await api.get(`/api/contacts${p.toString() ? '?' + p : ''}`)
  return res.data
}

export async function createContact(data: ContactCreate): Promise<Contact> {
  const res = await api.post('/api/contacts', data)
  return res.data
}

export async function updateContact(id: number, data: Partial<ContactCreate>): Promise<Contact> {
  const res = await api.patch(`/api/contacts/${id}`, data)
  return res.data
}

export async function deleteContact(id: number): Promise<void> {
  await api.delete(`/api/contacts/${id}`)
}

// ---------------------------------------------------------------------------
// Logo Upload
// ---------------------------------------------------------------------------

export async function uploadLogo(file: File): Promise<{ logo_url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/api/onboarding/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

// ---------------------------------------------------------------------------
// Invoice Number Sequences
// ---------------------------------------------------------------------------

export interface SequenceConfig {
  prefix: string
  separator: string
  year_format: string
  padding: number
  reset_yearly: boolean
}

export interface SequenceInfo extends SequenceConfig {
  configured: boolean
  id?: number
  org_id?: number
  current_counter?: number
  last_reset_year?: number | null
  preview: string
}

export async function getInvoiceSequence(): Promise<SequenceInfo> {
  const res = await api.get('/api/invoice-sequences')
  return res.data
}

export async function saveInvoiceSequence(config: SequenceConfig): Promise<{ ok: boolean; preview: string }> {
  const res = await api.post('/api/invoice-sequences', config)
  return res.data
}

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number
  skipped: number
  errors: Array<{ row: number; error: string }>
  total_rows: number
}

export async function importCsv(file: File): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post<ImportResult>('/api/import/csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function downloadImportTemplate(): Promise<void> {
  const res = await api.get('/api/import/template', { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'rechnungswerk_import_vorlage.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function autocompleteInvoices(q: string, field: string = 'buyer_name'): Promise<string[]> {
  if (!q || q.length < 1) return []
  try {
    const res = await api.get(`/api/invoices/autocomplete?q=${encodeURIComponent(q)}&field=${field}`)
    return res.data
  } catch { return [] }
}

export interface DashboardStats {
  total_invoices: number
  invoices_this_month: number
  revenue_this_month: number
  revenue_last_month: number
  overdue_count: number
  overdue_amount: number
  paid_count: number
  unpaid_count: number
  validation_rate: number
  monthly_revenue: Array<{ month: string; amount: number }>
}

export async function getDashboardStats(): Promise<DashboardStats | null> {
  try {
    const res = await api.get('/api/invoices/stats')
    return res.data
  } catch { return null }
}
