/**
 * RechnungsWerk Design Tokens
 *
 * Brand colors, spacing, typography, and component styles
 * for a premium German B2B SaaS look.
 */

export const colors = {
  // Primary — Teal (modern, fresh, professional)
  primary: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
    950: '#042f2e',
  },
  // Accent — Emerald (success, money, invoices)
  accent: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },
  // Neutral — Slate (Navy-based)
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  // Status
  success: '#059669',
  warning: '#f59e0b',
  error: '#f43f5e',
  info: '#14b8a6',
} as const

export const spacing = {
  page: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  section: 'py-6 sm:py-8',
  card: 'p-5 sm:p-6',
} as const

export const typography = {
  h1: 'text-2xl sm:text-3xl font-bold tracking-tight',
  h2: 'text-xl sm:text-2xl font-semibold',
  h3: 'text-lg font-semibold',
  body: 'text-sm text-gray-600 dark:text-gray-400',
  caption: 'text-xs text-gray-500 dark:text-gray-500',
  mono: 'font-mono text-xs',
} as const

export const shadows = {
  card: 'shadow-sm hover:shadow-md transition-shadow',
  elevated: 'shadow-md',
  modal: 'shadow-xl',
} as const

// Confidence level colors for OCR fields
export const confidenceLevels = {
  high: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  low: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
} as const
