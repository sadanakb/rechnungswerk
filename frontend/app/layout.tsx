import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { ThemeProvider } from '@/components/design-system/theme-provider'
import { AuthProvider } from '@/lib/auth'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CookieBanner } from '@/components/CookieBanner'

export const metadata: Metadata = {
  title: 'RechnungsWerk — Rechnungssoftware für Deutschland',
  description:
    'Professionelle Rechnungen, Angebote und Buchhaltung für Selbständige und KMU. ZUGFeRD & XRechnung konform. Made in Germany.',
  keywords: ['Rechnungssoftware', 'Rechnung erstellen', 'ZUGFeRD', 'XRechnung', 'Buchhaltung', 'Angebote', 'SaaS', 'Deutschland'],
  authors: [{ name: 'RechnungsWerk' }],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'RechnungsWerk — Rechnungssoftware für Deutschland',
    description: 'Professionelle Rechnungen, Angebote und Buchhaltung für Selbständige und KMU. ZUGFeRD & XRechnung konform.',
    url: 'https://rechnungswerk.de',
    siteName: 'RechnungsWerk',
    locale: 'de_DE',
    type: 'website',
    images: [{ url: '/logo-stacked.png', width: 512, height: 512, alt: 'RechnungsWerk Logo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RechnungsWerk — Rechnungssoftware für Deutschland',
    description: 'Professionelle Rechnungen, Angebote und Buchhaltung. ZUGFeRD & XRechnung konform.',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://rechnungswerk.de',
  },
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
              <CookieBanner />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
