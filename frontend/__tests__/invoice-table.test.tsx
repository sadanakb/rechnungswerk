import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

describe('InvoiceTable', () => {
  it('renders table headers', async () => {
    const { InvoiceTable } = await import('../components/InvoiceTable')
    render(<InvoiceTable invoices={[]} loading={false} />)
    expect(screen.getByText(/rechnungsnr/i)).toBeInTheDocument()
    expect(screen.getByText(/datum/i)).toBeInTheDocument()
    expect(screen.getByText(/betrag/i)).toBeInTheDocument()
  })

  it('renders empty state when no invoices', async () => {
    const { InvoiceTable } = await import('../components/InvoiceTable')
    render(<InvoiceTable invoices={[]} loading={false} />)
    expect(screen.getByText(/keine rechnungen/i)).toBeInTheDocument()
  })

  it('renders loading skeleton', async () => {
    const { InvoiceTable } = await import('../components/InvoiceTable')
    const { container } = render(<InvoiceTable invoices={[]} loading={true} />)
    const skeletons = container.querySelectorAll('[data-testid="skeleton-row"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders invoice rows', async () => {
    const { InvoiceTable } = await import('../components/InvoiceTable')
    const invoices = [
      {
        invoice_id: 'inv-001',
        invoice_number: 'RE-2024-001',
        created_at: '2024-01-15T10:00:00Z',
        buyer_name: 'Musterfirma GmbH',
        gross_amount: 1190.0,
        status: 'valid',
      },
    ]
    render(<InvoiceTable invoices={invoices} loading={false} />)
    expect(screen.getByText('RE-2024-001')).toBeInTheDocument()
    expect(screen.getByText('Musterfirma GmbH')).toBeInTheDocument()
    expect(screen.getByText(/1\.190,00/)).toBeInTheDocument()
  })

  it('renders status badges', async () => {
    const { InvoiceTable } = await import('../components/InvoiceTable')
    const invoices = [
      {
        invoice_id: 'inv-002',
        invoice_number: 'RE-2024-002',
        created_at: '2024-02-01T10:00:00Z',
        buyer_name: 'Test AG',
        gross_amount: 500.0,
        status: 'valid',
      },
    ]
    render(<InvoiceTable invoices={invoices} loading={false} />)
    expect(screen.getByText(/validiert/i)).toBeInTheDocument()
  })
})
