import type { Metadata } from 'next'
import Link from 'next/link'
import { glossaryTerms, type GlossaryTerm } from '../../../data/pseo/glossary'

/* -----------------------------------------------------------------------
   Metadata
   ----------------------------------------------------------------------- */
export const metadata: Metadata = {
  title: 'E-Rechnungs-Glossar | RechnungsWerk',
  description:
    'Alle wichtigen Begriffe rund um E-Rechnung, XRechnung, ZUGFeRD, Buchhaltung und Steuerrecht verstaendlich erklaert. Das umfassende Glossar von RechnungsWerk.',
  openGraph: {
    title: 'E-Rechnungs-Glossar | RechnungsWerk',
    description:
      'Ueber 30 Fachbegriffe zu E-Rechnung, Buchhaltung und Steuerrecht verstaendlich erklaert.',
    type: 'website',
    locale: 'de_DE',
  },
}

/* -----------------------------------------------------------------------
   Category config
   ----------------------------------------------------------------------- */
const categoryLabels: Record<GlossaryTerm['category'], string> = {
  format: 'Format',
  steuer: 'Steuer',
  buchhaltung: 'Buchhaltung',
  recht: 'Recht',
  technik: 'Technik',
}

const categoryOrder: GlossaryTerm['category'][] = [
  'format',
  'steuer',
  'buchhaltung',
  'recht',
  'technik',
]

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default function GlossaryIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ kategorie?: string }>
}) {
  /* ---- Group terms alphabetically ---- */
  const grouped = new Map<string, GlossaryTerm[]>()
  for (const term of glossaryTerms) {
    const letter = term.name.charAt(0).toUpperCase()
    if (!grouped.has(letter)) grouped.set(letter, [])
    grouped.get(letter)!.push(term)
  }

  /* Sort letters */
  const sortedLetters = [...grouped.keys()].sort((a, b) => a.localeCompare(b, 'de'))

  /* Sort terms within each letter */
  for (const terms of grouped.values()) {
    terms.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }

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
              Glossar
            </p>

            <h1
              className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              E-Rechnungs-
              <span style={{ color: 'rgb(var(--primary))' }}>Glossar</span>
            </h1>

            <p
              className="mt-6 text-lg max-w-3xl mx-auto leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Alle wichtigen Begriffe rund um E-Rechnung, XRechnung, ZUGFeRD,
              Buchhaltung und Steuerrecht verstaendlich erklaert.
            </p>
          </div>
        </section>

        {/* ============================================================
            Category filter badges
            ============================================================ */}
        <section className="border-y" style={{ borderColor: 'rgb(var(--border))' }}>
          <div className="mx-auto max-w-6xl px-6 py-6">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/glossar"
                className="rounded-full px-4 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: 'rgb(var(--primary))',
                  color: 'rgb(var(--primary-foreground))',
                }}
              >
                Alle ({glossaryTerms.length})
              </Link>
              {categoryOrder.map((cat) => {
                const count = glossaryTerms.filter((t) => t.category === cat).length
                return (
                  <Link
                    key={cat}
                    href={`/glossar?kategorie=${cat}`}
                    className="rounded-full px-4 py-1.5 text-xs font-semibold border transition-colors hover:opacity-80"
                    style={{
                      borderColor: 'rgb(var(--border-strong))',
                      color: 'rgb(var(--foreground))',
                      backgroundColor: 'rgb(var(--card))',
                    }}
                  >
                    {categoryLabels[cat]} ({count})
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* ============================================================
            Letter navigation
            ============================================================ */}
        <section>
          <div className="mx-auto max-w-6xl px-6 py-6">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {sortedLetters.map((letter) => (
                <a
                  key={letter}
                  href={`#${letter}`}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: 'rgb(var(--muted))',
                    color: 'rgb(var(--foreground))',
                  }}
                >
                  {letter}
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Term list grouped by letter
            ============================================================ */}
        <section className="pb-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="space-y-12">
              {sortedLetters.map((letter) => (
                <div key={letter} id={letter}>
                  {/* Letter heading */}
                  <div className="flex items-center gap-4 mb-6">
                    <span
                      className="flex items-center justify-center w-12 h-12 rounded-xl text-xl font-extrabold"
                      style={{
                        backgroundColor: 'rgb(var(--primary))',
                        color: 'rgb(var(--primary-foreground))',
                      }}
                    >
                      {letter}
                    </span>
                    <div
                      className="flex-1 h-px"
                      style={{ backgroundColor: 'rgb(var(--border))' }}
                    />
                  </div>

                  {/* Terms */}
                  <div className="space-y-4">
                    {grouped.get(letter)!.map((term) => (
                      <Link
                        key={term.slug}
                        href={`/glossar/${term.slug}`}
                        className="block rounded-xl border p-5 transition-shadow hover:shadow-md"
                        style={{
                          backgroundColor: 'rgb(var(--card))',
                          borderColor: 'rgb(var(--border))',
                        }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <h2
                                className="text-base font-bold"
                                style={{ color: 'rgb(var(--foreground))' }}
                              >
                                {term.name}
                              </h2>
                              <span
                                className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                style={{
                                  backgroundColor: 'rgb(var(--primary-light))',
                                  color: 'rgb(var(--primary))',
                                  border: '1px solid rgb(var(--primary-border))',
                                }}
                              >
                                {categoryLabels[term.category]}
                              </span>
                            </div>
                            <p
                              className="text-sm leading-relaxed line-clamp-2"
                              style={{ color: 'rgb(var(--foreground-muted))' }}
                            >
                              {term.shortDefinition}
                            </p>
                          </div>
                          <span
                            className="shrink-0 mt-1 text-lg"
                            style={{ color: 'rgb(var(--foreground-muted))' }}
                            aria-hidden="true"
                          >
                            &rarr;
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            CTA
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
              Von der Theorie zur Praxis
            </h2>
            <p
              className="mt-4 text-base max-w-lg mx-auto"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Erstellen Sie konforme E-Rechnungen in unter 30 Sekunden.
              Kostenlos, ohne Kreditkarte.
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
    </>
  )
}
