import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('CommandPalette', () => {
  it('renders when open', async () => {
    const { CommandPalette } = await import('../components/CommandPalette')
    render(<CommandPalette open={true} onOpenChange={() => {}} />)
    expect(screen.getByPlaceholderText(/suchen/i)).toBeInTheDocument()
  })
})
