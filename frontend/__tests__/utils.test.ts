import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// cn() — clsx + tailwind-merge utility
// ---------------------------------------------------------------------------
describe('cn()', () => {
  // --- Basis-Verkettung ---
  it('verkettet zwei einfache Klassen mit einem Leerzeichen', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('verkettet mehrere Klassen', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz')
  })

  // --- Falsy-Werte werden gefiltert ---
  it('filtert false-Ausdrücke heraus', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })

  it('filtert undefined heraus', () => {
    expect(cn(undefined, 'a')).toBe('a')
  })

  it('filtert null heraus', () => {
    expect(cn(null, 'a')).toBe('a')
  })

  it('filtert mehrere falsy-Werte heraus', () => {
    expect(cn(undefined, null, false, 'a')).toBe('a')
  })

  it('gibt leeren String zurück wenn alle Argumente falsy sind', () => {
    expect(cn(undefined, null, false)).toBe('')
  })

  // --- Tailwind-Merge: spätere Klasse gewinnt bei Konflikten ---
  it('tailwind-merge: späteres px gewinnt (px-2 vs px-4)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('tailwind-merge: späteres py gewinnt', () => {
    expect(cn('py-1', 'py-8')).toBe('py-8')
  })

  it('tailwind-merge: spätere Textfarbe gewinnt', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('tailwind-merge: späteres bg gewinnt', () => {
    expect(cn('bg-white', 'bg-gray-100')).toBe('bg-gray-100')
  })

  it('tailwind-merge: nicht-konfliktierende Klassen bleiben beide erhalten', () => {
    const result = cn('px-4', 'py-2')
    expect(result).toContain('px-4')
    expect(result).toContain('py-2')
  })

  // --- Objekt-Syntax (clsx-Feature) ---
  it('unterstützt Objekt-Syntax von clsx', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500')
  })

  it('kombiniert Objekt- und String-Syntax', () => {
    const result = cn('base-class', { 'active-class': true, 'inactive-class': false })
    expect(result).toContain('base-class')
    expect(result).toContain('active-class')
    expect(result).not.toContain('inactive-class')
  })

  // --- Array-Syntax (clsx-Feature) ---
  it('unterstützt Array-Syntax von clsx', () => {
    expect(cn(['a', 'b'])).toBe('a b')
  })

  // --- Praktische Verwendung wie im Projekt ---
  it('kombiniert Basis-Klassen mit bedingten Varianten', () => {
    const isActive = true
    const result = cn('rounded-md px-4 py-2', isActive && 'bg-blue-600 text-white')
    expect(result).toContain('bg-blue-600')
    expect(result).toContain('text-white')
    expect(result).toContain('rounded-md')
  })

  it('entfernt doppelte Padding-Klassen korrekt', () => {
    // tailwind-merge entfernt px-2 weil px-4 später kommt
    const result = cn('px-2 py-1', 'px-4')
    expect(result).toContain('px-4')
    expect(result).not.toContain('px-2')
    expect(result).toContain('py-1')
  })
})
