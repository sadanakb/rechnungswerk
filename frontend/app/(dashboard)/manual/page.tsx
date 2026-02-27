'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  CreditCard,
  Network,
  FileText,
  List,
  ArrowRight,
  X,
} from 'lucide-react'
import { createInvoice, generateXRechnung, getErrorMessage, API_BASE, type InvoiceCreate } from '@/lib/api'

type FormData = InvoiceCreate

// ---------------------------------------------------------------------------
// USt-ID format validation: DE followed by exactly 9 digits
// ---------------------------------------------------------------------------
const UST_ID_REGEX = /^DE\d{9}$/

function validateUstId(value: string | undefined): true | string {
  if (!value || value.trim() === '') return true // not required — separate required rule handles that
  if (!UST_ID_REGEX.test(value.trim())) {
    return 'USt-ID muss das Format DE + 9 Ziffern haben (z.B. DE123456789)'
  }
  return true
}

// ---------------------------------------------------------------------------
// Live totals helper
// ---------------------------------------------------------------------------
function calcTotals(
  lineItems: { quantity?: number; unit_price?: number }[],
  taxRate: number,
) {
  const net = lineItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
  }, 0)
  const tax = net * (taxRate / 100)
  const gross = net + tax
  return { net, tax, gross }
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' as const, delay: i * 0.06 },
  }),
}

// ---------------------------------------------------------------------------
// Helper: build flat error list from react-hook-form errors
// ---------------------------------------------------------------------------
function collectErrorMessages(errors: Record<string, unknown>): string[] {
  const messages: string[] = []

  const fieldLabels: Record<string, string> = {
    invoice_number: 'Rechnungsnummer',
    invoice_date: 'Rechnungsdatum',
    seller_name: 'Verkäufer Firmenname',
    seller_vat_id: 'Verkäufer USt-IdNr.',
    seller_address: 'Verkäufer Adresse',
    buyer_name: 'Käufer Firmenname',
    buyer_address: 'Käufer Adresse',
    buyer_vat_id: 'Käufer USt-IdNr.',
    line_items: 'Rechnungspositionen',
  }

  for (const [key, val] of Object.entries(errors)) {
    if (!val) continue
    const v = val as Record<string, unknown>

    // Field-level error
    if (v.message && typeof v.message === 'string') {
      const label = fieldLabels[key] || key
      messages.push(`${label}: ${v.message}`)
      continue
    }

    // If it's "required" type without custom message
    if (v.type === 'required') {
      const label = fieldLabels[key] || key
      messages.push(`${label} ist ein Pflichtfeld`)
      continue
    }

    // Array-level errors (line_items)
    if (key === 'line_items' && typeof v === 'object') {
      // Could be the root-level "required at least 1" error
      if (v.root && typeof v.root === 'object') {
        const root = v.root as Record<string, unknown>
        if (root.message && typeof root.message === 'string') {
          messages.push(`Rechnungspositionen: ${root.message}`)
        }
      }
      // Or per-item errors
      for (const [idx, itemErr] of Object.entries(v)) {
        if (idx === 'root' || idx === 'type' || idx === 'message' || idx === 'ref') continue
        if (typeof itemErr === 'object' && itemErr !== null) {
          const itemErrors = itemErr as Record<string, Record<string, unknown>>
          for (const [field, fieldErr] of Object.entries(itemErrors)) {
            if (fieldErr && typeof fieldErr === 'object') {
              const msg = (fieldErr as Record<string, unknown>).message
              if (msg && typeof msg === 'string') {
                const lineNum = Number(idx) + 1
                messages.push(`Position ${lineNum} - ${field === 'description' ? 'Beschreibung' : field === 'unit_price' ? 'Einzelpreis' : field === 'quantity' ? 'Menge' : field}: ${msg}`)
              } else if ((fieldErr as Record<string, unknown>).type === 'required') {
                const lineNum = Number(idx) + 1
                messages.push(`Position ${lineNum} - ${field === 'description' ? 'Beschreibung' : field}: Pflichtfeld`)
              }
            }
          }
        }
      }
    }
  }

  return messages
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ManualPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ invoiceId: string; downloadUrl: string } | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showValidationSummary, setShowValidationSummary] = useState(false)
  const [successBanner, setSuccessBanner] = useState<{ invoiceId: string } | null>(null)

  const validationSummaryRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitted, touchedFields },
  } = useForm<FormData>({
    mode: 'onBlur',
    defaultValues: {
      invoice_number: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      seller_name: '',
      seller_vat_id: '',
      seller_address: '',
      buyer_name: '',
      buyer_vat_id: '',
      buyer_address: '',
      tax_rate: 19,
      line_items: [{ description: '', quantity: 1, unit_price: 0, net_amount: 0, tax_rate: 19 }],
      iban: '',
      bic: '',
      payment_account_name: '',
      buyer_reference: '',
      seller_endpoint_id: '',
      buyer_endpoint_id: '',
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' })

  const watchedItems = useWatch({ control, name: 'line_items' }) ?? []
  const watchedTaxRate = useWatch({ control, name: 'tax_rate' }) ?? 19
  const { net, tax, gross } = calcTotals(watchedItems, watchedTaxRate)

  // Scroll to validation summary when it appears
  useEffect(() => {
    if (showValidationSummary && validationSummaryRef.current) {
      validationSummaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [showValidationSummary])

  // Auto-dismiss success banner after 8 seconds
  useEffect(() => {
    if (successBanner) {
      const timer = setTimeout(() => setSuccessBanner(null), 8000)
      return () => clearTimeout(timer)
    }
  }, [successBanner])

  const scrollToFirstError = useCallback(() => {
    // Find the first element with a validation error data attribute
    if (formRef.current) {
      const firstErrorEl = formRef.current.querySelector('[data-has-error="true"]')
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Try to focus the first input inside the error container
        const input = firstErrorEl.querySelector('input, textarea') as HTMLElement | null
        if (input) {
          setTimeout(() => input.focus(), 400)
        }
        return
      }
    }
  }, [])

  const onInvalid = useCallback(() => {
    setShowValidationSummary(true)
    // Scroll to the summary banner first, then the first error field
    setTimeout(() => {
      if (validationSummaryRef.current) {
        validationSummaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      setTimeout(scrollToFirstError, 500)
    }, 100)
  }, [scrollToFirstError])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setApiError(null)
    setShowValidationSummary(false)

    // Additional check: gross amount must be > 0
    const processedItems = data.line_items.map((item) => ({
      ...item,
      net_amount: (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    }))
    const totalNet = processedItems.reduce((s, i) => s + i.net_amount, 0)
    if (totalNet <= 0) {
      setApiError('Der Gesamtbetrag muss groesser als 0 sein. Bitte Positionen pruefen.')
      setLoading(false)
      return
    }

    try {
      const processedData: FormData = {
        ...data,
        line_items: processedItems,
      }
      const invoice = await createInvoice(processedData)
      const xmlResult = await generateXRechnung(invoice.invoice_id)
      setSuccess({
        invoiceId: invoice.invoice_id,
        downloadUrl:
          xmlResult?.download_url
            ? `${API_BASE}${xmlResult.download_url}`
            : `${API_BASE}/api/invoices/${invoice.invoice_id}/download-xrechnung`,
      })
      setSuccessBanner({ invoiceId: invoice.invoice_id })
    } catch (err: unknown) {
      setApiError(getErrorMessage(err, 'Rechnung konnte nicht erstellt werden'))
    } finally {
      setLoading(false)
    }
  }

  // ===== Helper: determine if a field should show error styling =====
  const hasFieldError = (fieldName: string): boolean => {
    // Show error if field was touched (blurred) or form was submitted
    const parts = fieldName.split('.')
    let err: unknown = errors
    for (const p of parts) {
      if (err && typeof err === 'object') {
        err = (err as Record<string, unknown>)[p]
      } else {
        return false
      }
    }
    if (!err) return false

    // Check if field was touched or form submitted
    if (isSubmitted) return true
    let touched: unknown = touchedFields
    for (const p of parts) {
      if (touched && typeof touched === 'object') {
        touched = (touched as Record<string, unknown>)[p]
      } else {
        return false
      }
    }
    return !!touched
  }

  const getFieldError = (fieldName: string): string | null => {
    if (!hasFieldError(fieldName)) return null
    const parts = fieldName.split('.')
    let err: unknown = errors
    for (const p of parts) {
      if (err && typeof err === 'object') {
        err = (err as Record<string, unknown>)[p]
      } else {
        return null
      }
    }
    if (err && typeof err === 'object') {
      const msg = (err as Record<string, unknown>).message
      if (msg && typeof msg === 'string') return msg
      const type = (err as Record<string, unknown>).type
      if (type === 'required') return 'Pflichtfeld'
    }
    return null
  }

  // ===== Success screen =====
  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="rounded-2xl border p-8 text-center max-w-md w-full"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <CheckCircle
              className="mx-auto mb-4"
              size={56}
              style={{ color: 'rgb(var(--accent))' }}
            />
          </motion.div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'rgb(var(--foreground))' }}>
            Rechnung erfolgreich erstellt!
          </h2>
          <p className="text-sm mb-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Rechnungs-ID:
          </p>
          <code
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{
              backgroundColor: 'rgb(var(--muted))',
              color: 'rgb(var(--foreground))',
            }}
          >
            {success.invoiceId}
          </code>
          <p className="text-sm mt-3 mb-6" style={{ color: 'rgb(var(--foreground-muted))' }}>
            XRechnung 3.0.2 UBL XML wurde erfolgreich generiert.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={success.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: 'rgb(var(--accent))' }}
            >
              <Download size={16} /> XML herunterladen
            </a>
            <Link
              href="/invoices"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              <List size={16} /> Rechnungsliste
            </Link>
            <button
              onClick={() => setSuccess(null)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: 'rgb(var(--muted))',
                color: 'rgb(var(--foreground))',
              }}
            >
              Neue Rechnung
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  const inputClass = [
    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors',
  ].join(' ')

  const inputStyle = {
    backgroundColor: 'rgb(var(--input))',
    borderColor: 'rgb(var(--input-border))',
    color: 'rgb(var(--foreground))',
  }

  const inputErrorStyle = {
    backgroundColor: 'rgb(var(--input))',
    borderColor: 'rgb(var(--destructive))',
    color: 'rgb(var(--foreground))',
  }

  const labelStyle = { color: 'rgb(var(--foreground))' }
  const labelMutedStyle = { color: 'rgb(var(--foreground-muted))' }

  const errorMessages = collectErrorMessages(errors as unknown as Record<string, unknown>)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6 max-w-3xl mx-auto">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--foreground))' }}>
          Manuelle Eingabe
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Alle BT-Felder direkt eingeben und XRechnung 3.0.2 UBL XML generieren
        </p>
      </motion.div>

      {/* Success banner (toast-style) */}
      <AnimatePresence>
        {successBanner && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="mb-4 rounded-xl border p-4 flex items-start gap-3"
            style={{
              backgroundColor: 'rgb(var(--primary) / 0.08)',
              borderColor: 'rgb(var(--primary) / 0.3)',
            }}
          >
            <CheckCircle size={18} className="shrink-0 mt-0.5" style={{ color: 'rgb(var(--primary))' }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'rgb(var(--primary))' }}>
                Rechnung erfolgreich erstellt
              </p>
              <Link
                href={`/invoices`}
                className="text-xs underline mt-0.5 inline-block"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Zur Rechnungsliste &rarr;
              </Link>
            </div>
            <button
              onClick={() => setSuccessBanner(null)}
              className="shrink-0 p-0.5"
              style={{ color: 'rgb(var(--primary))' }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation summary banner */}
      <AnimatePresence>
        {showValidationSummary && isSubmitted && errorMessages.length > 0 && (
          <motion.div
            ref={validationSummaryRef}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="mb-4 rounded-xl border p-4"
            style={{
              backgroundColor: 'rgb(var(--destructive-light))',
              borderColor: 'rgb(var(--destructive-border))',
            }}
          >
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5" style={{ color: 'rgb(var(--destructive))' }} />
              <div className="flex-1">
                <p className="text-sm font-semibold mb-2" style={{ color: 'rgb(var(--destructive))' }}>
                  Bitte korrigieren Sie {errorMessages.length} {errorMessages.length === 1 ? 'Fehler' : 'Fehler'} vor dem Absenden:
                </p>
                <ul className="space-y-1">
                  {errorMessages.map((msg, i) => (
                    <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: 'rgb(var(--destructive))' }}>
                      <span className="shrink-0 mt-0.5">&#8226;</span>
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setShowValidationSummary(false)}
                className="shrink-0 p-0.5"
                style={{ color: 'rgb(var(--destructive))' }}
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form ref={formRef} onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-5">

        {/* ---- Rechnungsinformationen ---- */}
        <motion.div
          custom={0}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Section title="Rechnungsinformationen" icon={<FileText size={16} />}>
            <div className="grid grid-cols-2 gap-4">
              <div data-has-error={hasFieldError('invoice_number')}>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Rechnungsnummer <BT>BT-1</BT> <span style={{ color: 'rgb(var(--destructive))' }}>*</span>
                </label>
                <input
                  {...register('invoice_number', { required: 'Rechnungsnummer ist ein Pflichtfeld' })}
                  className={inputClass}
                  style={hasFieldError('invoice_number') ? inputErrorStyle : inputStyle}
                  placeholder="RE-2026-001"
                />
                <FieldError message={getFieldError('invoice_number')} />
              </div>
              <div data-has-error={hasFieldError('invoice_date')}>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Rechnungsdatum <BT>BT-2</BT> <span style={{ color: 'rgb(var(--destructive))' }}>*</span>
                </label>
                <input
                  type="date"
                  {...register('invoice_date', { required: 'Rechnungsdatum ist ein Pflichtfeld' })}
                  className={inputClass}
                  style={hasFieldError('invoice_date') ? inputErrorStyle : inputStyle}
                />
                <FieldError message={getFieldError('invoice_date')} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Fälligkeitsdatum <BT>BT-9</BT>
                </label>
                <input type="date" {...register('due_date')} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  MwSt-Satz % <BT>BT-119</BT>
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  {...register('tax_rate', { valueAsNumber: true })}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </Section>
        </motion.div>

        {/* ---- Verkäufer ---- */}
        <motion.div
          custom={1}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Section title="Verkäufer (Seller)" badge="BT-27 bis BT-40">
            <div className="space-y-3">
              <div data-has-error={hasFieldError('seller_name')}>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Firmenname <BT>BT-27</BT> <span style={{ color: 'rgb(var(--destructive))' }}>*</span>
                </label>
                <input
                  {...register('seller_name', { required: 'Verkäufer Firmenname ist ein Pflichtfeld' })}
                  className={inputClass}
                  style={hasFieldError('seller_name') ? inputErrorStyle : inputStyle}
                  placeholder="Muster GmbH"
                />
                <FieldError message={getFieldError('seller_name')} />
              </div>
              <div data-has-error={hasFieldError('seller_vat_id')}>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  USt-IdNr. <BT>BT-31</BT> <span style={{ color: 'rgb(var(--destructive))' }}>*</span>
                  <span className="ml-1 text-xs font-normal text-amber-500">(Pflicht ab XRechnung 3.0.2)</span>
                </label>
                <input
                  {...register('seller_vat_id', {
                    required: 'Verkäufer USt-IdNr. ist ein Pflichtfeld',
                    validate: validateUstId,
                  })}
                  className={inputClass}
                  style={hasFieldError('seller_vat_id') ? inputErrorStyle : inputStyle}
                  placeholder="DE123456789"
                />
                <FieldError message={getFieldError('seller_vat_id')} />
              </div>
              <div data-has-error={hasFieldError('seller_address')}>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Adresse <BT>BT-35</BT> <span style={{ color: 'rgb(var(--destructive))' }}>*</span>
                  <span className="ml-1 text-xs font-normal" style={labelMutedStyle}>(Straße, PLZ Stadt)</span>
                </label>
                <textarea
                  {...register('seller_address', { required: 'Verkäufer Adresse ist ein Pflichtfeld' })}
                  rows={2}
                  className={inputClass}
                  style={hasFieldError('seller_address') ? inputErrorStyle : inputStyle}
                  placeholder="Musterstraße 1, 60311 Frankfurt am Main"
                />
                <FieldError message={getFieldError('seller_address')} />
              </div>
            </div>
          </Section>
        </motion.div>

        {/* ---- Käufer ---- */}
        <motion.div
          custom={2}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Section title="Käufer (Buyer)" badge="BT-44 bis BT-55">
            <div className="space-y-3">
              <div data-has-error={hasFieldError('buyer_name')}>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Firmenname <BT>BT-44</BT> <span style={{ color: 'rgb(var(--destructive))' }}>*</span>
                </label>
                <input
                  {...register('buyer_name', { required: 'Käufer Firmenname ist ein Pflichtfeld' })}
                  className={inputClass}
                  style={hasFieldError('buyer_name') ? inputErrorStyle : inputStyle}
                  placeholder="Kunde AG"
                />
                <FieldError message={getFieldError('buyer_name')} />
              </div>
              <div data-has-error={hasFieldError('buyer_vat_id')}>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  USt-IdNr. <BT>BT-48</BT>
                  <span className="ml-1 text-xs font-normal" style={labelMutedStyle}>(optional)</span>
                </label>
                <input
                  {...register('buyer_vat_id', {
                    validate: validateUstId,
                  })}
                  className={inputClass}
                  style={hasFieldError('buyer_vat_id') ? inputErrorStyle : inputStyle}
                  placeholder="DE987654321"
                />
                <FieldError message={getFieldError('buyer_vat_id')} />
              </div>
              <div data-has-error={hasFieldError('buyer_address')}>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Adresse <BT>BT-50</BT> <span style={{ color: 'rgb(var(--destructive))' }}>*</span>
                  <span className="ml-1 text-xs font-normal" style={labelMutedStyle}>(Straße, PLZ Stadt)</span>
                </label>
                <textarea
                  {...register('buyer_address', { required: 'Käufer Adresse ist ein Pflichtfeld' })}
                  rows={2}
                  className={inputClass}
                  style={hasFieldError('buyer_address') ? inputErrorStyle : inputStyle}
                  placeholder="Kundenstraße 5, 10115 Berlin"
                />
                <FieldError message={getFieldError('buyer_address')} />
              </div>
            </div>
          </Section>
        </motion.div>

        {/* ---- Zahlungsinformationen ---- */}
        <motion.div
          custom={3}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Section title="Zahlungsinformationen" icon={<CreditCard size={16} />} badge="BG-16">
            <p className="text-xs mb-4" style={labelMutedStyle}>
              Bankverbindung für SEPA-Zahlung (empfohlen)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  IBAN <BT>BT-84</BT>
                  <span className="ml-1 text-xs font-normal" style={labelMutedStyle}>(empfohlen)</span>
                </label>
                <input
                  {...register('iban')}
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                  placeholder="DE89 3704 0044 0532 0130 00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  BIC/SWIFT <BT>BT-86</BT>
                </label>
                <input
                  {...register('bic')}
                  className={`${inputClass} font-mono`}
                  style={inputStyle}
                  placeholder="COBADEFFXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Kontoinhaber <BT>BT-85</BT>
                </label>
                <input
                  {...register('payment_account_name')}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Firmenname GmbH"
                />
              </div>
            </div>
          </Section>
        </motion.div>

        {/* ---- Routing & Referenz ---- */}
        <motion.div
          custom={4}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Section title="Routing & Referenz" icon={<Network size={16} />}>
            <p className="text-xs mb-4" style={labelMutedStyle}>
              Elektronische Adressen und Referenzen
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Leitweg-ID / Bestellreferenz <BT>BT-10</BT>
                  <span className="ml-1 text-xs font-normal text-amber-500">(Pflicht bei Behörden)</span>
                </label>
                <input
                  {...register('buyer_reference')}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="991-12345-67"
                />
                <p className="text-xs mt-1" style={labelMutedStyle}>
                  Pflicht für B2G-Rechnungen (z.B. 991-12345-67)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Elektron. Adresse Verkäufer <BT>BT-34</BT>
                </label>
                <input
                  {...register('seller_endpoint_id')}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="rechnung@musterfirma.de"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Elektron. Adresse Käufer <BT>BT-49</BT>
                </label>
                <input
                  {...register('buyer_endpoint_id')}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="eingangsrechnungen@kunde.de"
                />
              </div>
            </div>
          </Section>
        </motion.div>

        {/* ---- Rechnungspositionen ---- */}
        <motion.div
          custom={5}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <Section title="Rechnungspositionen (BG-25)">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs" style={labelMutedStyle}>
                Netto-Betrag = Menge x Einzelpreis (live berechnet)
              </p>
              <button
                type="button"
                onClick={() =>
                  append({ description: '', quantity: 1, unit_price: 0, net_amount: 0, tax_rate: 19 })
                }
                className="flex items-center gap-1.5 text-sm font-medium"
                style={{ color: 'rgb(var(--primary))' }}
              >
                <Plus size={14} /> Position hinzufügen
              </button>
            </div>

            {/* Column headers */}
            <div
              className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wide mb-2 px-1"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              <div className="col-span-5">Beschreibung</div>
              <div className="col-span-2 text-center">Menge</div>
              <div className="col-span-3 text-right">Einzelpreis</div>
              <div className="col-span-2 text-right">Netto</div>
            </div>

            <div className="space-y-2">
              <AnimatePresence>
                {fields.map((field, index) => {
                  const qty = Number(watchedItems[index]?.quantity) || 0
                  const price = Number(watchedItems[index]?.unit_price) || 0
                  const lineNet = qty * price
                  const descError = hasFieldError(`line_items.${index}.description`)
                  const priceError = hasFieldError(`line_items.${index}.unit_price`)
                  const qtyError = hasFieldError(`line_items.${index}.quantity`)
                  return (
                    <motion.div
                      key={field.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5" data-has-error={descError}>
                          <input
                            {...register(`line_items.${index}.description`, { required: 'Beschreibung ist erforderlich' })}
                            className={inputClass}
                            style={descError ? inputErrorStyle : inputStyle}
                            placeholder="Beratungsleistung"
                          />
                        </div>
                        <div className="col-span-2" data-has-error={qtyError}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            {...register(`line_items.${index}.quantity`, {
                              valueAsNumber: true,
                              required: 'Menge ist erforderlich',
                              min: { value: 0.01, message: 'Menge muss > 0 sein' },
                            })}
                            className={`${inputClass} text-center`}
                            style={qtyError ? inputErrorStyle : inputStyle}
                            placeholder="1"
                          />
                        </div>
                        <div className="col-span-3" data-has-error={priceError}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            {...register(`line_items.${index}.unit_price`, {
                              valueAsNumber: true,
                              required: 'Preis ist erforderlich',
                              min: { value: 0.01, message: 'Einzelpreis muss > 0 sein' },
                            })}
                            className={`${inputClass} text-right`}
                            style={priceError ? inputErrorStyle : inputStyle}
                            placeholder="100.00"
                          />
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-1.5">
                          <span
                            className="text-sm font-semibold tabular-nums"
                            style={{ color: 'rgb(var(--foreground))' }}
                          >
                            {lineNet.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                            className="disabled:opacity-30 transition-opacity p-0.5"
                            style={{ color: 'rgb(var(--destructive))' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {/* Per-line error messages */}
                      {(descError || qtyError || priceError) && (
                        <div className="grid grid-cols-12 gap-2 mt-0.5">
                          <div className="col-span-5">
                            <FieldError message={getFieldError(`line_items.${index}.description`)} />
                          </div>
                          <div className="col-span-2">
                            <FieldError message={getFieldError(`line_items.${index}.quantity`)} />
                          </div>
                          <div className="col-span-3">
                            <FieldError message={getFieldError(`line_items.${index}.unit_price`)} />
                          </div>
                          <div className="col-span-2" />
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>

            {/* Live totals */}
            <div
              className="mt-4 border-t pt-4 space-y-1.5"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <TotalRow label="Netto (BT-109)" value={net} />
              <TotalRow label={`MwSt ${watchedTaxRate}% (BT-110)`} value={tax} />
              <TotalRow label="Brutto / Zahlbetrag (BT-112)" value={gross} bold />
            </div>

            {/* Betrag warning */}
            {isSubmitted && gross <= 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs mt-2"
                style={{ color: 'rgb(var(--destructive))' }}
              >
                Der Gesamtbetrag muss groesser als 0 sein.
              </motion.p>
            )}
          </Section>
        </motion.div>

        {/* API Error */}
        <AnimatePresence>
          {apiError && (
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
              <p className="text-sm" style={{ color: 'rgb(var(--destructive))' }}>{apiError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          custom={6}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
        >
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: 'rgb(var(--primary))' }}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Rechnung wird erstellt...
              </>
            ) : (
              <>
                Rechnung erstellen und XRechnung 3.0.2 generieren
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </motion.div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldError({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="text-xs mt-1"
      style={{ color: 'rgb(var(--destructive))' }}
    >
      {message}
    </motion.p>
  )
}

function Section({
  title,
  badge,
  icon,
  children,
}: {
  title: string
  badge?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl border p-5 sm:p-6"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon && (
          <span style={{ color: 'rgb(var(--foreground-muted))' }}>{icon}</span>
        )}
        <h3 className="font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
          {title}
        </h3>
        {badge && (
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'rgb(var(--muted))',
              color: 'rgb(var(--foreground-muted))',
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function BT({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="ml-1 text-xs font-mono font-medium px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: 'rgb(var(--primary-light))',
        color: 'rgb(var(--primary))',
      }}
    >
      {children}
    </span>
  )
}

function TotalRow({
  label,
  value,
  bold = false,
}: {
  label: string
  value: number
  bold?: boolean
}) {
  return (
    <div
      className={`flex justify-between text-sm ${bold ? 'font-bold' : ''}`}
      style={{
        color: bold ? 'rgb(var(--foreground))' : 'rgb(var(--foreground-muted))',
      }}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value.toFixed(2)} &euro;</span>
    </div>
  )
}
