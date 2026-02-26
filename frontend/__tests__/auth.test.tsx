import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock the auth context
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    register: vi.fn(),
    user: null,
    loading: false,
    logout: vi.fn(),
  }),
}))

describe('Login Page', () => {
  it('renders login form with email and password fields', async () => {
    const LoginPage = (await import('../app/login/page')).default
    render(<LoginPage />)
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /anmelden/i })).toBeInTheDocument()
  })
})

describe('Register Page', () => {
  it('renders registration form', async () => {
    const RegisterPage = (await import('../app/register/page')).default
    render(<RegisterPage />)
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/firmenname/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /registrieren/i })).toBeInTheDocument()
  })
})
