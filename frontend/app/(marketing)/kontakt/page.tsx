import type { Metadata } from 'next'
import KontaktForm from './KontaktForm'

export const metadata: Metadata = {
  title: 'Kontakt – RechnungsWerk',
  description: 'Nehmen Sie Kontakt mit uns auf. Wir antworten innerhalb von 24 Stunden.',
  openGraph: {
    title: 'Kontakt – RechnungsWerk',
    description: 'Nehmen Sie Kontakt mit uns auf. Wir antworten innerhalb von 24 Stunden.',
    type: 'website',
    locale: 'de_DE',
  },
}

export default function KontaktPage() {
  return (
    <>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '80px 24px' }}>
        {/* Page header */}
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: 'rgb(var(--foreground))' }}
        >
          Kontakt
        </h1>
        <p
          className="mt-3 text-lg"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          Wir antworten innerhalb von 24 Stunden.
        </p>

        {/* Contact info row */}
        <div
          className="mt-8 flex flex-col sm:flex-row gap-4"
        >
          <div
            className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: 'rgb(var(--border))',
              backgroundColor: 'rgb(var(--card))',
              color: 'rgb(var(--foreground))',
            }}
          >
            <span>&#9993;</span>
            <a
              href="mailto:contact@rechnungswerk.de"
              style={{ color: 'rgb(var(--primary))' }}
            >
              contact@rechnungswerk.de
            </a>
          </div>
          <div
            className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: 'rgb(var(--border))',
              backgroundColor: 'rgb(var(--card))',
              color: 'rgb(var(--foreground))',
            }}
          >
            <span>&#128025;</span>
            <a
              href="https://github.com/sadanakb/rechnungswerk/issues"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'rgb(var(--primary))' }}
            >
              GitHub Issues
            </a>
          </div>
        </div>

        {/* Contact form */}
        <div className="mt-10">
          <KontaktForm />
        </div>
      </main>

      {/* JSON-LD Organization schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'RechnungsWerk',
            url: 'https://rechnungswerk.de',
            email: 'contact@rechnungswerk.de',
            contactPoint: {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              email: 'contact@rechnungswerk.de',
              availableLanguage: 'German',
            },
          }),
        }}
      />
    </>
  )
}
