'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CheckCircle2, XCircle, AlertTriangle, Upload, FileText,
  ChevronDown, ChevronRight, ShieldCheck, Server, Cpu,
} from 'lucide-react'
import {
  listInvoices,
  generateXRechnung,
  validateInvoice,
  validateXML,
  getErrorMessage,
  type Invoice,
  type ValidationResult,
  type ValidationIssue,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'invoice' | 'xml'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const statusLabel: Record<string, string> = {
  pending: 'Ausstehend',
  valid: 'Gültig',
  invalid: 'Ungültig',
}

// ---------------------------------------------------------------------------
// Result display
// ---------------------------------------------------------------------------

function IssueRow({ issue, type }: { issue: ValidationIssue; type: 'error' | 'warning' }) {
  const [open, setOpen] = useState(false)
  const hasDetail = Boolean(issue.location)

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        borderColor: type === 'error' ? 'rgb(254 202 202)' : 'rgb(254 240 138)',
        backgroundColor: type === 'error' ? 'rgb(254 242 242)' : 'rgb(254 252 232)',
      }}
    >
      <button
        onClick={() => hasDetail && setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
        style={{ cursor: hasDetail ? 'pointer' : 'default' }}
      >
        <span
          className="shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded font-mono"
          style={{
            backgroundColor: type === 'error' ? 'rgb(220 38 38)' : 'rgb(202 138 4)',
            color: '#fff',
          }}
        >
          {issue.code || (type === 'error' ? 'ERR' : 'WARN')}
        </span>
        <span className="flex-1 text-sm" style={{ color: type === 'error' ? 'rgb(153 27 27)' : 'rgb(133 77 14)' }}>
          {issue.message}
        </span>
        {hasDetail && (
          <span className="shrink-0 mt-0.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </button>
      {open && hasDetail && (
        <div
          className="px-4 pb-3 text-xs font-mono break-all"
          style={{ color: type === 'error' ? 'rgb(185 28 28)' : 'rgb(161 98 7)' }}
        >
          Pfad: {issue.location}
        </div>
      )}
    </div>
  )
}

function ValidationReport({ result, invoiceNumber }: { result: ValidationResult; invoiceNumber?: string }) {
  const isValid = result.is_valid
  const isKoSIT = result.validator === 'kosit'

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div
        className="rounded-xl p-5 flex items-center gap-4"
        style={{
          backgroundColor: isValid ? 'rgb(240 253 244)' : 'rgb(254 242 242)',
          border: `1px solid ${isValid ? 'rgb(187 247 208)' : 'rgb(254 202 202)'}`,
        }}
      >
        {isValid
          ? <CheckCircle2 size={32} className="shrink-0" style={{ color: 'rgb(22 163 74)' }} />
          : <XCircle size={32} className="shrink-0" style={{ color: 'rgb(220 38 38)' }} />
        }
        <div className="flex-1">
          <p className="text-lg font-bold" style={{ color: isValid ? 'rgb(21 128 61)' : 'rgb(185 28 28)' }}>
            {isValid ? 'XRechnung gültig' : 'Validierung fehlgeschlagen'}
          </p>
          {invoiceNumber && (
            <p className="text-sm mt-0.5" style={{ color: isValid ? 'rgb(22 163 74)' : 'rgb(220 38 38)' }}>
              {invoiceNumber}
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {/* Validator badge */}
          <span
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: isKoSIT ? 'rgb(219 234 254)' : 'rgb(243 244 246)',
              color: isKoSIT ? 'rgb(29 78 216)' : 'rgb(75 85 99)',
            }}
          >
            {isKoSIT ? <Server size={11} /> : <Cpu size={11} />}
            {isKoSIT ? 'KoSIT Docker' : 'Lokale Prüfung'}
          </span>
          {/* Counts */}
          <div className="flex gap-2">
            {result.error_count > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgb(220 38 38)', color: '#fff' }}>
                {result.error_count} Fehler
              </span>
            )}
            {result.warning_count > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgb(202 138 4)', color: '#fff' }}>
                {result.warning_count} Warnungen
              </span>
            )}
            {result.error_count === 0 && result.warning_count === 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgb(22 163 74)', color: '#fff' }}>
                0 Probleme
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'rgb(185 28 28)' }}>
            <XCircle size={14} />
            Fehler ({result.error_count})
          </h3>
          {result.errors.map((e, i) => <IssueRow key={i} issue={e} type="error" />)}
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'rgb(161 98 7)' }}>
            <AlertTriangle size={14} />
            Warnungen ({result.warning_count})
          </h3>
          {result.warnings.map((w, i) => <IssueRow key={i} issue={w} type="warning" />)}
        </div>
      )}

      {/* Validation ID */}
      <p className="text-xs text-right font-mono" style={{ color: 'rgb(var(--foreground-muted))' }}>
        Validierungs-ID: {result.validation_id}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mode 1 — Validate stored invoice
// ---------------------------------------------------------------------------

function InvoiceMode() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listInvoices(0, 100)
      .then(r => setInvoices(r.items))
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setResult(null)
    setError(null)
    setSelectedInvoice(invoices.find(inv => inv.invoice_id === id) ?? null)
  }

  const handleValidate = async () => {
    if (!selectedId) return
    setValidating(true)
    setError(null)
    setResult(null)

    try {
      const inv = invoices.find(i => i.invoice_id === selectedId)

      // XRechnung muss zuerst generiert werden
      if (!inv?.xrechnung_available) {
        await generateXRechnung(selectedId)
      }

      const res = await validateInvoice(selectedId)
      setResult(res)

      // Update local invoice list to reflect new xrechnung_available = true
      setInvoices(prev =>
        prev.map(i => i.invoice_id === selectedId ? { ...i, xrechnung_available: true } : i)
      )
    } catch (err) {
      setError(getErrorMessage(err, 'Validierung fehlgeschlagen'))
    } finally {
      setValidating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 rounded-lg animate-pulse" style={{ backgroundColor: 'rgb(var(--muted))' }} />
        ))}
      </div>
    )
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-10">
        <FileText size={32} className="mx-auto mb-3" style={{ color: 'rgb(var(--foreground-muted))' }} />
        <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Keine Rechnungen vorhanden. Zuerst eine Rechnung anlegen.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Invoice selector */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Rechnung auswählen
        </label>
        <select
          value={selectedId}
          onChange={e => handleSelect(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
          style={{
            backgroundColor: 'rgb(var(--background))',
            borderColor: 'rgb(var(--border))',
            color: 'rgb(var(--foreground))',
          }}
        >
          <option value="">— Rechnung wählen —</option>
          {invoices.map(inv => (
            <option key={inv.invoice_id} value={inv.invoice_id}>
              {inv.invoice_number} · {inv.seller_name} → {inv.buyer_name} · {fmt(inv.gross_amount)}
            </option>
          ))}
        </select>
      </div>

      {/* Selected invoice info */}
      {selectedInvoice && (
        <div
          className="rounded-lg border px-4 py-3 text-xs space-y-1"
          style={{ backgroundColor: 'rgb(var(--muted))', borderColor: 'rgb(var(--border))' }}
        >
          <div className="flex justify-between">
            <span style={{ color: 'rgb(var(--foreground-muted))' }}>Validierungsstatus</span>
            <span
              className="font-medium"
              style={{
                color: selectedInvoice.validation_status === 'valid'
                  ? 'rgb(22 163 74)'
                  : selectedInvoice.validation_status === 'invalid'
                  ? 'rgb(220 38 38)'
                  : 'rgb(var(--foreground))',
              }}
            >
              {statusLabel[selectedInvoice.validation_status] ?? selectedInvoice.validation_status}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'rgb(var(--foreground-muted))' }}>XRechnung generiert</span>
            <span
              className="font-medium"
              style={{ color: selectedInvoice.xrechnung_available ? 'rgb(22 163 74)' : 'rgb(var(--foreground-muted))' }}
            >
              {selectedInvoice.xrechnung_available ? 'Ja' : 'Nein — wird automatisch generiert'}
            </span>
          </div>
        </div>
      )}

      {/* Validate button */}
      <button
        onClick={handleValidate}
        disabled={!selectedId || validating}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
      >
        <ShieldCheck size={16} />
        {validating ? 'Wird validiert…' : 'Jetzt validieren'}
      </button>

      {/* Error */}
      {error && (
        <p className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgb(254 226 226)', color: 'rgb(185 28 28)' }}>
          {error}
        </p>
      )}

      {/* Result */}
      {result && (
        <ValidationReport
          result={result}
          invoiceNumber={selectedInvoice?.invoice_number}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mode 2 — Validate raw XML
// ---------------------------------------------------------------------------

function XMLMode() {
  const [xml, setXml] = useState('')
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setXml((ev.target?.result as string) ?? '')
      setResult(null)
      setError(null)
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleValidate = async () => {
    if (!xml.trim()) return
    setValidating(true)
    setError(null)
    setResult(null)
    try {
      const res = await validateXML(xml)
      setResult(res)
    } catch (err) {
      setError(getErrorMessage(err, 'Validierung fehlgeschlagen'))
    } finally {
      setValidating(false)
    }
  }

  const byteCount = new TextEncoder().encode(xml).length

  return (
    <div className="space-y-4">
      {/* File upload button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
          style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }}
        >
          <Upload size={14} />
          XML-Datei laden
        </button>
        {xml && (
          <span className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
            {byteCount.toLocaleString('de-DE')} Bytes geladen
          </span>
        )}
        <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={handleFile} />
      </div>

      {/* XML textarea */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgb(var(--foreground-muted))' }}>
          XML einfügen oder Datei laden
        </label>
        <textarea
          value={xml}
          onChange={e => { setXml(e.target.value); setResult(null); setError(null) }}
          placeholder={'<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"\n  ...>'}
          rows={12}
          spellCheck={false}
          className="w-full px-3 py-2.5 rounded-lg border text-xs font-mono outline-none resize-y"
          style={{
            backgroundColor: 'rgb(var(--background))',
            borderColor: 'rgb(var(--border))',
            color: 'rgb(var(--foreground))',
            lineHeight: 1.6,
          }}
        />
      </div>

      {/* Validate button */}
      <button
        onClick={handleValidate}
        disabled={!xml.trim() || validating}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: 'rgb(var(--primary))', color: '#fff' }}
      >
        <ShieldCheck size={16} />
        {validating ? 'Wird validiert…' : 'XML validieren'}
      </button>

      {/* Error */}
      {error && (
        <p className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgb(254 226 226)', color: 'rgb(185 28 28)' }}>
          {error}
        </p>
      )}

      {/* Result */}
      {result && <ValidationReport result={result} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ValidatorPage() {
  const [mode, setMode] = useState<Mode>('invoice')

  const tabStyle = (active: boolean) => ({
    color: active ? 'rgb(var(--primary))' : 'rgb(var(--foreground-muted))',
    borderBottom: active ? '2px solid rgb(var(--primary))' : '2px solid transparent',
  })

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
          XRechnung Validator
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
          Prüft XRechnung-Dateien gegen EN 16931 / XRechnung 3.0.2 Schematron-Regeln
        </p>
      </div>

      {/* Main card */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
      >
        {/* Tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          {([
            { id: 'invoice' as Mode, label: 'Gespeicherte Rechnung', icon: <FileText size={14} /> },
            { id: 'xml' as Mode, label: 'XML einfügen', icon: <Upload size={14} /> },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors"
              style={tabStyle(mode === tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {mode === 'invoice' ? <InvoiceMode /> : <XMLMode />}
        </div>
      </div>

      {/* Info box */}
      <div
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'rgb(var(--card))', borderColor: 'rgb(var(--border))' }}
      >
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'rgb(var(--foreground))' }}>
          <ShieldCheck size={14} />
          Validator-Stufen
        </h3>
        <div className="space-y-2 text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
          <div className="flex gap-3 items-start">
            <span
              className="shrink-0 flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: 'rgb(219 234 254)', color: 'rgb(29 78 216)' }}
            >
              <Server size={9} /> KoSIT Docker
            </span>
            <p>Offizieller KoSIT-Validator mit vollständiger Schematron-Prüfung (EN 16931 + XRechnung-Profil). Benötigt: <code className="font-mono">docker run -p 8080:8080 itplr-kosit/validator</code></p>
          </div>
          <div className="flex gap-3 items-start">
            <span
              className="shrink-0 flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: 'rgb(243 244 246)', color: 'rgb(75 85 99)' }}
            >
              <Cpu size={9} /> Lokale Prüfung
            </span>
            <p>Fallback: XML-Wohlgeformtheit + Pflichtfeld-Checks (BT-1, BT-2, BG-4, BG-7, BG-22, BG-25). Kein Docker nötig.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
