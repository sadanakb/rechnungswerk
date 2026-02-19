import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'RechnungsWerk - E-Invoice OCR & XRechnung 3.0.2',
  description:
    'Convert paper invoices to XRechnung 3.0.2 and ZUGFeRD using Tesseract OCR. EN 16931 compliant UBL XML generator.',
  keywords: ['XRechnung', 'ZUGFeRD', 'E-Rechnung', 'OCR', 'UBL', 'EN 16931'],
}

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/ocr', label: 'OCR Upload' },
  { href: '/manual', label: 'Manuelle Eingabe' },
  { href: '/invoices', label: 'Rechnungen' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.className}>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {/* Persistent top navigation */}
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <span className="text-xl font-bold text-blue-700 tracking-tight">
                RechnungsWerk
              </span>
              <span className="hidden sm:inline-flex items-center text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                XRechnung 3.0.2
              </span>
            </Link>

            {/* Nav links */}
            <div className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Page content */}
        {children}
      </body>
    </html>
  )
}
