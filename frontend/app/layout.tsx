import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { ThemeProvider } from '@/components/design-system/theme-provider'
import { AuthProvider } from '@/lib/auth'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'

export const metadata: Metadata = {
  title: 'RechnungsWerk - E-Invoice OCR & XRechnung 3.0.2',
  description:
    'Convert paper invoices to XRechnung 3.0.2 and ZUGFeRD using Tesseract OCR. EN 16931 compliant UBL XML generator.',
  keywords: ['XRechnung', 'ZUGFeRD', 'E-Rechnung', 'OCR', 'UBL', 'EN 16931'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased" style={{ backgroundColor: 'rgb(var(--background))', color: 'rgb(var(--foreground))' }}>
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider>
              {children}
              <Toaster position="bottom-right" />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
