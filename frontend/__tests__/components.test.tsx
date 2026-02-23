import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Speichern</Button>)
    expect(screen.getByText('Speichern')).toBeInTheDocument()
  })

  it('renders as button element by default', () => {
    render(<Button>Test</Button>)
    expect(screen.getByRole('button', { name: 'Test' })).toBeInTheDocument()
  })

  it('applies variant classes', () => {
    const { container } = render(<Button variant="destructive">Löschen</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('bg-red')
  })

  it('applies size classes', () => {
    const { container } = render(<Button size="sm">Klein</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('h-8')
  })

  it('supports disabled state', () => {
    render(<Button disabled>Deaktiviert</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('accepts custom className', () => {
    const { container } = render(<Button className="custom-class">Test</Button>)
    expect(container.querySelector('.custom-class')).toBeTruthy()
  })
})

describe('Badge', () => {
  it('renders with text', () => {
    render(<Badge>Status</Badge>)
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('renders as span element', () => {
    const { container } = render(<Badge>Test</Badge>)
    expect(container.querySelector('span')).toBeTruthy()
  })

  it('applies success variant', () => {
    const { container } = render(<Badge variant="success">Validiert</Badge>)
    const span = container.querySelector('span')
    expect(span?.className).toContain('emerald')
  })

  it('applies warning variant', () => {
    const { container } = render(<Badge variant="warning">Ausstehend</Badge>)
    const span = container.querySelector('span')
    expect(span?.className).toContain('amber')
  })

  it('applies destructive variant', () => {
    const { container } = render(<Badge variant="destructive">Fehler</Badge>)
    const span = container.querySelector('span')
    expect(span?.className).toContain('red')
  })
})

describe('Card', () => {
  it('renders card with header and content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Rechnungsübersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Inhalt hier</p>
        </CardContent>
      </Card>
    )
    expect(screen.getByText('Rechnungsübersicht')).toBeInTheDocument()
    expect(screen.getByText('Inhalt hier')).toBeInTheDocument()
  })

  it('renders as div element', () => {
    const { container } = render(<Card>Test</Card>)
    // Outer wrapper from render + card div
    const divs = container.querySelectorAll('div')
    expect(divs.length).toBeGreaterThanOrEqual(1)
  })

  it('applies border and shadow classes', () => {
    const { container } = render(<Card>Test</Card>)
    const card = container.firstElementChild
    expect(card?.className).toContain('border')
    expect(card?.className).toContain('shadow')
  })
})
