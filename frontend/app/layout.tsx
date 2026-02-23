import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/design-system/theme-provider'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.className} suppressHydrationWarning>
      <body className="min-h-screen antialiased" style={{ backgroundColor: 'rgb(var(--background))', color: 'rgb(var(--foreground))' }}>
        <ThemeProvider>
          <TooltipProvider>
            <div className="flex h-screen overflow-hidden">
              {/* Sidebar — desktop only */}
              <SidebarNav />

              {/* Main content area */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <main className="flex-1 overflow-y-auto">
                  {children}
                </main>
              </div>
            </div>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
