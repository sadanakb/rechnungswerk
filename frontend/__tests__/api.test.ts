import { describe, it, expect, vi } from 'vitest'
import { getErrorMessage, getXRechnungDownloadUrl, getZUGFeRDDownloadUrl, exportDATEV, API_BASE } from '@/lib/api'

// ---------------------------------------------------------------------------
// Mock axios so no real HTTP calls are made during unit tests.
// The `api` module creates an axios instance at import time, so we mock the
// whole axios module before anything else runs.
// ---------------------------------------------------------------------------
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios')
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn(() => ({
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: {
          response: { use: vi.fn() },
          request: { use: vi.fn() },
        },
      })),
    },
  }
})

// ---------------------------------------------------------------------------
// getErrorMessage
// ---------------------------------------------------------------------------
describe('getErrorMessage', () => {
  it('gibt detail aus einem Axios-Response-Error zurück', () => {
    const axiosErr = {
      response: { data: { detail: 'Rechnung nicht gefunden' } },
      message: 'Request failed with status code 404',
    }
    expect(getErrorMessage(axiosErr)).toBe('Rechnung nicht gefunden')
  })

  it('gibt die message-Eigenschaft zurück wenn kein response.data.detail vorhanden', () => {
    const errWithMessage = {
      message: 'Network Error',
    }
    expect(getErrorMessage(errWithMessage)).toBe('Network Error')
  })

  it('gibt den Fallback-Text zurück wenn keine Fehlerdetails vorhanden', () => {
    expect(getErrorMessage(null)).toBe('Ein Fehler ist aufgetreten')
  })

  it('gibt den Fallback-Text zurück für primitive Werte', () => {
    expect(getErrorMessage(42)).toBe('Ein Fehler ist aufgetreten')
    expect(getErrorMessage('string-error')).toBe('Ein Fehler ist aufgetreten')
  })

  it('gibt einen benutzerdefinierten Fallback zurück wenn übergeben', () => {
    expect(getErrorMessage(null, 'Eigener Fallback')).toBe('Eigener Fallback')
  })

  it('bevorzugt detail vor message wenn beide vorhanden', () => {
    const err = {
      response: { data: { detail: 'API-Detail' } },
      message: 'HTTP-Message',
    }
    expect(getErrorMessage(err)).toBe('API-Detail')
  })

  it('fällt auf message zurück wenn response.data.detail fehlt', () => {
    const err = {
      response: { data: {} },
      message: 'Fallback-Message',
    }
    expect(getErrorMessage(err)).toBe('Fallback-Message')
  })

  it('fällt auf Fallback zurück wenn response.data null ist', () => {
    const err = {
      response: { data: null },
      message: undefined,
    }
    expect(getErrorMessage(err)).toBe('Ein Fehler ist aufgetreten')
  })
})

// ---------------------------------------------------------------------------
// getXRechnungDownloadUrl
// ---------------------------------------------------------------------------
describe('getXRechnungDownloadUrl', () => {
  it('gibt die korrekte XRechnung-Download-URL zurück', () => {
    const url = getXRechnungDownloadUrl('abc-123')
    expect(url).toBe(`${API_BASE}/api/invoices/abc-123/download-xrechnung`)
  })

  it('enthält die invoice-ID korrekt in der URL', () => {
    const invoiceId = 'inv-2024-001'
    const url = getXRechnungDownloadUrl(invoiceId)
    expect(url).toContain(invoiceId)
    expect(url).toContain('/download-xrechnung')
  })

  it('beginnt mit der API_BASE', () => {
    const url = getXRechnungDownloadUrl('test-id')
    expect(url.startsWith(API_BASE)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getZUGFeRDDownloadUrl
// ---------------------------------------------------------------------------
describe('getZUGFeRDDownloadUrl', () => {
  it('gibt die korrekte ZUGFeRD-Download-URL zurück', () => {
    const url = getZUGFeRDDownloadUrl('abc-123')
    expect(url).toBe(`${API_BASE}/api/invoices/abc-123/download-zugferd`)
  })

  it('enthält die invoice-ID korrekt in der URL', () => {
    const invoiceId = 'inv-2024-001'
    const url = getZUGFeRDDownloadUrl(invoiceId)
    expect(url).toContain(invoiceId)
    expect(url).toContain('/download-zugferd')
  })

  it('unterscheidet sich von der XRechnung-URL', () => {
    const id = 'same-id'
    expect(getZUGFeRDDownloadUrl(id)).not.toBe(getXRechnungDownloadUrl(id))
  })
})

// ---------------------------------------------------------------------------
// exportDATEV
// ---------------------------------------------------------------------------
describe('exportDATEV', () => {
  it('gibt die Standard-DATEV-URL mit buchungsstapel und SKR03 zurück', () => {
    const url = exportDATEV()
    expect(url).toBe(`${API_BASE}/api/export/datev?format=buchungsstapel&kontenrahmen=SKR03`)
  })

  it('setzt csv als Format korrekt', () => {
    const url = exportDATEV('csv', 'SKR04')
    expect(url).toBe(`${API_BASE}/api/export/datev?format=csv&kontenrahmen=SKR04`)
  })

  it('kombiniert buchungsstapel mit SKR04', () => {
    const url = exportDATEV('buchungsstapel', 'SKR04')
    expect(url).toContain('format=buchungsstapel')
    expect(url).toContain('kontenrahmen=SKR04')
  })

  it('kombiniert csv mit SKR03', () => {
    const url = exportDATEV('csv', 'SKR03')
    expect(url).toContain('format=csv')
    expect(url).toContain('kontenrahmen=SKR03')
  })

  it('beginnt mit der API_BASE', () => {
    const url = exportDATEV('csv', 'SKR04')
    expect(url.startsWith(API_BASE)).toBe(true)
  })
})
