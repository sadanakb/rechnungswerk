import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { industries, getIndustryBySlug } from '../../../../data/pseo/industries'

/* -----------------------------------------------------------------------
   Static params — generates all 10 industry pages at build time
   ----------------------------------------------------------------------- */
export function generateStaticParams() {
  return industries.map((industry) => ({
    branche: industry.slug,
  }))
}

/* -----------------------------------------------------------------------
   Metadata
   ----------------------------------------------------------------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ branche: string }>
}): Promise<Metadata> {
  const { branche } = await params
  const industry = getIndustryBySlug(branche)
  if (!industry) return {}

  return {
    title: `E-Rechnung fuer ${industry.name} | RechnungsWerk`,
    description: `E-Rechnungen fuer ${industry.name}: XRechnung & ZUGFeRD konform erstellen. ${industry.invoiceVolume}. GoBD-konform, DATEV-Export, Open Source.`,
    openGraph: {
      title: `E-Rechnung fuer ${industry.name} | RechnungsWerk`,
      description: `Konforme E-Rechnungen fuer ${industry.name}. XRechnung 3.0.2, ZUGFeRD 2.3.3, DATEV-Export.`,
      type: 'website',
      locale: 'de_DE',
    },
  }
}

/* -----------------------------------------------------------------------
   FAQ data per industry
   ----------------------------------------------------------------------- */
interface FAQ {
  question: string
  answer: string
}

function getIndustryFAQs(slug: string, name: string): FAQ[] {
  const baseFAQs: FAQ[] = [
    {
      question: `Ist RechnungsWerk fuer ${name} geeignet?`,
      answer: `Ja. RechnungsWerk wurde speziell fuer die Anforderungen verschiedener Branchen entwickelt, darunter ${name}. Alle E-Rechnungen entsprechen den Standards XRechnung 3.0.2 und ZUGFeRD 2.3.3 und sind somit konform mit der EN 16931.`,
    },
    {
      question: `Wie schnell kann ich als ${name}-Unternehmen starten?`,
      answer:
        'Die Einrichtung dauert weniger als 5 Minuten. Registrieren Sie sich kostenlos, geben Sie Ihre Unternehmensdaten ein und erstellen Sie sofort Ihre erste E-Rechnung. Keine Installation, keine Schulung erforderlich.',
    },
    {
      question: `Kann ich bestehende Rechnungen importieren?`,
      answer:
        'Ja. Mit der integrierten OCR-Erkennung koennen Sie PDF-Rechnungen einlesen und automatisch in strukturierte Daten umwandeln. So digitalisieren Sie Ihren bestehenden Rechnungsbestand in kuerzester Zeit.',
    },
  ]

  const industrySpecificFAQs: Record<string, FAQ> = {
    handwerk: {
      question: 'Unterstuetzt RechnungsWerk Abschlagsrechnungen nach VOB?',
      answer:
        'Ja. RechnungsWerk bildet Abschlagsrechnungen und Schlussrechnungen korrekt ab und verknuepft diese miteinander. Bei oeffentlichen Auftraegen wird die XRechnung automatisch mit der korrekten Leitweg-ID erstellt.',
    },
    'it-dienstleister': {
      question: 'Wie funktioniert Reverse Charge mit RechnungsWerk?',
      answer:
        'RechnungsWerk erkennt automatisch, wenn ein Geschaeftspartner in einem anderen EU-Land ansaessig ist, und wendet das Reverse-Charge-Verfahren nach § 13b UStG korrekt an. Der entsprechende Hinweis wird automatisch auf der Rechnung vermerkt.',
    },
    gastronomie: {
      question: 'Ist RechnungsWerk mit meinem Kassensystem kompatibel?',
      answer:
        'RechnungsWerk bietet eine REST-API, ueber die Kassensysteme Rechnungsdaten automatisch uebermitteln koennen. Die TSE-Anbindung erfolgt ueber Ihr bestehendes Kassensystem — RechnungsWerk uebernimmt die konforme E-Rechnungserstellung.',
    },
    einzelhandel: {
      question: 'Kann RechnungsWerk hohe Rechnungsvolumina verarbeiten?',
      answer:
        'Ja. Mit der API-Schnittstelle koennen Sie tausende Rechnungen automatisiert erstellen. Der Starter-Plan bietet bereits unbegrenzte Rechnungen, ideal fuer den Einzelhandel mit hohem Volumen.',
    },
    freiberufler: {
      question: 'Was kostet RechnungsWerk fuer Freiberufler?',
      answer:
        'Freiberufler koennen den kostenlosen Free-Plan nutzen, der 5 Rechnungen pro Monat umfasst — inklusive XRechnung und ZUGFeRD. Fuer ein hoeheres Volumen bietet der Starter-Plan ab 9,90 EUR/Monat unbegrenzte Rechnungen.',
    },
    immobilien: {
      question: 'Kann ich wiederkehrende Mieterrechnungen automatisieren?',
      answer:
        'Ja. RechnungsWerk erstellt wiederkehrende Rechnungen automatisch und versendet diese zum gewuenschten Zeitpunkt. Ideal fuer monatliche Mieterrechnungen und jaehrliche Nebenkostenabrechnungen.',
    },
    logistik: {
      question: 'Unterstuetzt RechnungsWerk internationale Rechnungen?',
      answer:
        'Ja. RechnungsWerk unterstuetzt Waehrungsumrechnung, laenderspezifische MwSt.-Saetze und das Reverse-Charge-Verfahren fuer EU-Geschaefte. Rechnungen koennen in mehreren Sprachen erstellt werden.',
    },
    gesundheitswesen: {
      question: 'Werden Patientendaten DSGVO-konform gespeichert?',
      answer:
        'Ja. RechnungsWerk speichert alle Daten DSGVO-konform auf Servern in Deutschland. Die Verarbeitung von Gesundheitsdaten erfolgt unter Einhaltung aller datenschutzrechtlichen Anforderungen nach Art. 9 DSGVO.',
    },
    beratung: {
      question: 'Kann ich Reisekosten auf Projektrechnungen ausweisen?',
      answer:
        'Ja. RechnungsWerk ermoeglicht die detaillierte Aufstellung von Reisekosten innerhalb einer Projektrechnung, inklusive steuerfreier Pauschalen nach Reisekostenrecht.',
    },
    'e-commerce': {
      question: 'Gibt es eine Integration fuer Shopify oder WooCommerce?',
      answer:
        'RechnungsWerk bietet eine REST-API, ueber die Shop-Systeme wie Shopify und WooCommerce Rechnungen automatisch erstellen koennen. So werden bei jeder Bestellung konforme E-Rechnungen generiert.',
    },
  }

  const specific = industrySpecificFAQs[slug]
  if (specific) {
    return [specific, ...baseFAQs]
  }
  return baseFAQs
}

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default async function IndustryPage({
  params,
}: {
  params: Promise<{ branche: string }>
}) {
  const { branche } = await params
  const industry = getIndustryBySlug(branche)
  if (!industry) notFound()

  const faqs = getIndustryFAQs(industry.slug, industry.name)

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
              E-Rechnung fuer {industry.name}
            </p>

            <h1
              className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              E-Rechnung fuer{' '}
              <span style={{ color: 'rgb(var(--primary))' }}>{industry.name}</span>
            </h1>

            <p
              className="mt-6 text-lg max-w-3xl mx-auto leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              {industry.description}
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
            Volume & Regulations bar
            ============================================================ */}
        <section className="border-y" style={{ borderColor: 'rgb(var(--border))' }}>
          <div className="mx-auto max-w-6xl px-6 py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-center">
              <div>
                <p
                  className="text-sm font-bold"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Typisches Rechnungsvolumen
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {industry.invoiceVolume}
                </p>
              </div>
              <div>
                <p
                  className="text-sm font-bold"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Relevante Vorschriften
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {industry.regulations.join(' | ')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            Challenges
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Herausforderungen im {industry.name}
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Diese typischen Probleme bei der Rechnungsstellung loest RechnungsWerk fuer Sie.
              </p>
            </div>

            <div className="space-y-4">
              {industry.challenges.map((challenge, index) => (
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
                      backgroundColor: 'rgb(var(--muted))',
                      color: 'rgb(var(--foreground))',
                    }}
                  >
                    !
                  </span>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {challenge}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Benefits
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
                So hilft RechnungsWerk im {industry.name}
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Konforme E-Rechnungen, automatisierte Prozesse, weniger Aufwand.
              </p>
            </div>

            <div className="space-y-4">
              {industry.benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 rounded-xl border p-5"
                  style={{
                    backgroundColor: 'rgb(var(--background))',
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
                    &#10003;
                  </span>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {benefit}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Regulations detail
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Regulatorische Anforderungen
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Diese Vorschriften sind fuer {industry.name} besonders relevant.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {industry.regulations.map((regulation, index) => (
                <div
                  key={index}
                  className="rounded-xl border p-6"
                  style={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <div
                    className="flex items-center gap-2 mb-3"
                  >
                    <span
                      className="shrink-0 flex items-center justify-center w-6 h-6 rounded text-xs font-bold"
                      style={{
                        backgroundColor: 'rgb(var(--primary-light))',
                        color: 'rgb(var(--primary))',
                      }}
                    >
                      {index + 1}
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'rgb(var(--foreground))' }}
                    >
                      Vorschrift {index + 1}
                    </span>
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    {regulation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            FAQ
            ============================================================ */}
        <section
          className="py-20"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
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
                    backgroundColor: 'rgb(var(--background))',
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
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <h2
              className="text-3xl font-bold tracking-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Bereit fuer konforme E-Rechnungen im {industry.name}?
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
            description: `E-Rechnungssoftware fuer ${industry.name}. XRechnung 3.0.2 und ZUGFeRD 2.3.3 konform.`,
            offers: [
              { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Starter', price: '9.90', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Professional', price: '19.90', priceCurrency: 'EUR' },
            ],
            audience: {
              '@type': 'BusinessAudience',
              audienceType: industry.name,
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
