import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Changelog | RechnungsWerk',
  description:
    'Alle Updates und Releases von RechnungsWerk im Ueberblick. Neue Features, Verbesserungen und Bugfixes.',
  openGraph: {
    title: 'Changelog | RechnungsWerk',
    description: 'Alle Updates und Releases von RechnungsWerk im Ueberblick.',
    type: 'website',
    locale: 'de_DE',
  },
}

/* -----------------------------------------------------------------------
   Release data
   ----------------------------------------------------------------------- */
interface ReleaseItem {
  text: string
  tag?: 'feature' | 'security' | 'seo' | 'infra' | 'content'
}

interface Release {
  version: string
  title: string
  date: string
  items: ReleaseItem[]
}

const releases: Release[] = [
  {
    version: 'v0.3.0',
    title: 'Phase 3: Launch-Readiness',
    date: 'Februar 2026',
    items: [
      { text: 'Error Boundaries + 404-Seite', tag: 'feature' },
      { text: 'Security Headers (HSTS, XSS-Schutz)', tag: 'security' },
      { text: 'Einstellungen-Seite (Konto, Organisation, Abo)', tag: 'feature' },
      { text: 'Alembic Datenbank-Migrationen', tag: 'infra' },
      { text: 'Feature Gating fuer Premium-Features', tag: 'feature' },
      { text: '5 Vergleichsseiten (vs sevDesk, Lexware, etc.)', tag: 'content' },
      { text: '30 Glossar-Eintraege', tag: 'seo' },
      { text: '4 neue Blog-Artikel', tag: 'content' },
      { text: 'Erweiterte Sitemap (60+ URLs)', tag: 'seo' },
      { text: 'GitHub Launch-Vorbereitung', tag: 'infra' },
    ],
  },
  {
    version: 'v0.2.0',
    title: 'Phase 2: Features + SEO',
    date: 'Februar 2026',
    items: [
      { text: 'Mahnwesen (3-Stufen-System)', tag: 'feature' },
      { text: 'Cmd+K Kommandopalette', tag: 'feature' },
      { text: 'Onboarding-Assistent', tag: 'feature' },
      { text: 'TanStack Table fuer Rechnungen', tag: 'feature' },
      { text: 'Hybride KI (Anthropic/Mistral/Ollama)', tag: 'feature' },
      { text: 'pSEO: 10 Branchen + 16 Bundeslaender', tag: 'seo' },
      { text: '3 Blog-Artikel (XRechnung, ZUGFeRD, GoBD)', tag: 'content' },
      { text: 'Newsletter (Brevo)', tag: 'feature' },
      { text: 'GoBD Verfahrensdokumentation PDF', tag: 'content' },
      { text: 'DATEV Export Dialog', tag: 'feature' },
    ],
  },
  {
    version: 'v0.1.0',
    title: 'Phase 1: Marktreife',
    date: 'Februar 2026',
    items: [
      { text: 'Multi-Tenant Auth (JWT)', tag: 'security' },
      { text: 'Landing Page + Pricing', tag: 'feature' },
      { text: 'Stripe + SEPA-Integration', tag: 'feature' },
      { text: 'PWA mit Offline-Support', tag: 'feature' },
      { text: 'MDX Blog', tag: 'content' },
      { text: 'Rechtstexte (Impressum, Datenschutz, AGB)', tag: 'content' },
      { text: 'Docker Compose Setup', tag: 'infra' },
      { text: 'SEO Foundation', tag: 'seo' },
    ],
  },
]

const tagConfig: Record<string, { label: string; bg: string; text: string }> = {
  feature: {
    label: 'Feature',
    bg: 'rgb(var(--primary-light))',
    text: 'rgb(var(--primary))',
  },
  security: {
    label: 'Security',
    bg: 'rgba(239, 68, 68, 0.1)',
    text: 'rgb(239, 68, 68)',
  },
  seo: {
    label: 'SEO',
    bg: 'rgba(34, 197, 94, 0.1)',
    text: 'rgb(22, 163, 74)',
  },
  infra: {
    label: 'Infra',
    bg: 'rgba(168, 85, 247, 0.1)',
    text: 'rgb(147, 51, 234)',
  },
  content: {
    label: 'Content',
    bg: 'rgba(245, 158, 11, 0.1)',
    text: 'rgb(217, 119, 6)',
  },
}

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default function ChangelogPage() {
  return (
    <main>
      {/* Hero */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p
            className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold mb-6"
            style={{
              backgroundColor: 'rgb(var(--primary-light))',
              color: 'rgb(var(--primary))',
              border: '1px solid rgb(var(--primary-border))',
            }}
          >
            Updates & Releases
          </p>
          <h1
            className="text-4xl sm:text-5xl font-extrabold tracking-tight"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Changelog
          </h1>
          <p
            className="mt-4 text-lg max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            Alle Updates, neuen Features und Verbesserungen von RechnungsWerk auf einen Blick.
          </p>
        </div>
      </section>

      {/* Timeline */}
      <section className="pb-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="relative">
            {/* Vertical timeline line */}
            <div
              className="absolute left-[23px] top-0 bottom-0 w-px hidden md:block"
              style={{ backgroundColor: 'rgb(var(--border))' }}
            />

            <div className="space-y-12">
              {releases.map((release, idx) => (
                <div key={release.version} className="relative md:pl-16">
                  {/* Timeline dot */}
                  <div
                    className="absolute left-3 top-6 w-[11px] h-[11px] rounded-full border-2 hidden md:block"
                    style={{
                      borderColor: 'rgb(var(--primary))',
                      backgroundColor: idx === 0 ? 'rgb(var(--primary))' : 'rgb(var(--background))',
                    }}
                  />

                  {/* Release card */}
                  <div
                    className="rounded-xl border p-6 sm:p-8"
                    style={{
                      backgroundColor: 'rgb(var(--card))',
                      borderColor: idx === 0 ? 'rgb(var(--primary-border))' : 'rgb(var(--border))',
                    }}
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <span
                        className="rounded-lg px-3 py-1 text-sm font-bold"
                        style={{
                          backgroundColor: 'rgb(var(--primary))',
                          color: 'rgb(var(--primary-foreground))',
                        }}
                      >
                        {release.version}
                      </span>
                      <h2
                        className="text-xl font-bold"
                        style={{ color: 'rgb(var(--foreground))' }}
                      >
                        {release.title}
                      </h2>
                      <span
                        className="text-sm ml-auto"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        {release.date}
                      </span>
                    </div>

                    {/* Items */}
                    <ul className="space-y-3">
                      {release.items.map((item) => {
                        const tag = item.tag ? tagConfig[item.tag] : null
                        return (
                          <li
                            key={item.text}
                            className="flex items-start gap-3 text-sm"
                          >
                            <span
                              className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: 'rgb(var(--primary))' }}
                            />
                            <span
                              className="leading-relaxed"
                              style={{ color: 'rgb(var(--foreground))' }}
                            >
                              {item.text}
                            </span>
                            {tag && (
                              <span
                                className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ml-auto"
                                style={{
                                  backgroundColor: tag.bg,
                                  color: tag.text,
                                }}
                              >
                                {tag.label}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="py-16"
        style={{ backgroundColor: 'rgb(var(--card))' }}
      >
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Immer auf dem Laufenden bleiben
          </h2>
          <p
            className="mt-3 text-sm max-w-lg mx-auto"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            Folgen Sie unserem GitHub-Repository fuer die neuesten Updates oder abonnieren Sie unseren Newsletter.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
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
              GitHub ansehen
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
