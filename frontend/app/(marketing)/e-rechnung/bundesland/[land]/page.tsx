import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { bundeslaender, getBundeslandBySlug } from '../../../../../data/pseo/bundeslaender'

/* -----------------------------------------------------------------------
   Static params — generates all 16 Bundesland pages at build time
   ----------------------------------------------------------------------- */
export function generateStaticParams() {
  return bundeslaender.map((land) => ({
    land: land.slug,
  }))
}

/* -----------------------------------------------------------------------
   Metadata
   ----------------------------------------------------------------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ land: string }>
}): Promise<Metadata> {
  const { land } = await params
  const bundesland = getBundeslandBySlug(land)
  if (!bundesland) return {}

  return {
    title: `E-Rechnung in ${bundesland.name} | RechnungsWerk`,
    description: `E-Rechnungen fuer ${bundesland.businesses} in ${bundesland.name}. XRechnung & ZUGFeRD konform. ${bundesland.ihk}. GoBD-konform, DATEV-Export.`,
    openGraph: {
      title: `E-Rechnung in ${bundesland.name} | RechnungsWerk`,
      description: `Konforme E-Rechnungen fuer Unternehmen in ${bundesland.name}. XRechnung 3.0.2, ZUGFeRD 2.3.3.`,
      type: 'website',
      locale: 'de_DE',
    },
  }
}

/* -----------------------------------------------------------------------
   FAQ data per Bundesland
   ----------------------------------------------------------------------- */
interface FAQ {
  question: string
  answer: string
}

function getBundeslandFAQs(name: string, ihk: string): FAQ[] {
  return [
    {
      question: `Gilt die E-Rechnungspflicht auch in ${name}?`,
      answer: `Ja. Die E-Rechnungspflicht im B2B-Bereich gilt bundesweit seit dem 01.01.2025 (Empfangspflicht). Darueber hinaus hat ${name} eigene Regelungen fuer Rechnungen an Landesbehoerden, die bereits seit 2020 gelten.`,
    },
    {
      question: `Welche IHK ist fuer Unternehmen in ${name} zustaendig?`,
      answer: `Die zustaendige IHK ist die ${ihk}. Diese bietet Informationsveranstaltungen und Beratung zur E-Rechnungspflicht und Digitalisierung fuer Unternehmen in ${name}.`,
    },
    {
      question: `Wie kann ich als Unternehmen in ${name} mit RechnungsWerk starten?`,
      answer:
        'Registrieren Sie sich kostenlos auf RechnungsWerk, geben Sie Ihre Unternehmensdaten ein und erstellen Sie sofort Ihre erste E-Rechnung. Der Free-Plan umfasst 5 Rechnungen pro Monat — ideal zum Testen.',
    },
    {
      question: `Gibt es Foerderungen fuer die Digitalisierung in ${name}?`,
      answer: `Ja. ${name} bietet verschiedene Foerderprogramme fuer die Digitalisierung von KMU. Informieren Sie sich bei Ihrer IHK oder der Landesfoerderbank ueber aktuelle Programme. RechnungsWerk ist als Cloud-Loesung oder Open-Source-Selbsthosting sofort einsatzbereit.`,
    },
  ]
}

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default async function BundeslandPage({
  params,
}: {
  params: Promise<{ land: string }>
}) {
  const { land } = await params
  const bundesland = getBundeslandBySlug(land)
  if (!bundesland) notFound()

  const faqs = getBundeslandFAQs(bundesland.name, bundesland.ihk)

  return (
    <>
      <main>
        {/* ============================================================
            Hero
            ============================================================ */}
        <section className="pt-20 pb-16">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p
              className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold mb-6"
              style={{
                backgroundColor: 'rgb(var(--primary-light))',
                color: 'rgb(var(--primary))',
                border: '1px solid rgb(var(--primary-border))',
              }}
            >
              E-Rechnung in {bundesland.name}
            </p>

            <h1
              className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              E-Rechnung in{' '}
              <span style={{ color: 'rgb(var(--primary))' }}>{bundesland.name}</span>
            </h1>

            <p
              className="mt-6 text-lg max-w-3xl mx-auto leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              {bundesland.description}
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
              <Link
                href="/preise"
                className="rounded-lg px-8 py-3.5 text-base font-semibold border transition-colors"
                style={{
                  borderColor: 'rgb(var(--border-strong))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                Preise ansehen
              </Link>
            </div>
          </div>
        </section>

        {/* ============================================================
            Key facts bar
            ============================================================ */}
        <section className="border-y" style={{ borderColor: 'rgb(var(--border))' }}>
          <div className="mx-auto max-w-6xl px-6 py-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <p
                  className="text-sm font-bold"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Unternehmen
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {bundesland.businesses}
                </p>
              </div>
              <div>
                <p
                  className="text-sm font-bold"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Zustaendige IHK
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {bundesland.ihk}
                </p>
              </div>
              <div>
                <p
                  className="text-sm font-bold"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  E-Rechnungspflicht
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Aktiv seit 2025 (B2B-Empfang)
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            Special rules
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Besondere Regelungen in {bundesland.name}
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Neben der bundesweiten E-Rechnungspflicht gelten in {bundesland.name} folgende
                landesspezifische Regelungen.
              </p>
            </div>

            <div className="space-y-4">
              {bundesland.specialRules.map((rule, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 rounded-xl border p-5"
                  style={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <span
                    className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold"
                    style={{
                      backgroundColor: 'rgb(var(--primary))',
                      color: 'rgb(var(--primary-foreground))',
                    }}
                  >
                    {index + 1}
                  </span>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {rule}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Why RechnungsWerk
            ============================================================ */}
        <section
          className="py-20"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Warum RechnungsWerk fuer {bundesland.name}?
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Die E-Rechnungsloesung, die alle Anforderungen erfuellt.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                {
                  title: 'XRechnung 3.0.2',
                  text: 'Konformer UBL-XML-Export fuer oeffentliche Auftraggeber — inklusive Leitweg-ID.',
                },
                {
                  title: 'ZUGFeRD 2.3.3',
                  text: 'Hybrid-PDF mit eingebetteten XML-Daten fuer die einfache Weiterverarbeitung.',
                },
                {
                  title: 'DATEV-Export',
                  text: 'Nahtlose Zusammenarbeit mit Ihrem Steuerberater durch standardisierten DATEV-Export.',
                },
                {
                  title: 'GoBD-konform',
                  text: 'Revisionssichere Speicherung und lueckenlose Dokumentation aller Rechnungsprozesse.',
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border p-6"
                  style={{
                    backgroundColor: 'rgb(var(--background))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <h3
                    className="text-lg font-semibold"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    {feature.text}
                  </p>
                </div>
              ))}
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
              className="text-3xl font-bold tracking-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Starten Sie mit E-Rechnungen in {bundesland.name}
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

      {/* JSON-LD SoftwareApplication schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'RechnungsWerk',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description: `E-Rechnungssoftware fuer Unternehmen in ${bundesland.name}. XRechnung 3.0.2 und ZUGFeRD 2.3.3 konform.`,
            offers: [
              { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Starter', price: '9.90', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Professional', price: '19.90', priceCurrency: 'EUR' },
            ],
            areaServed: {
              '@type': 'AdministrativeArea',
              name: bundesland.name,
              containedInPlace: {
                '@type': 'Country',
                name: 'Deutschland',
              },
            },
          }),
        }}
      />

      {/* JSON-LD FAQPage schema */}
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
