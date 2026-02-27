'use client'

import { useState } from 'react'
import Link from 'next/link'

/* -----------------------------------------------------------------------
   Metadata is exported from a separate server module when using 'use client'.
   Since Next.js 13+ allows metadata only in Server Components, we keep this
   page as a Client Component and define metadata in a companion layout or
   rely on the route segment config. For simplicity the title is set via a
   plain export that Next.js will pick up via the layout chain.
   ----------------------------------------------------------------------- */

const FAQ_ITEMS = [
  {
    question: 'Was ist die E-Rechnungspflicht und ab wann gilt sie?',
    answer:
      'Die E-Rechnungspflicht verpflichtet Unternehmen, elektronische Rechnungen in einem strukturierten Format (XRechnung oder ZUGFeRD) zu erstellen und zu empfangen. Seit dem 1. Januar 2025 mussen alle inlaendischen B2B-Unternehmen in Deutschland E-Rechnungen empfangen koennen. Ab dem 1. Januar 2027 mussen Unternehmen mit einem Jahresumsatz uber 800.000 EUR auch E-Rechnungen versenden; ab 2028 gilt dies fuer alle B2B-Unternehmen.',
  },
  {
    question: 'Welche Unternehmen sind von der E-Rechnungspflicht betroffen?',
    answer:
      'Betroffen sind grundsaetzlich alle umsatzsteuerpflichtigen Unternehmen, die Leistungen an andere inlaendische Unternehmen (B2B) erbringen. Kleinunternehmer nach § 19 UStG sind von der Sendepflicht ausgenommen, mussen aber ab 2025 E-Rechnungen empfangen koennen. Fuer Rechnungen an Privatpersonen (B2C) sowie fuer Rechnungen unter 250 EUR gibt es weiterhin Ausnahmen.',
  },
  {
    question: 'Was ist der Unterschied zwischen XRechnung und ZUGFeRD?',
    answer:
      'XRechnung ist ein rein maschinenlesbares XML-Format (basierend auf UBL oder CII) und das Pflichtformat fuer Rechnungen an oeffentliche Auftraggeber des Bundes. ZUGFeRD ist ein hybrides Format, das eine menschenlesbare PDF-Datei mit eingebetteten, strukturierten XML-Daten kombiniert — ideal fuer den Uebergang, da Empfaenger die PDF wie gewohnt oeffnen koennen. Beide Formate erfullen die EN 16931-Norm. RechnungsWerk unterstuetzt XRechnung 3.0.2 und ZUGFeRD 2.3.3.',
  },
  {
    question: 'Unterstuetzt RechnungsWerk Peppol?',
    answer:
      'Ja. RechnungsWerk unterstutzt die Ubermittlung uber das Peppol-Netzwerk, das europaweite Standard-Netzwerk fuer den elektronischen Rechnungsaustausch. Damit koennen Sie E-Rechnungen direkt an oeffentliche Auftraggeber und an international taetige Geschaftspartner zustellen. Die Peppol-Unterstuetzung ist im Starter- und Professional-Plan enthalten.',
  },
  {
    question: 'Kann ich RechnungsWerk selbst hosten?',
    answer:
      'Ja. RechnungsWerk ist Open Source (Lizenz: AGPL-3.0) und kann vollstaendig auf Ihrer eigenen Infrastruktur betrieben werden. Den vollstaendigen Quellcode finden Sie auf GitHub. Eine ausfuhrliche Anleitung zum Selbst-Hosting finden Sie in unserer Dokumentation unter /docs.',
  },
  {
    question: 'Wie viel kostet RechnungsWerk?',
    answer:
      'RechnungsWerk bietet einen kostenlosen Free-Plan fuer bis zu 5 Rechnungen pro Monat ohne Kreditkarte. Der Starter-Plan kostet 9,90 EUR/Monat (zzgl. MwSt.) und beinhaltet unbegrenzte Rechnungen, DATEV-Export und API-Zugang. Der Professional-Plan fuer 19,90 EUR/Monat erganzt Banking-Integration, Team-Verwaltung und Prioritaets-Support. Die vollstaendige Uebersicht finden Sie auf der Preisseite.',
  },
  {
    question: 'Wie sicher sind meine Daten?',
    answer:
      'Alle Daten werden verschlusselt ubertragen (TLS 1.3) und verschlusselt gespeichert. Unsere Server befinden sich ausschliesslich in Deutschland in einem ISO 27001-zertifizierten Rechenzentrum. Es werden keine Daten an Dritte weitergegeben oder zu Werbezwecken genutzt. Beim Selbst-Hosting haben Sie die vollstaendige Datensouveraenitaet.',
  },
  {
    question: 'Ist RechnungsWerk GoBD-konform?',
    answer:
      'Ja. RechnungsWerk speichert alle Rechnungen revisionssicher und unveraenderlich gemaess den Grundsaetzen zur ordnungsmaessigen Fuhrung und Aufbewahrung von Bucern (GoBD). Rechnungen koennen nicht nachtraeglich geloescht oder veraendert werden. Der integrierte DATEV-Export vereinfacht die Zusammenarbeit mit Ihrem Steuerberater erheblich.',
  },
  {
    question: 'Kann ich RechnungsWerk mit DATEV verbinden?',
    answer:
      'Ja. Im Starter- und Professional-Plan koennen Sie Ihre Rechnungsdaten jederzeit als DATEV-kompatible Exportdatei herunterladen. Ihr Steuerberater kann diese Datei direkt in DATEV importieren, ohne manuelle Dateneingabe. Eine direkte DATEV-API-Anbindung ist fuer kuenftige Versionen geplant.',
  },
  {
    question: 'Wie exportiere ich Rechnungen fuer meinen Steuerberater?',
    answer:
      'Unter "Einstellungen" → "Exporte" koennen Sie jederzeit einen DATEV-kompatiblen Export starten oder alle Rechnungen eines Zeitraums als ZIP-Archiv (mit PDF und XML) herunterladen. Der Export kann nach Datum, Kunde oder Rechnungsnummer gefiltert werden. Ihr Steuerberater erhalt alle notwendigen Belege in einem Schritt.',
  },
  {
    question: 'Was ist eine EN 16931-konforme Rechnung?',
    answer:
      'EN 16931 ist die europaische Norm, die das semantische Datenmodell fuer elektronische Rechnungen definiert. Sie legt fest, welche Pflichtfelder eine E-Rechnung enthalten muss (z.B. Steueridentifikationsnummer, Zahlungsbedingungen, Zeilenpositionen). RechnungsWerk validiert jede Rechnung automatisch gegen diese Norm, bevor sie exportiert wird, und zeigt eventuelle Fehler im Klartext an.',
  },
  {
    question: 'Wie lange werden meine Rechnungen gespeichert?',
    answer:
      'Rechnungen werden fuer 10 Jahre gespeichert, entsprechend der gesetzlichen Aufbewahrungspflicht gemaess § 147 AO. Beim Kundigen Ihres Kontos koennen Sie alle Daten als vollstaendiges Archiv (PDF + XML) exportieren und lokal sichern. Nach Ablauf der gesetzlichen Frist werden die Daten datenschutzkonform geloescht.',
  },
  {
    question: 'Gibt es eine API fuer Integrationen?',
    answer:
      'Ja. RechnungsWerk bietet eine REST-API (verfugbar ab dem Starter-Plan), mit der Sie Rechnungen programmatisch erstellen, abrufen und versenden koennen. Die vollstaendige API-Dokumentation ist im Dashboard unter "API-Schlussel" erreichbar. Wir bieten auch Webhooks an, um Ihr System uber Statusaenderungen (z.B. Zahlung erhalten) zu informieren.',
  },
  {
    question: 'Kann ich als Kleinunternehmer RechnungsWerk nutzen?',
    answer:
      'Ja, unbedingt. RechnungsWerk unterstutzt Kleinunternehmer-Rechnungen nach § 19 UStG, bei denen kein Umsatzsteuerausweis erfolgt. Sie koennen in den Einstellungen den Kleinunternehmer-Modus aktivieren; alle Rechnungen werden dann ohne MwSt.-Ausweis aber vollstaendig EN 16931-konform erstellt. Als Kleinunternehmer mussen Sie ab 2025 E-Rechnungen empfangen koennen, sind aber von der Sendepflicht zunachst ausgenommen.',
  },
  {
    question: 'Wie migriere ich von meiner bisherigen Software?',
    answer:
      'Der Import-Assistent im Dashboard unterstuetzt den Import von Kontakten und offenen Rechnungen uber CSV sowie den Import von DATEV-Exportdateien. Historische Rechnungen koennen als PDF-Archiv hochgeladen werden. Unser Support-Team begleitet Sie bei der Migration und stellt sicher, dass alle Daten vollstaendig und korrekt ubernommen werden.',
  },
]

/* -----------------------------------------------------------------------
   Accordion item
   ----------------------------------------------------------------------- */
function AccordionItem({
  question,
  answer,
  isOpen,
  onToggle,
  index,
}: {
  question: string
  answer: string
  isOpen: boolean
  onToggle: () => void
  index: number
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: isOpen ? 'rgb(var(--primary))' : 'rgb(var(--border))',
        borderWidth: isOpen ? '2px' : '1px',
        transition: 'border-color 0.2s ease',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`faq-answer-${index}`}
        id={`faq-question-${index}`}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
        style={{ backgroundColor: 'transparent', cursor: 'pointer', border: 'none' }}
      >
        <span
          className="text-sm font-semibold leading-snug"
          style={{ color: 'rgb(var(--foreground))' }}
        >
          {question}
        </span>
        <span
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold"
          style={{
            backgroundColor: isOpen ? 'rgb(var(--primary))' : 'rgb(var(--border))',
            color: isOpen ? 'rgb(var(--primary-foreground))' : 'rgb(var(--foreground-muted))',
            transition: 'background-color 0.2s ease, color 0.2s ease',
            transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            transitionProperty: 'background-color, color, transform',
          }}
          aria-hidden="true"
        >
          +
        </span>
      </button>

      <div
        id={`faq-answer-${index}`}
        role="region"
        aria-labelledby={`faq-question-${index}`}
        style={{
          maxHeight: isOpen ? '500px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        <p
          className="px-5 pb-5 text-sm leading-relaxed"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {answer}
        </p>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index))
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main>
        {/* ============================================================
            Header
            ============================================================ */}
        <section className="pt-20 pb-12">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <span
              className="inline-block rounded-full px-4 py-1 text-xs font-semibold mb-6"
              style={{
                backgroundColor: 'rgb(var(--primary) / 0.12)',
                color: 'rgb(var(--primary))',
              }}
            >
              Hilfe & Antworten
            </span>
            <h1
              className="text-4xl sm:text-5xl font-extrabold tracking-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Haeufig gestellte Fragen
            </h1>
            <p
              className="mt-4 text-lg max-w-xl mx-auto leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Alles Wichtige zu E-Rechnungspflicht, Formaten, Datenschutz und RechnungsWerk auf einen Blick.
            </p>
          </div>
        </section>

        {/* ============================================================
            FAQ Accordion
            ============================================================ */}
        <section className="pb-20">
          <div className="mx-auto max-w-3xl px-6">
            <dl className="space-y-3">
              {FAQ_ITEMS.map((item, index) => (
                <AccordionItem
                  key={item.question}
                  question={item.question}
                  answer={item.answer}
                  isOpen={openIndex === index}
                  onToggle={() => toggle(index)}
                  index={index}
                />
              ))}
            </dl>

            <p
              className="mt-10 text-center text-sm"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Keine Antwort gefunden?{' '}
              <a
                href="mailto:support@rechnungswerk.de"
                className="font-medium hover:opacity-80"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Schreiben Sie uns
              </a>
              {' '}oder besuchen Sie unsere{' '}
              <Link
                href="/docs"
                className="font-medium hover:opacity-80"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Dokumentation
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ============================================================
            CTA
            ============================================================ */}
        <section
          className="py-16"
          style={{ backgroundColor: 'rgb(var(--card))' }}
        >
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2
              className="text-2xl font-bold"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Bereit fuer rechtssichere E-Rechnungen?
            </h2>
            <p
              className="mt-3 text-sm leading-relaxed max-w-md mx-auto"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Starten Sie kostenlos — 5 Rechnungen pro Monat, kein Kreditkarte erforderlich.
              XRechnung und ZUGFeRD inklusive.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
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
                Zum Dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
