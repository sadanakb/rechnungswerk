import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'FAQ – RechnungsWerk | Haeufig gestellte Fragen',
  description:
    'Antworten auf alle Fragen zu E-Rechnungspflicht, XRechnung, ZUGFeRD, Peppol, GoBD-Konformitaet, Datenschutz und RechnungsWerk. Jetzt informieren.',
  openGraph: {
    title: 'FAQ – RechnungsWerk',
    description: 'Antworten zu E-Rechnungspflicht, XRechnung, ZUGFeRD und mehr.',
    type: 'website',
    locale: 'de_DE',
  },
}

export default function FAQLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
