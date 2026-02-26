import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'RechnungsWerk — E-Rechnungen erstellen | XRechnung & ZUGFeRD',
  description:
    'Erstelle XRechnung und ZUGFeRD konforme E-Rechnungen. Open Source. Ab 9 EUR/Monat. GoBD-konform. DATEV-Export.',
  openGraph: {
    title: 'RechnungsWerk — E-Rechnungen in 30 Sekunden',
    description: 'XRechnung & ZUGFeRD konform. Open Source. Ab 9 EUR/Monat.',
    type: 'website',
    locale: 'de_DE',
  },
}

/* -----------------------------------------------------------------------
   Badge data
   ----------------------------------------------------------------------- */
const trustBadges = [
  { label: 'XRechnung 3.0.2', sub: 'EN 16931 konform' },
  { label: 'ZUGFeRD 2.3.3', sub: 'Hybrid-PDF' },
  { label: 'DSGVO-konform', sub: 'Hosting in DE' },
  { label: 'Open Source', sub: 'AGPL-3.0' },
]

const timelineSteps = [
  { year: '2025', text: 'Empfangspflicht fuer alle B2B-Unternehmen', active: true },
  { year: '2027', text: 'Sendepflicht fuer Unternehmen > 800.000 EUR Umsatz', active: false },
  { year: '2028', text: 'Sendepflicht fuer alle B2B-Unternehmen', active: false },
]

const features = [
  {
    title: 'OCR-Erkennung',
    description: 'PDF-Rechnungen per Tesseract OCR einlesen und automatisch in strukturierte Daten umwandeln.',
    icon: '📄',
  },
  {
    title: 'XRechnung & ZUGFeRD',
    description: 'Konformer UBL-XML-Export (XRechnung 3.0.2) und ZUGFeRD 2.3.3 Hybrid-PDFs auf Knopfdruck.',
    icon: '✅',
  },
  {
    title: 'DATEV-Export',
    description: 'Buchungsdaten direkt im DATEV-Format exportieren. Nahtlose Uebergabe an den Steuerberater.',
    icon: '📊',
  },
  {
    title: 'Validierung',
    description: 'Integrierte EN 16931 Validierung prueft Rechnungen vor dem Versand auf Konformitaet.',
    icon: '🔍',
  },
]

const pricingPreview = [
  {
    name: 'Free',
    price: '0',
    unit: 'EUR / Monat',
    highlight: false,
    features: ['5 Rechnungen/Monat', 'XRechnung + ZUGFeRD', 'OCR-Erkennung'],
  },
  {
    name: 'Starter',
    price: '9,90',
    unit: 'EUR / Monat',
    highlight: true,
    features: ['Unbegrenzte Rechnungen', 'DATEV-Export', 'Mahnwesen', 'API-Zugang'],
  },
  {
    name: 'Professional',
    price: '19,90',
    unit: 'EUR / Monat',
    highlight: false,
    features: ['Alles aus Starter', 'Banking-Integration', 'Team-Verwaltung', 'Prioritaets-Support'],
  },
]

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default function LandingPage() {
  return (
    <>
      <main>
        {/* ============================================================
            Hero
            ============================================================ */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
            <p
              className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold mb-6"
              style={{
                backgroundColor: 'rgb(var(--primary-light))',
                color: 'rgb(var(--primary))',
                border: '1px solid rgb(var(--primary-border))',
              }}
            >
              E-Rechnungspflicht ab 2025 — Jetzt vorbereiten
            </p>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              E-Rechnungen erstellen.
              <br />
              <span style={{ color: 'rgb(var(--primary))' }}>XRechnung &amp; ZUGFeRD konform.</span>
            </h1>

            <p
              className="mt-6 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              RechnungsWerk wandelt Ihre Rechnungen in XRechnung 3.0.2 und ZUGFeRD 2.3.3 um
              — per OCR oder manueller Eingabe. Open Source, GoBD-konform, DATEV-ready.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-lg px-8 py-3.5 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
                style={{
                  backgroundColor: 'rgb(var(--primary))',
                  color: 'rgb(var(--primary-foreground))',
                }}
              >
                Kostenlos starten
              </Link>
              <a
                href="https://github.com/sadanakb/rechnungswerk"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-8 py-3.5 text-base font-semibold border transition-colors"
                style={{
                  borderColor: 'rgb(var(--border-strong))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                GitHub ansehen
              </a>
            </div>
          </div>
        </section>

        {/* ============================================================
            Trust badges
            ============================================================ */}
        <section className="border-y" style={{ borderColor: 'rgb(var(--border))' }}>
          <div className="mx-auto max-w-6xl px-6 py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {trustBadges.map((badge) => (
                <div key={badge.label}>
                  <p className="text-sm font-bold" style={{ color: 'rgb(var(--foreground))' }}>
                    {badge.label}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                    {badge.sub}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Problem: E-Rechnungspflicht timeline
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                E-Rechnungspflicht: Der Fahrplan
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Die Pflicht zur elektronischen Rechnung im B2B-Bereich wird stufenweise eingefuehrt.
                Bereiten Sie sich jetzt vor.
              </p>
            </div>

            <div className="max-w-2xl mx-auto space-y-6">
              {timelineSteps.map((step) => (
                <div
                  key={step.year}
                  className="flex items-start gap-4 rounded-xl border p-5"
                  style={{
                    backgroundColor: step.active ? 'rgb(var(--primary-light))' : 'rgb(var(--card))',
                    borderColor: step.active ? 'rgb(var(--primary-border))' : 'rgb(var(--border))',
                  }}
                >
                  <span
                    className="shrink-0 rounded-lg px-3 py-1 text-sm font-bold"
                    style={{
                      backgroundColor: step.active ? 'rgb(var(--primary))' : 'rgb(var(--muted))',
                      color: step.active ? 'rgb(var(--primary-foreground))' : 'rgb(var(--foreground))',
                    }}
                  >
                    {step.year}
                  </span>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {step.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Features
            ============================================================ */}
        <section
          className="py-20"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Alles fuer Ihre E-Rechnungen
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Von der OCR-Erkennung bis zum DATEV-Export — ein Werkzeug fuer den gesamten Rechnungsprozess.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border p-6"
                  style={{
                    backgroundColor: 'rgb(var(--background))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <span className="text-2xl" role="img" aria-label={feature.title}>
                    {feature.icon}
                  </span>
                  <h3
                    className="mt-3 text-lg font-semibold"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Pricing preview
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Einfache, faire Preise
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Starten Sie kostenlos. Upgraden Sie, wenn Ihr Geschaeft waechst.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {pricingPreview.map((tier) => (
                <div
                  key={tier.name}
                  className="rounded-xl border p-6 flex flex-col"
                  style={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: tier.highlight ? 'rgb(var(--primary))' : 'rgb(var(--border))',
                    borderWidth: tier.highlight ? '2px' : '1px',
                  }}
                >
                  {tier.highlight && (
                    <span
                      className="self-start rounded-full px-3 py-0.5 text-xs font-semibold mb-4"
                      style={{
                        backgroundColor: 'rgb(var(--primary-light))',
                        color: 'rgb(var(--primary))',
                      }}
                    >
                      Beliebteste Wahl
                    </span>
                  )}
                  <h3
                    className="text-lg font-bold"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {tier.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span
                      className="text-3xl font-extrabold"
                      style={{ color: 'rgb(var(--foreground))' }}
                    >
                      {tier.price}
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      {tier.unit}
                    </span>
                  </div>
                  <ul className="mt-6 space-y-2.5 flex-1">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        <span
                          className="mt-0.5 shrink-0"
                          style={{ color: 'rgb(var(--primary))' }}
                        >
                          &#10003;
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={tier.highlight ? '/register' : '/preise'}
                    className="mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-shadow"
                    style={
                      tier.highlight
                        ? {
                            backgroundColor: 'rgb(var(--primary))',
                            color: 'rgb(var(--primary-foreground))',
                          }
                        : {
                            border: '1px solid rgb(var(--border-strong))',
                            color: 'rgb(var(--foreground))',
                          }
                    }
                  >
                    {tier.highlight ? 'Jetzt starten' : 'Mehr erfahren'}
                  </Link>
                </div>
              ))}
            </div>

            <p
              className="text-center text-sm mt-8"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              <Link href="/preise" className="underline hover:opacity-80">
                Alle Funktionen vergleichen &rarr;
              </Link>
            </p>
          </div>
        </section>

        {/* ============================================================
            Open Source
            ============================================================ */}
        <section
          className="py-20"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
          <div className="mx-auto max-w-6xl px-6 text-center">
            <h2
              className="text-3xl font-bold tracking-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              100 % Open Source
            </h2>
            <p
              className="mt-4 text-base max-w-xl mx-auto leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              RechnungsWerk ist unter der AGPL-3.0-Lizenz verfuegbar.
              Lesen Sie den Code, betreiben Sie eine eigene Instanz, oder tragen Sie bei.
              Transparenz ist kein Feature — sie ist das Fundament.
            </p>
            <div className="mt-8">
              <a
                href="https://github.com/sadanakb/rechnungswerk"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold border transition-colors"
                style={{
                  borderColor: 'rgb(var(--border-strong))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                Quellcode auf GitHub
              </a>
            </div>
          </div>
        </section>

        {/* ============================================================
            Final CTA
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <h2
              className="text-3xl font-bold tracking-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Bereit fuer die E-Rechnungspflicht?
            </h2>
            <p
              className="mt-4 text-base max-w-lg mx-auto"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Erstellen Sie in unter 30 Sekunden Ihre erste XRechnung. Kostenlos, ohne Kreditkarte.
            </p>
            <div className="mt-8">
              <Link
                href="/register"
                className="inline-block rounded-lg px-8 py-3.5 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
                style={{
                  backgroundColor: 'rgb(var(--primary))',
                  color: 'rgb(var(--primary-foreground))',
                }}
              >
                Jetzt kostenlos starten
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'RechnungsWerk',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: [
              { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Starter', price: '9.90', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Professional', price: '19.90', priceCurrency: 'EUR' },
            ],
          }),
        }}
      />
    </>
  )
}
