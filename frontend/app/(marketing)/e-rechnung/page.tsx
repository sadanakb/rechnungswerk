import type { Metadata } from 'next'
import Link from 'next/link'
import { FaqAccordion } from './FaqAccordion'

export const metadata: Metadata = {
  title: 'E-Rechnung Software 2025 | XRechnung & ZUGFeRD | RechnungsWerk',
  description:
    'E-Rechnungen erstellen, validieren und versenden. EN 16931 konform. XRechnung 3.0.2 und ZUGFeRD 2.3.3. Kostenlos testen.',
  openGraph: {
    title: 'E-Rechnung Software 2025 | XRechnung & ZUGFeRD | RechnungsWerk',
    description:
      'E-Rechnungen erstellen, validieren und versenden. EN 16931 konform. Kostenlos testen.',
    type: 'website',
    locale: 'de_DE',
  },
}

/* -----------------------------------------------------------------------
   Timeline milestones
   ----------------------------------------------------------------------- */
const milestones = [
  {
    date: 'Ab 01.01.2025',
    label: 'Empfangspflicht',
    description:
      'Alle Unternehmen müssen E-Rechnungen empfangen und verarbeiten können. Gilt für alle inländischen B2B-Umsätze.',
    past: true,
  },
  {
    date: 'Ab 01.01.2027',
    label: 'Sendepflicht (Großunternehmen)',
    description:
      'Unternehmen mit einem Vorjahresumsatz von mehr als 800.000 EUR müssen E-Rechnungen versenden.',
    past: false,
  },
  {
    date: 'Ab 01.01.2028',
    label: 'Sendepflicht (alle Unternehmen)',
    description:
      'Sendepflicht für alle Unternehmen im B2B-Bereich — unabhängig von Größe und Umsatz.',
    past: false,
  },
]

/* -----------------------------------------------------------------------
   Comparison table rows
   ----------------------------------------------------------------------- */
const comparisonRows = [
  {
    feature: 'XRechnung erstellen',
    rechnungswerk: 'Automatisch',
    manuell: 'Komplexe Vorlage nötig',
    rwOk: true,
  },
  {
    feature: 'ZUGFeRD PDF',
    rechnungswerk: 'Auf Klick',
    manuell: 'Nicht möglich',
    rwOk: true,
  },
  {
    feature: 'KoSIT-Validierung',
    rechnungswerk: 'Integriert',
    manuell: 'Separates Tool erforderlich',
    rwOk: true,
  },
  {
    feature: 'DATEV-Export',
    rechnungswerk: 'Ein Klick',
    manuell: 'Manueller Aufwand',
    rwOk: true,
  },
  {
    feature: 'GoBD-Archivierung',
    rechnungswerk: 'Automatisch',
    manuell: 'Eigene Lösung nötig',
    rwOk: true,
  },
  {
    feature: 'Mahnwesen',
    rechnungswerk: 'Integriert',
    manuell: 'Externes Tool',
    rwOk: true,
  },
]

/* -----------------------------------------------------------------------
   FAQ data
   ----------------------------------------------------------------------- */
const faqs = [
  {
    question: 'Was bedeutet die E-Rechnungspflicht für mein Unternehmen?',
    answer:
      'Seit dem 01.01.2025 sind alle deutschen Unternehmen im B2B-Bereich verpflichtet, elektronische Rechnungen nach EN 16931 empfangen zu können. Die Sendepflicht folgt schrittweise: ab 2027 für Großunternehmen (Umsatz > 800.000 EUR/Jahr), ab 2028 für alle. RechnungsWerk bereitet Sie auf alle Phasen vor.',
  },
  {
    question: 'Ist RechnungsWerk kostenlos?',
    answer:
      'Ja. Der Free-Plan erlaubt 5 Rechnungen pro Monat mit vollem XRechnung- und ZUGFeRD-Support — ohne Kreditkarte. Für unbegrenzte Rechnungen, DATEV-Export und Mahnwesen gibt es Starter ab 9,90 EUR/Monat.',
  },
  {
    question: 'Kann ich RechnungsWerk mit DATEV nutzen?',
    answer:
      'Ja. RechnungsWerk exportiert Buchungsdaten direkt im DATEV-Format (DATEV ASCII / Buchungsstapel). So können Sie alle Rechnungen problemlos an Ihren Steuerberater übergeben.',
  },
  {
    question: 'Was ist der Unterschied zwischen XRechnung und ZUGFeRD?',
    answer:
      'XRechnung ist ein reines XML-Format (UBL 2.1 / CII D16B) und das Pflichtformat für Rechnungen an Bundesbehörden. ZUGFeRD ist ein Hybridformat: eine normale PDF-Rechnung mit eingebettetem XML — ideal für B2B-Rechnungen, da sie sowohl menschenlesbar als auch maschinell verarbeitbar ist. RechnungsWerk unterstützt beide Formate.',
  },
  {
    question: 'Ist RechnungsWerk selbst hostbar?',
    answer:
      'Ja. RechnungsWerk ist vollständig Open Source unter AGPL-3.0. Den Quellcode finden Sie auf GitHub. Sie können eine eigene Instanz betreiben — mit vollem Funktionsumfang, ohne Lizenzkosten.',
  },
]

/* -----------------------------------------------------------------------
   Page component (Server Component)
   ----------------------------------------------------------------------- */
export default function ERechnungPage() {
  const faqJsonLd = {
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
  }

  return (
    <>
      <main>
        {/* ============================================================
            Section 1 — Hero
            ============================================================ */}
        <section className="pt-20 pb-16">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              E-Rechnung Software
              <br />
              für Deutschland
            </h1>
            <p
              className="mt-5 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              XRechnung &amp; ZUGFeRD erstellen, validieren und archivieren —
              EN&nbsp;16931 konform
            </p>

            {/* CTA buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
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
              <Link
                href="/dashboard"
                className="inline-block rounded-lg px-8 py-3.5 text-base font-semibold border transition-colors"
                style={{
                  borderColor: 'rgb(var(--border-strong))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                Demo ansehen
              </Link>
            </div>

            {/* Trust badges */}
            <div
              className="mt-10 flex flex-wrap justify-center gap-3"
              aria-label="Zertifizierungen und Standards"
            >
              {[
                'XRechnung 3.0.2',
                'ZUGFeRD 2.3.3',
                'EN 16931',
                'KoSIT validiert',
              ].map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border"
                  style={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: 'rgb(var(--border))',
                    color: 'rgb(var(--foreground))',
                  }}
                >
                  <span style={{ color: 'rgb(var(--primary))' }}>&#10003;</span>
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Section 2 — Timeline "E-Rechnungspflicht 2025–2028"
            ============================================================ */}
        <section
          className="py-16"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
          <div className="mx-auto max-w-5xl px-6">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-12"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              E-Rechnungspflicht 2025–2028
            </h2>

            {/* Desktop: horizontal timeline / Mobile: vertical */}
            <div className="relative">
              {/* Horizontal connector line (desktop only) */}
              <div
                className="hidden md:block absolute top-6 left-0 right-0 h-px"
                style={{ backgroundColor: 'rgb(var(--border))' }}
                aria-hidden="true"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
                {milestones.map((m, idx) => (
                  <div
                    key={m.date}
                    className="relative flex flex-col items-center text-center md:items-center"
                  >
                    {/* Vertical connector for mobile */}
                    {idx < milestones.length - 1 && (
                      <div
                        className="md:hidden absolute left-5 top-12 bottom-0 w-px"
                        style={{ backgroundColor: 'rgb(var(--border))' }}
                        aria-hidden="true"
                      />
                    )}

                    {/* Circle */}
                    <div
                      className="relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 font-bold text-sm shrink-0"
                      style={
                        m.past
                          ? {
                              backgroundColor: 'rgb(var(--primary))',
                              borderColor: 'rgb(var(--primary))',
                              color: 'rgb(var(--primary-foreground))',
                            }
                          : {
                              backgroundColor: 'rgb(var(--card))',
                              borderColor: 'rgb(var(--border-strong))',
                              color: 'rgb(var(--foreground-muted))',
                            }
                      }
                    >
                      {idx + 1}
                    </div>

                    {/* Content */}
                    <div className="mt-4">
                      <p
                        className="text-xs font-semibold uppercase tracking-widest"
                        style={{
                          color: m.past
                            ? 'rgb(var(--primary))'
                            : 'rgb(var(--foreground-muted))',
                        }}
                      >
                        {m.date}
                      </p>
                      <h3
                        className="mt-1 text-base font-bold"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        {m.label}
                      </h3>
                      <p
                        className="mt-2 text-sm leading-relaxed max-w-xs mx-auto"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        {m.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p
              className="mt-10 text-center text-xs"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Grundlage: Wachstumschancengesetz (BGBl. I 2024 Nr. 108) ·{' '}
              <a
                href="https://www.bundesfinanzministerium.de"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
              >
                BMF
              </a>
            </p>
          </div>
        </section>

        {/* ============================================================
            Section 3 — "Was ist eine E-Rechnung?"
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-12"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Was ist eine E-Rechnung?
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
              {/* Left: explainer */}
              <div>
                <p
                  className="text-base leading-relaxed"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Eine <strong style={{ color: 'rgb(var(--foreground))' }}>E-Rechnung</strong> ist
                  eine strukturierte, maschinenlesbare Rechnung nach dem europäischen Standard{' '}
                  <strong style={{ color: 'rgb(var(--foreground))' }}>EN&nbsp;16931</strong>. Im
                  Gegensatz zu einer PDF-Rechnung enthält sie strukturierte XML-Daten, die
                  automatisch verarbeitet werden können — ohne manuelles Abtippen.
                </p>
                <p
                  className="mt-4 text-base leading-relaxed"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Durch die Pflicht zur E-Rechnung im B2B-Bereich (ab 2025) schafft der
                  Gesetzgeber die Grundlage für ein späteres Meldeverfahren (Reporting) analog
                  zum italienischen SDI-System. Wer jetzt umstellt, ist langfristig vorbereitet.
                </p>
                <ul
                  className="mt-6 space-y-2 text-sm"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {[
                    'Strukturierte XML-Daten nach EN 16931',
                    'Automatische Verarbeitung ohne Medienbruch',
                    'GoBD-konforme Archivierung',
                    'Basis für künftige Meldesysteme',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 shrink-0 text-xs font-bold"
                        style={{ color: 'rgb(var(--primary))' }}
                      >
                        &#10003;
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right: format cards */}
              <div className="space-y-4">
                {/* XRechnung */}
                <div
                  className="rounded-xl border p-5"
                  style={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold"
                      style={{
                        backgroundColor: 'rgb(var(--primary) / 0.12)',
                        color: 'rgb(var(--primary))',
                      }}
                    >
                      XML
                    </span>
                    <h3
                      className="font-bold text-base"
                      style={{ color: 'rgb(var(--foreground))' }}
                    >
                      XRechnung
                    </h3>
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    Reines XML-Format (UBL 2.1 / CII D16B) — das{' '}
                    <strong style={{ color: 'rgb(var(--foreground))' }}>Pflichtformat</strong> für
                    Rechnungen an öffentliche Auftraggeber und Bundesbehörden (PEPPOL-Netzwerk).
                  </p>
                  <p
                    className="mt-2 text-xs font-medium"
                    style={{ color: 'rgb(var(--primary))' }}
                  >
                    Standard: XRechnung 3.0.2
                  </p>
                </div>

                {/* ZUGFeRD */}
                <div
                  className="rounded-xl border p-5"
                  style={{
                    backgroundColor: 'rgb(var(--card))',
                    borderColor: 'rgb(var(--border))',
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold"
                      style={{
                        backgroundColor: 'rgb(var(--primary) / 0.12)',
                        color: 'rgb(var(--primary))',
                      }}
                    >
                      PDF
                    </span>
                    <h3
                      className="font-bold text-base"
                      style={{ color: 'rgb(var(--foreground))' }}
                    >
                      ZUGFeRD
                    </h3>
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    <strong style={{ color: 'rgb(var(--foreground))' }}>Hybridformat</strong>: eine
                    normale PDF-Rechnung mit eingebettetem CII XML — ideal für B2B, da sowohl
                    menschenlesbar als auch automatisch verarbeitbar.
                  </p>
                  <p
                    className="mt-2 text-xs font-medium"
                    style={{ color: 'rgb(var(--primary))' }}
                  >
                    Standard: ZUGFeRD 2.3.3 (Profil EN 16931)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            Section 4 — Feature comparison table
            ============================================================ */}
        <section
          className="py-16"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
          <div className="mx-auto max-w-4xl px-6">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              RechnungsWerk vs. manuelle Prozesse
            </h2>

            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'rgb(var(--background))' }}>
                    <th
                      className="px-5 py-3.5 text-left font-semibold"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Funktion
                    </th>
                    <th
                      className="px-5 py-3.5 text-center font-semibold"
                      style={{ color: 'rgb(var(--primary))' }}
                    >
                      RechnungsWerk
                    </th>
                    <th
                      className="px-5 py-3.5 text-center font-semibold"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Manuell
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, idx) => (
                    <tr
                      key={row.feature}
                      style={{
                        backgroundColor:
                          idx % 2 === 0
                            ? 'rgb(var(--card))'
                            : 'rgb(var(--background))',
                        borderTop: '1px solid rgb(var(--border))',
                      }}
                    >
                      <td
                        className="px-5 py-3.5 font-medium"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        {row.feature}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="text-xs font-bold"
                            style={{ color: 'rgb(var(--primary))' }}
                          >
                            &#10003;
                          </span>
                          <span style={{ color: 'rgb(var(--foreground))' }}>
                            {row.rechnungswerk}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="text-xs font-bold"
                            style={{ color: 'rgb(var(--foreground-muted))', opacity: 0.5 }}
                          >
                            &#10007;
                          </span>
                          <span style={{ color: 'rgb(var(--foreground-muted))' }}>
                            {row.manuell}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ============================================================
            Section 5 — FAQ accordion
            ============================================================ */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Häufig gestellte Fragen
            </h2>
            <FaqAccordion faqs={faqs} />
          </div>
        </section>

        {/* ============================================================
            Section 6 — Final CTA
            ============================================================ */}
        <section
          className="py-20"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Jetzt kostenlos E-Rechnungen erstellen
            </h2>
            <p
              className="mt-4 text-sm"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Keine Kreditkarte erforderlich &nbsp;·&nbsp; DSGVO-konform &nbsp;·&nbsp; Open Source
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

      {/* FAQPage JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  )
}
