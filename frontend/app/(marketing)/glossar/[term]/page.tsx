import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { glossaryTerms, getTermBySlug, type GlossaryTerm } from '../../../../data/pseo/glossary'

/* -----------------------------------------------------------------------
   Static params — generates all 30 term pages at build time
   ----------------------------------------------------------------------- */
export function generateStaticParams() {
  return glossaryTerms.map((t) => ({
    term: t.slug,
  }))
}

/* -----------------------------------------------------------------------
   Metadata
   ----------------------------------------------------------------------- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ term: string }>
}): Promise<Metadata> {
  const { term: slug } = await params
  const term = getTermBySlug(slug)
  if (!term) return {}

  return {
    title: `Was ist ${term.name}? | RechnungsWerk Glossar`,
    description: term.shortDefinition,
    openGraph: {
      title: `Was ist ${term.name}? | RechnungsWerk Glossar`,
      description: term.shortDefinition,
      type: 'article',
      locale: 'de_DE',
    },
  }
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

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default async function GlossaryTermPage({
  params,
}: {
  params: Promise<{ term: string }>
}) {
  const { term: slug } = await params
  const term = getTermBySlug(slug)
  if (!term) notFound()

  /* Resolve related terms */
  const relatedTerms = term.relatedTerms
    .map((relSlug) => getTermBySlug(relSlug))
    .filter((t): t is GlossaryTerm => t !== undefined)

  /* Split longDefinition into paragraphs */
  const paragraphs = term.longDefinition.split('\n\n')

  return (
    <>
      <main>
        {/* ============================================================
            Breadcrumb
            ============================================================ */}
        <section className="pt-8">
          <div className="mx-auto max-w-4xl px-6">
            <nav
              className="flex items-center gap-2 text-sm"
              style={{ color: 'rgb(var(--foreground-muted))' }}
              aria-label="Breadcrumb"
            >
              <Link
                href="/glossar"
                className="hover:opacity-80 transition-opacity"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Glossar
              </Link>
              <span aria-hidden="true">/</span>
              <span style={{ color: 'rgb(var(--foreground))' }}>{term.name}</span>
            </nav>
          </div>
        </section>

        {/* ============================================================
            Hero
            ============================================================ */}
        <section className="pt-12 pb-16">
          <div className="mx-auto max-w-4xl px-6">
            <div className="flex items-center gap-3 mb-6">
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: 'rgb(var(--primary-light))',
                  color: 'rgb(var(--primary))',
                  border: '1px solid rgb(var(--primary-border))',
                }}
              >
                {categoryLabels[term.category]}
              </span>
            </div>

            <h1
              className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Was ist{' '}
              <span style={{ color: 'rgb(var(--primary))' }}>{term.name}</span>?
            </h1>

            {/* Lead paragraph — short definition */}
            <p
              className="mt-8 text-lg leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              {term.shortDefinition}
            </p>
          </div>
        </section>

        {/* ============================================================
            Long definition
            ============================================================ */}
        <section className="pb-16">
          <div className="mx-auto max-w-4xl px-6">
            <div
              className="rounded-xl border p-8 sm:p-10"
              style={{
                backgroundColor: 'rgb(var(--card))',
                borderColor: 'rgb(var(--border))',
              }}
            >
              <div className="space-y-6">
                {paragraphs.map((paragraph, index) => (
                  <p
                    key={index}
                    className="text-sm sm:text-base leading-relaxed"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            Related terms
            ============================================================ */}
        {relatedTerms.length > 0 && (
          <section className="pb-16">
            <div className="mx-auto max-w-4xl px-6">
              <h2
                className="text-2xl font-bold tracking-tight mb-6"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                Verwandte Begriffe
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {relatedTerms.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/glossar/${related.slug}`}
                    className="block rounded-xl border p-5 transition-shadow hover:shadow-md"
                    style={{
                      backgroundColor: 'rgb(var(--card))',
                      borderColor: 'rgb(var(--border))',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <h3
                        className="text-sm font-bold"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        {related.name}
                      </h3>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          backgroundColor: 'rgb(var(--primary-light))',
                          color: 'rgb(var(--primary))',
                          border: '1px solid rgb(var(--primary-border))',
                        }}
                      >
                        {categoryLabels[related.category]}
                      </span>
                    </div>
                    <p
                      className="text-xs leading-relaxed line-clamp-2"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      {related.shortDefinition}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

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
              Erstellen Sie konforme E-Rechnungen mit XRechnung und ZUGFeRD.
              Kostenlos, ohne Kreditkarte.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-lg px-8 py-3.5 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
                style={{
                  backgroundColor: 'rgb(var(--primary))',
                  color: 'rgb(var(--primary-foreground))',
                }}
              >
                Jetzt kostenlos starten
              </Link>
              <Link
                href="/glossar"
                className="rounded-lg px-8 py-3.5 text-base font-semibold border transition-colors"
                style={{
                  borderColor: 'rgb(var(--border-strong))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                Zurueck zum Glossar
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* JSON-LD DefinedTerm schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'DefinedTerm',
            name: term.name,
            description: term.shortDefinition,
            inDefinedTermSet: {
              '@type': 'DefinedTermSet',
              name: 'E-Rechnungs-Glossar',
              url: 'https://rechnungswerk.io/glossar',
            },
          }),
        }}
      />

      {/* JSON-LD BreadcrumbList schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Glossar',
                item: 'https://rechnungswerk.io/glossar',
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: term.name,
                item: `https://rechnungswerk.io/glossar/${term.slug}`,
              },
            ],
          }),
        }}
      />
    </>
  )
}
