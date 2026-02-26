import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Preise — RechnungsWerk | E-Rechnungen ab 0 EUR',
  description:
    'RechnungsWerk Preise: Kostenlos starten mit 5 Rechnungen/Monat. Starter ab 9,90 EUR. Professional ab 19,90 EUR. XRechnung, ZUGFeRD, DATEV-Export.',
  openGraph: {
    title: 'Preise — RechnungsWerk',
    description: 'E-Rechnungen ab 0 EUR/Monat. XRechnung & ZUGFeRD konform.',
    type: 'website',
    locale: 'de_DE',
  },
}

/* -----------------------------------------------------------------------
   Pricing tiers
   ----------------------------------------------------------------------- */
interface PricingFeature {
  text: string
  included: boolean
}

interface PricingTier {
  name: string
  price: string
  unit: string
  description: string
  highlight: boolean
  cta: string
  ctaHref: string
  features: PricingFeature[]
}

const tiers: PricingTier[] = [
  {
    name: 'Free',
    price: '0',
    unit: 'EUR / Monat',
    description: 'Fuer Freiberufler und Kleinunternehmer zum Einstieg.',
    highlight: false,
    cta: 'Kostenlos starten',
    ctaHref: '/register',
    features: [
      { text: '5 Rechnungen pro Monat', included: true },
      { text: 'XRechnung 3.0.2 Export', included: true },
      { text: 'ZUGFeRD 2.3.3 Export', included: true },
      { text: 'OCR-Erkennung', included: true },
      { text: '10 Kontakte', included: true },
      { text: 'EN 16931 Validierung', included: true },
      { text: 'DATEV-Export', included: false },
      { text: 'Mahnwesen', included: false },
      { text: 'API-Zugang', included: false },
      { text: 'Banking-Integration', included: false },
      { text: 'Team-Verwaltung', included: false },
    ],
  },
  {
    name: 'Starter',
    price: '9,90',
    unit: 'EUR / Monat',
    description: 'Fuer wachsende Unternehmen mit regelmaessigem Rechnungsaufkommen.',
    highlight: true,
    cta: 'Jetzt starten',
    ctaHref: '/register',
    features: [
      { text: 'Unbegrenzte Rechnungen', included: true },
      { text: 'XRechnung 3.0.2 Export', included: true },
      { text: 'ZUGFeRD 2.3.3 Export', included: true },
      { text: 'OCR-Erkennung', included: true },
      { text: 'Unbegrenzte Kontakte', included: true },
      { text: 'EN 16931 Validierung', included: true },
      { text: 'DATEV-Export', included: true },
      { text: 'Mahnwesen', included: true },
      { text: 'API-Zugang', included: true },
      { text: 'Banking-Integration', included: false },
      { text: 'Team-Verwaltung', included: false },
    ],
  },
  {
    name: 'Professional',
    price: '19,90',
    unit: 'EUR / Monat',
    description: 'Fuer Teams und Unternehmen mit erweiterten Anforderungen.',
    highlight: false,
    cta: 'Professional waehlen',
    ctaHref: '/register',
    features: [
      { text: 'Unbegrenzte Rechnungen', included: true },
      { text: 'XRechnung 3.0.2 Export', included: true },
      { text: 'ZUGFeRD 2.3.3 Export', included: true },
      { text: 'OCR-Erkennung', included: true },
      { text: 'Unbegrenzte Kontakte', included: true },
      { text: 'EN 16931 Validierung', included: true },
      { text: 'DATEV-Export', included: true },
      { text: 'Mahnwesen', included: true },
      { text: 'API-Zugang', included: true },
      { text: 'Banking-Integration', included: true },
      { text: 'Team-Verwaltung (bis 5 Nutzer)', included: true },
      { text: 'UStVA-Voranmeldung', included: true },
      { text: 'Prioritaets-Support', included: true },
    ],
  },
]

/* -----------------------------------------------------------------------
   FAQ
   ----------------------------------------------------------------------- */
const faqs = [
  {
    question: 'Kann ich RechnungsWerk kostenlos nutzen?',
    answer:
      'Ja. Der Free-Plan erlaubt 5 Rechnungen pro Monat mit vollem XRechnung- und ZUGFeRD-Support. Keine Kreditkarte erforderlich.',
  },
  {
    question: 'Was ist der Unterschied zwischen XRechnung und ZUGFeRD?',
    answer:
      'XRechnung ist ein reines XML-Format (UBL), das fuer oeffentliche Auftraggeber vorgeschrieben ist. ZUGFeRD kombiniert eine menschenlesbare PDF mit eingebetteten XML-Daten. RechnungsWerk unterstuetzt beide Formate.',
  },
  {
    question: 'Bin ich von der E-Rechnungspflicht betroffen?',
    answer:
      'Seit dem 01.01.2025 muessen alle B2B-Unternehmen in Deutschland E-Rechnungen empfangen koennen. Ab 2027 bzw. 2028 wird auch das Senden schrittweise zur Pflicht.',
  },
  {
    question: 'Kann ich jederzeit upgraden oder kuendigen?',
    answer:
      'Ja. Sie koennen jederzeit zwischen den Plaenen wechseln. Kuendigungen sind zum Monatsende moeglich, ohne Mindestlaufzeit.',
  },
  {
    question: 'Ist RechnungsWerk GoBD-konform?',
    answer:
      'Ja. RechnungsWerk speichert Rechnungen revisionssicher und unterstuetzt den DATEV-Export fuer die Zusammenarbeit mit Ihrem Steuerberater.',
  },
  {
    question: 'Kann ich RechnungsWerk selbst hosten?',
    answer:
      'Ja. RechnungsWerk ist Open Source (AGPL-3.0). Sie koennen den Quellcode auf GitHub einsehen und eine eigene Instanz betreiben.',
  },
]

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default function PreisePage() {
  return (
    <>
      <main>
        {/* ============================================================
            Header
            ============================================================ */}
        <section className="pt-20 pb-12">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <h1
              className="text-4xl sm:text-5xl font-extrabold tracking-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Einfache, faire Preise
            </h1>
            <p
              className="mt-4 text-lg max-w-xl mx-auto"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Starten Sie kostenlos. Keine versteckten Kosten. Upgraden Sie, wenn Ihr Geschaeft waechst.
            </p>
          </div>
        </section>

        {/* ============================================================
            Pricing cards
            ============================================================ */}
        <section className="pb-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className="rounded-xl border p-6 flex flex-col relative"
                  style={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: tier.highlight ? 'rgb(var(--primary))' : 'rgb(var(--border))',
                    borderWidth: tier.highlight ? '2px' : '1px',
                  }}
                >
                  {tier.highlight && (
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: 'rgb(var(--primary))',
                        color: 'rgb(var(--primary-foreground))',
                      }}
                    >
                      Empfohlen
                    </span>
                  )}

                  <h2
                    className="text-xl font-bold mt-2"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {tier.name}
                  </h2>
                  <p
                    className="text-sm mt-1"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    {tier.description}
                  </p>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span
                      className="text-4xl font-extrabold"
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

                  <Link
                    href={tier.ctaHref}
                    className="mt-6 block rounded-lg px-4 py-3 text-center text-sm font-semibold transition-shadow"
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
                    {tier.cta}
                  </Link>

                  <ul className="mt-8 space-y-3 flex-1">
                    {tier.features.map((f) => (
                      <li
                        key={f.text}
                        className="flex items-start gap-2.5 text-sm"
                        style={{
                          color: f.included
                            ? 'rgb(var(--foreground))'
                            : 'rgb(var(--foreground-muted))',
                          opacity: f.included ? 1 : 0.5,
                        }}
                      >
                        <span
                          className="mt-0.5 shrink-0 text-xs"
                          style={{
                            color: f.included ? 'rgb(var(--primary))' : 'rgb(var(--foreground-muted))',
                          }}
                        >
                          {f.included ? '\u2713' : '\u2717'}
                        </span>
                        {f.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p
              className="text-center text-xs mt-8"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Alle Preise zzgl. MwSt. Monatliche Abrechnung. Jederzeit kuendbar.
            </p>
          </div>
        </section>

        {/* ============================================================
            Self-hosting note
            ============================================================ */}
        <section
          className="py-12"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-xl font-bold"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Lieber selbst hosten?
            </h2>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              RechnungsWerk ist Open Source (AGPL-3.0). Betreiben Sie Ihre eigene Instanz
              mit vollem Funktionsumfang — kostenlos und ohne Einschraenkungen.
            </p>
            <div className="mt-6">
              <a
                href="https://github.com/sadanakb/rechnungswerk"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold border transition-colors"
                style={{
                  borderColor: 'rgb(var(--border-strong))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                <svg
                  className="w-4 h-4"
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
                Auf GitHub ansehen
              </a>
            </div>
          </div>
        </section>

        {/* ============================================================
            FAQ
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6">
            <h2
              className="text-3xl font-bold tracking-tight text-center mb-12"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Haeufig gestellte Fragen
            </h2>

            <dl className="space-y-6">
              {faqs.map((faq) => (
                <div
                  key={faq.question}
                  className="rounded-xl border p-5"
                  style={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <dt
                    className="text-sm font-semibold"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {faq.question}
                  </dt>
                  <dd
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    {faq.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ============================================================
            CTA
            ============================================================ */}
        <section className="pb-20">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <h2
              className="text-2xl font-bold"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Bereit fuer konforme E-Rechnungen?
            </h2>
            <p
              className="mt-3 text-sm"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Starten Sie jetzt kostenlos — keine Kreditkarte erforderlich.
            </p>
            <div className="mt-6">
              <Link
                href="/register"
                className="inline-block rounded-lg px-8 py-3.5 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
                style={{
                  backgroundColor: 'rgb(var(--primary))',
                  color: 'rgb(var(--primary-foreground))',
                }}
              >
                Kostenlos starten
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* FAQPage JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }),
        }}
      />
    </>
  )
}
