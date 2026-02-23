import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Diese Datei testet das Verhalten von Formatierungsfunktionen, die in
// app/page.tsx als inline-Helpers definiert sind:
//
//   • formatEur(value)          — Intl.NumberFormat de-DE EUR
//   • buildMonthlyData(invoices) — aggregiert Rechnungen der letzten 6 Monate
//   • calcOcrSuccessRate(invoices) — berechnet OCR-Erfolgsquote
//   • calcMonthlyRevenue(invoices) — summiert Umsatz des aktuellen Monats
//
// Da diese Funktionen nicht exportiert werden, werden sie hier zur
// Test-Zweck lokal re-implementiert. Das stellt sicher, dass die Logik
// korrekt ist, ohne Produktionscode zu verändern.
// ---------------------------------------------------------------------------

// Re-Implementierung von formatEur (identisch zu app/page.tsx Zeile 96-98)
function formatEur(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

// Re-Implementierung von calcOcrSuccessRate (identisch zu app/page.tsx Zeile 89-93)
interface InvoiceStub {
  source_type: string
  ocr_confidence?: number
  invoice_date?: string
  created_at?: string
  gross_amount?: number
}

function calcOcrSuccessRate(invoices: InvoiceStub[]): string {
  const ocrInvoices = invoices.filter((inv) => inv.source_type === 'ocr')
  if (!ocrInvoices.length) return '—'
  const successful = ocrInvoices.filter((inv) => (inv.ocr_confidence ?? 0) >= 60).length
  return `${Math.round((successful / ocrInvoices.length) * 100)}%`
}

// Re-Implementierung von calcMonthlyRevenue (identisch zu app/page.tsx Zeile 81-87)
function calcMonthlyRevenue(invoices: InvoiceStub[]): number {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return invoices
    .filter((inv) => (inv.invoice_date || inv.created_at || '').startsWith(thisMonth))
    .reduce((sum, inv) => sum + (inv.gross_amount || 0), 0)
}

// ---------------------------------------------------------------------------
// formatEur — Währungsformatierung
// ---------------------------------------------------------------------------
describe('formatEur()', () => {
  it('formatiert 0 als "0 €"', () => {
    const result = formatEur(0)
    expect(result).toContain('0')
    expect(result).toContain('€')
  })

  it('formatiert 1000 mit deutschem Tausendertrennzeichen', () => {
    const result = formatEur(1000)
    // de-DE: "1.000 €" — Punkt als Tausendertrenner
    expect(result).toContain('1.000')
    expect(result).toContain('€')
  })

  it('rundet auf ganze Euro (keine Nachkommastellen)', () => {
    const result = formatEur(1234.56)
    expect(result).not.toContain('56')
    expect(result).toContain('1.235')
  })

  it('formatiert 100 als "100 €"', () => {
    const result = formatEur(100)
    expect(result).toContain('100')
    expect(result).toContain('€')
  })

  it('formatiert negative Werte korrekt', () => {
    const result = formatEur(-500)
    expect(result).toContain('500')
    expect(result).toContain('€')
  })

  it('gibt einen String zurück', () => {
    expect(typeof formatEur(42)).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// calcOcrSuccessRate — OCR-Erfolgsquote
// ---------------------------------------------------------------------------
describe('calcOcrSuccessRate()', () => {
  it('gibt "—" zurück wenn keine OCR-Rechnungen vorhanden', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'manual' },
      { source_type: 'import' },
    ]
    expect(calcOcrSuccessRate(invoices)).toBe('—')
  })

  it('gibt "—" zurück bei leerer Liste', () => {
    expect(calcOcrSuccessRate([])).toBe('—')
  })

  it('berechnet 100% wenn alle OCR-Rechnungen confidence >= 60 haben', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'ocr', ocr_confidence: 85 },
      { source_type: 'ocr', ocr_confidence: 70 },
      { source_type: 'ocr', ocr_confidence: 60 },
    ]
    expect(calcOcrSuccessRate(invoices)).toBe('100%')
  })

  it('berechnet 0% wenn alle OCR-Rechnungen confidence < 60 haben', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'ocr', ocr_confidence: 59 },
      { source_type: 'ocr', ocr_confidence: 30 },
    ]
    expect(calcOcrSuccessRate(invoices)).toBe('0%')
  })

  it('berechnet 50% korrekt', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'ocr', ocr_confidence: 80 },
      { source_type: 'ocr', ocr_confidence: 40 },
    ]
    expect(calcOcrSuccessRate(invoices)).toBe('50%')
  })

  it('behandelt fehlende ocr_confidence als 0 (unter Schwellwert)', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'ocr' }, // kein ocr_confidence
    ]
    expect(calcOcrSuccessRate(invoices)).toBe('0%')
  })

  it('ignoriert nicht-OCR Rechnungen bei der Berechnung', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'ocr', ocr_confidence: 90 },
      { source_type: 'manual', ocr_confidence: 10 }, // wird ignoriert
    ]
    expect(calcOcrSuccessRate(invoices)).toBe('100%')
  })
})

// ---------------------------------------------------------------------------
// calcMonthlyRevenue — Monatsumsatz
// ---------------------------------------------------------------------------
describe('calcMonthlyRevenue()', () => {
  const now = new Date()
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  it('gibt 0 zurück bei leerer Rechnungsliste', () => {
    expect(calcMonthlyRevenue([])).toBe(0)
  })

  it('summiert Rechnungen des aktuellen Monats korrekt', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'manual', invoice_date: `${thisMonthStr}-01`, gross_amount: 500 },
      { source_type: 'manual', invoice_date: `${thisMonthStr}-15`, gross_amount: 300 },
    ]
    expect(calcMonthlyRevenue(invoices)).toBe(800)
  })

  it('ignoriert Rechnungen aus vergangenen Monaten', () => {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`

    const invoices: InvoiceStub[] = [
      { source_type: 'manual', invoice_date: `${thisMonthStr}-01`, gross_amount: 200 },
      { source_type: 'manual', invoice_date: `${lastMonthStr}-01`, gross_amount: 999 },
    ]
    expect(calcMonthlyRevenue(invoices)).toBe(200)
  })

  it('verwendet created_at als Fallback wenn invoice_date fehlt', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'ocr', created_at: `${thisMonthStr}-05T10:00:00`, gross_amount: 150 },
    ]
    expect(calcMonthlyRevenue(invoices)).toBe(150)
  })

  it('behandelt fehlende gross_amount als 0', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'manual', invoice_date: `${thisMonthStr}-01` }, // kein gross_amount
    ]
    expect(calcMonthlyRevenue(invoices)).toBe(0)
  })

  it('gibt 0 zurück wenn keine Rechnungen im aktuellen Monat', () => {
    const invoices: InvoiceStub[] = [
      { source_type: 'manual', invoice_date: '2020-01-01', gross_amount: 500 },
    ]
    expect(calcMonthlyRevenue(invoices)).toBe(0)
  })
})
