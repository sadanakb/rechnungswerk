import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { comparisons, getComparisonBySlug } from '../../../../data/pseo/comparisons'

/* -----------------------------------------------------------------------
   Feature label mapping (internal key → German display name)
   ----------------------------------------------------------------------- */
const featureLabels: Record<string, string> = {
  xrechnung: 'XRechnung',
  zugferd: 'ZUGFeRD',
  ocr: 'OCR-Erkennung',
  datev_export: 'DATEV-Export',
  open_source: 'Open Source',
  self_hosted: 'Self-Hosting',
  api_access: 'API-Zugang',
  mahnwesen: 'Mahnwesen',
  ki_kategorisierung: 'KI-Kategorisierung',
  gobd_report: 'GoBD-Report',
}

/* -----------------------------------------------------------------------
   Static params — generates all 5 comparison pages at build time
   ----------------------------------------------------------------------- */
export function generateStaticParams() {
  return comparisons.map((comparison) => ({
    tool: comparison.slug,
  }))
}

/* -----------------------------------------------------------------------
   Metadata
   ----------------------------------------------------------------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>
}): Promise<Metadata> {
  const { tool } = await params
  const comparison = getComparisonBySlug(tool)
  if (!comparison) return {}

  return {
    title: `RechnungsWerk vs ${comparison.name} — E-Rechnungssoftware Vergleich`,
    description: `Vergleich: RechnungsWerk vs ${comparison.name}. Open Source, Self-Hosting, XRechnung 3.0.2 & ZUGFeRD 2.3.3. Entdecken Sie die bessere Alternative zu ${comparison.name}.`,
    openGraph: {
      title: `RechnungsWerk vs ${comparison.name} — E-Rechnungssoftware Vergleich`,
      description: `Detaillierter Funktionsvergleich: RechnungsWerk vs ${comparison.name}. Finden Sie die passende E-Rechnungsloesung.`,
      type: 'website',
      locale: 'de_DE',
    },
  }
}

/* -----------------------------------------------------------------------
   Helper: render feature cell value
   ----------------------------------------------------------------------- */
function FeatureValue({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold"
        style={{
          backgroundColor: 'rgb(var(--primary-light))',
          color: 'rgb(var(--primary))',
        }}
      >
        &#10003;
      </span>
    )
  }
  if (value === false) {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold"
        style={{
          backgroundColor: 'rgb(var(--muted))',
          color: 'rgb(var(--foreground-muted))',
        }}
      >
        &#10007;
      </span>
    )
  }
  return (
    <span
      className="text-sm font-medium"
      style={{ color: 'rgb(var(--foreground))' }}
    >
      {value}
    </span>
  )
}

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ tool: string }>
}) {
  const { tool } = await params
  const comparison = getComparisonBySlug(tool)
  if (!comparison) notFound()

  const featureKeys = Object.keys(comparison.features)

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
              Vergleich
            </p>

            <h1
              className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              <span style={{ color: 'rgb(var(--primary))' }}>{comparison.name}</span>{' '}
              Alternative: RechnungsWerk
            </h1>

            <p
              className="mt-6 text-lg max-w-3xl mx-auto leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              {comparison.name} — {comparison.tagline} ({comparison.pricing}).
              Entdecken Sie, warum RechnungsWerk die moderne Open-Source-Alternative ist.
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
            Feature comparison table
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Funktionsvergleich
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                RechnungsWerk vs {comparison.name} — Feature fuer Feature im direkten Vergleich.
              </p>
            </div>

            <div
              className="rounded-xl border overflow-hidden"
              style={{
                backgroundColor: 'rgb(var(--card))',
                borderColor: 'rgb(var(--border))',
              }}
            >
              {/* Table header */}
              <div
                className="grid grid-cols-3 gap-4 px-6 py-4 border-b"
                style={{
                  borderColor: 'rgb(var(--border))',
                  backgroundColor: 'rgb(var(--muted))',
                }}
              >
                <div
                  className="text-sm font-semibold"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Funktion
                </div>
                <div
                  className="text-sm font-semibold text-center"
                  style={{ color: 'rgb(var(--primary))' }}
                >
                  RechnungsWerk
                </div>
                <div
                  className="text-sm font-semibold text-center"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {comparison.name}
                </div>
              </div>

              {/* Table rows */}
              {featureKeys.map((key, index) => (
                <div
                  key={key}
                  className="grid grid-cols-3 gap-4 px-6 py-4 border-b last:border-b-0"
                  style={{
                    borderColor: 'rgb(var(--border))',
                    backgroundColor:
                      index % 2 === 0
                        ? 'rgb(var(--card))'
                        : 'rgb(var(--background))',
                  }}
                >
                  <div
                    className="text-sm font-medium"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {featureLabels[key] || key}
                  </div>
                  <div className="text-center">
                    <FeatureValue value={comparison.features[key].rw} />
                  </div>
                  <div className="text-center">
                    <FeatureValue value={comparison.features[key].competitor} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Pricing comparison
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
                Preisvergleich
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* RechnungsWerk pricing */}
              <div
                className="rounded-xl border p-8"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--primary))',
                  borderWidth: '2px',
                }}
              >
                <h3
                  className="text-lg font-bold mb-2"
                  style={{ color: 'rgb(var(--primary))' }}
                >
                  RechnungsWerk
                </h3>
                <p
                  className="text-3xl font-extrabold mb-1"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  0 EUR
                </p>
                <p
                  className="text-sm mb-6"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Free-Plan mit 5 Rechnungen/Monat
                </p>
                <ul className="space-y-3">
                  {[
                    'XRechnung & ZUGFeRD inklusive',
                    'Open Source (AGPL)',
                    'Self-Hosting moeglich',
                    'Starter ab 9,90 EUR/Monat',
                    'Professional ab 19,90 EUR/Monat',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span
                        className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold mt-0.5"
                        style={{
                          backgroundColor: 'rgb(var(--primary))',
                          color: 'rgb(var(--primary-foreground))',
                        }}
                      >
                        &#10003;
                      </span>
                      <span
                        className="text-sm"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Competitor pricing */}
              <div
                className="rounded-xl border p-8"
                style={{
                  backgroundColor: 'rgb(var(--background))',
                  borderColor: 'rgb(var(--border))',
                }}
              >
                <h3
                  className="text-lg font-bold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  {comparison.name}
                </h3>
                <p
                  className="text-3xl font-extrabold mb-1"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  {comparison.pricing}
                </p>
                <p
                  className="text-sm mb-6"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {comparison.tagline}
                </p>
                <ul className="space-y-3">
                  {[
                    'Kein kostenloser Plan verfuegbar',
                    'Kein Open-Source-Code',
                    'Kein Self-Hosting',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span
                        className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold mt-0.5"
                        style={{
                          backgroundColor: 'rgb(var(--muted))',
                          color: 'rgb(var(--foreground-muted))',
                        }}
                      >
                        &#10007;
                      </span>
                      <span
                        className="text-sm"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            RechnungsWerk advantages
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold tracking-tight"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Warum RechnungsWerk statt {comparison.name}?
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Diese Vorteile bietet Ihnen RechnungsWerk gegenueber {comparison.name}.
              </p>
            </div>

            <div className="space-y-4">
              {comparison.rwAdvantages.map((advantage, index) => (
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
                    &#10003;
                  </span>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {advantage}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Faire Bewertung — their advantages
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
                Faire Bewertung
              </h2>
              <p
                className="mt-3 text-base max-w-xl mx-auto"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Transparenz ist uns wichtig. Das macht {comparison.name} gut.
              </p>
            </div>

            <div className="space-y-4">
              {comparison.theirAdvantages.map((advantage, index) => (
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
                    {advantage}
                  </p>
                </div>
              ))}
            </div>
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
              Bereit fuer den Wechsel?
            </h2>
            <p
              className="mt-4 text-base max-w-lg mx-auto"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Testen Sie RechnungsWerk kostenlos. Keine Kreditkarte, keine Verpflichtung.
              Erstellen Sie Ihre erste E-Rechnung in unter 30 Sekunden.
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
                Kostenlos starten
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
            description: `E-Rechnungssoftware — Open-Source-Alternative zu ${comparison.name}. XRechnung 3.0.2 und ZUGFeRD 2.3.3 konform.`,
            offers: [
              { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Starter', price: '9.90', priceCurrency: 'EUR' },
              { '@type': 'Offer', name: 'Professional', price: '19.90', priceCurrency: 'EUR' },
            ],
            alternativeOf: {
              '@type': 'SoftwareApplication',
              name: comparison.name,
              description: comparison.tagline,
            },
          }),
        }}
      />
    </>
  )
}
