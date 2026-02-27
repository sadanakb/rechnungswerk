import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Ueber uns – RechnungsWerk',
  description:
    'Wir machen E-Rechnungen fuer deutsche Unternehmen einfach. Open Source, datenschutzkonform, EN 16931 zertifiziert.',
  openGraph: {
    title: 'Ueber uns – RechnungsWerk',
    description:
      'Wir machen E-Rechnungen fuer deutsche Unternehmen einfach. Open Source, datenschutzkonform, EN 16931 zertifiziert.',
    type: 'website',
    locale: 'de_DE',
  },
}

const values = [
  {
    icon: '&#128273;',
    title: 'Open Source',
    description:
      'RechnungsWerk ist vollstaendig Open Source (AGPL-3.0). Jede Zeile Code ist auf GitHub einsehbar — keine versteckten Algorithmen, keine Lock-in-Effekte.',
  },
  {
    icon: '&#128274;',
    title: 'Privacy-First',
    description:
      'Ihre Rechnungsdaten gehoeren Ihnen. Wir verarbeiten keine Daten fuer Werbezwecke, teilen keine Informationen mit Dritten und unterstuetzen Self-Hosting.',
  },
  {
    icon: '&#127889;',
    title: 'German Compliance',
    description:
      'XRechnung 3.0.2, ZUGFeRD 2.3.3, EN 16931, GoBD — wir implementieren alle relevanten deutschen und europaeischen Standards vollstaendig und korrekt.',
  },
]

const techStack = [
  'Python',
  'FastAPI',
  'Next.js',
  'PostgreSQL',
  'XRechnung 3.0.2',
  'ZUGFeRD 2.3.3',
]

const team = [
  { initials: 'SK', name: 'Sadan K.', role: 'Gruender & Entwickler' },
  { initials: 'RW', name: 'RechnungsWerk', role: 'Open Source Community' },
]

export default function UeberUnsPage() {
  return (
    <main>
      {/* ================================================================
          Mission
          ================================================================ */}
      <section className="pt-20 pb-16">
        <div className="mx-auto max-w-3xl px-6">
          <h1
            className="text-4xl sm:text-5xl font-extrabold tracking-tight"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Wir machen E-Rechnungen einfach.
          </h1>
          <p
            className="mt-6 text-lg leading-relaxed"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            Die E-Rechnungspflicht in Deutschland ist komplex, die vorhandenen
            Loesungen oft teuer oder schwer verstaendlich. RechnungsWerk entstand
            aus der Ueberzeugung, dass rechtskonforme E-Rechnungen fuer jeden
            zugaenglich sein muessen — ob Einzelunternehmer, Mittelstaendler oder
            Grossunternehmen.
          </p>
        </div>
      </section>

      {/* ================================================================
          Unsere Geschichte
          ================================================================ */}
      <section
        className="py-16"
        style={{ backgroundColor: 'rgb(var(--card))' }}
      >
        <div className="mx-auto max-w-3xl px-6">
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Unsere Geschichte
          </h2>
          <div
            className="mt-6 space-y-4 text-sm leading-relaxed"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            <p>
              Mit der schrittweisen Einfuehrung der E-Rechnungspflicht ab 2025
              standen viele deutsche Unternehmen vor einer schwierigen Wahl:
              teure proprietaere Softwareloesungen oder fehlerhafte
              Behelfsloesungen. Die technischen Anforderungen — XRechnung nach
              dem UBL-Standard, ZUGFeRD als hybrides PDF-XML-Format, EN 16931
              Compliance — ueberforderten viele.
            </p>
            <p>
              RechnungsWerk wurde entwickelt, um diese Luecke zu schliessen.
              Vollstaendig Open Source, lokal hostbar und mit einem klaren
              Fokus auf korrekte Implementierung der deutschen und europaeischen
              Standards. Von Anfang an stand dabei Transparenz im Mittelpunkt:
              Jede Designentscheidung, jede Implementierung ist nachvollziehbar
              und pruefbar.
            </p>
            <p>
              Heute unterstuetzt RechnungsWerk XRechnung 3.0.2 und
              ZUGFeRD 2.3.3, bietet OCR-gestuetzte Belegserfassung, GoBD-konformes
              Archiv, DATEV-Export und ein vollstaendiges Mahnwesen — alles
              unter einer offenen Lizenz.
            </p>
          </div>
        </div>
      </section>

      {/* ================================================================
          Unsere Werte
          ================================================================ */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2
            className="text-2xl font-bold tracking-tight text-center"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Unsere Werte
          </h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((v) => (
              <div
                key={v.title}
                className="rounded-xl border p-6"
                style={{
                  backgroundColor: 'rgb(var(--card))',
                  borderColor: 'rgb(var(--border))',
                }}
              >
                <div className="text-3xl mb-4" dangerouslySetInnerHTML={{ __html: v.icon }} />
                <h3
                  className="text-base font-semibold"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  {v.title}
                </h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          Tech Stack
          ================================================================ */}
      <section
        className="py-12"
        style={{ backgroundColor: 'rgb(var(--card))' }}
      >
        <div className="mx-auto max-w-3xl px-6">
          <h2
            className="text-xl font-bold"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Tech Stack
          </h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  border: '1px solid rgb(var(--border-strong))',
                  color: 'rgb(var(--foreground))',
                  backgroundColor: 'rgb(var(--background))',
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          Open Source
          ================================================================ */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2
            className="text-2xl font-bold"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Vollstaendig Open Source
          </h2>
          <p
            className="mt-4 text-sm leading-relaxed"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            RechnungsWerk ist vollstaendig Open Source und unter der AGPL-3.0
            lizenziert. Sie koennen den Quellcode einsehen, forken, anpassen
            und Ihre eigene Instanz betreiben — ohne Einschraenkungen.
          </p>
          <div className="mt-6">
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

      {/* ================================================================
          Team
          ================================================================ */}
      <section
        className="py-16"
        style={{ backgroundColor: 'rgb(var(--card))' }}
      >
        <div className="mx-auto max-w-3xl px-6">
          <h2
            className="text-2xl font-bold text-center"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Das Team
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-8">
            {team.map((member) => (
              <div key={member.name} className="flex flex-col items-center gap-3">
                {/* Avatar circle with initials */}
                <div
                  className="flex items-center justify-center w-16 h-16 rounded-full text-lg font-bold"
                  style={{
                    backgroundColor: 'rgb(var(--primary))',
                    color: 'rgb(var(--primary-foreground))',
                  }}
                >
                  {member.initials}
                </div>
                <div className="text-center">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {member.name}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    {member.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          CTA
          ================================================================ */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
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
            Kostenlos starten — keine Kreditkarte erforderlich.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
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
              href="/kontakt"
              className="inline-block rounded-lg px-8 py-3.5 text-base font-semibold border"
              style={{
                borderColor: 'rgb(var(--border-strong))',
                color: 'rgb(var(--foreground))',
              }}
            >
              Kontakt aufnehmen
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
