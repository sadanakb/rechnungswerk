import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Selbst-Hosting – RechnungsWerk | Docker Deployment Guide',
  description:
    'Vollstaendige Anleitung zum Selbst-Hosting von RechnungsWerk mit Docker Compose. Voraussetzungen, Umgebungsvariablen, HTTPS-Konfiguration, Backup und Updates.',
  openGraph: {
    title: 'Selbst-Hosting – RechnungsWerk',
    description: 'Docker Compose Deployment Guide fuer RechnungsWerk.',
    type: 'website',
    locale: 'de_DE',
  },
}

/* -----------------------------------------------------------------------
   Env vars table data
   ----------------------------------------------------------------------- */
interface EnvVar {
  name: string
  required: boolean
  description: string
  example: string
}

const ENV_VARS: EnvVar[] = [
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL-Verbindungsstring',
    example: 'postgresql://rw:geheim@db:5432/rechnungswerk',
  },
  {
    name: 'SECRET_KEY',
    required: true,
    description: 'Zufaelliger 32+-Byte-Schluessel fuer JWT-Signierung',
    example: 'openssl rand -hex 32',
  },
  {
    name: 'BREVO_API_KEY',
    required: false,
    description: 'Brevo (ehem. Sendinblue) API-Schluessel fuer E-Mail-Versand',
    example: 'xkeysib-...',
  },
  {
    name: 'STRIPE_SECRET_KEY',
    required: false,
    description: 'Stripe Secret Key fuer Zahlungsabwicklung (Cloud-Modus)',
    example: 'sk_live_...',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: false,
    description: 'Stripe Webhook-Signing-Secret fuer Event-Verifikation',
    example: 'whsec_...',
  },
  {
    name: 'CLOUD_MODE',
    required: false,
    description: 'Auf "false" setzen fuer Selbst-Hosting ohne Stripe-Pflicht',
    example: 'false',
  },
  {
    name: 'ALLOWED_ORIGINS',
    required: true,
    description: 'CORS-erlaubte Origins, kommasepariert',
    example: 'https://rechnung.meinefirma.de',
  },
  {
    name: 'REDIS_URL',
    required: false,
    description: 'Redis-Verbindungsstring fuer Aufgaben-Queue und Rate-Limiting',
    example: 'redis://redis:6379/0',
  },
]

/* -----------------------------------------------------------------------
   Reusable section header
   ----------------------------------------------------------------------- */
function SectionHeading({
  number,
  title,
  subtitle,
}: {
  number: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0"
          style={{
            backgroundColor: 'rgb(var(--primary))',
            color: 'rgb(var(--primary-foreground))',
          }}
        >
          {number}
        </span>
        <h2
          className="text-xl font-bold"
          style={{ color: 'rgb(var(--foreground))' }}
        >
          {title}
        </h2>
      </div>
      {subtitle && (
        <p
          className="ml-11 text-sm leading-relaxed"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}

/* -----------------------------------------------------------------------
   Code block
   ----------------------------------------------------------------------- */
function CodeBlock({ children, language = 'bash' }: { children: string; language?: string }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'rgb(var(--card))',
        borderColor: 'rgb(var(--border))',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b text-xs font-mono"
        style={{
          borderColor: 'rgb(var(--border))',
          color: 'rgb(var(--foreground-muted))',
          backgroundColor: 'rgb(var(--background))',
        }}
      >
        <span>{language}</span>
      </div>
      <pre
        className="overflow-x-auto p-4 text-sm leading-relaxed"
        style={{ color: 'rgb(var(--foreground))' }}
      >
        <code>{children}</code>
      </pre>
    </div>
  )
}

/* -----------------------------------------------------------------------
   Page component
   ----------------------------------------------------------------------- */
export default function DocsPage() {
  return (
    <main>
      {/* ============================================================
          Header
          ============================================================ */}
      <section className="pt-20 pb-12">
        <div className="mx-auto max-w-3xl px-6">
          <span
            className="inline-block rounded-full px-4 py-1 text-xs font-semibold mb-6"
            style={{
              backgroundColor: 'rgb(var(--primary) / 0.12)',
              color: 'rgb(var(--primary))',
            }}
          >
            Open Source &amp; Self-Hosting
          </span>
          <h1
            className="text-4xl sm:text-5xl font-extrabold tracking-tight"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Selbst-Hosting mit Docker
          </h1>
          <p
            className="mt-4 text-lg leading-relaxed max-w-2xl"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            RechnungsWerk ist Open Source (AGPL-3.0). Betreiben Sie Ihre eigene Instanz
            auf Ihrer eigenen Infrastruktur — vollstaendige Datensouveraenitaet,
            keine monatlichen Gebuehren.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://github.com/sadanakb/rechnungswerk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold border transition-colors hover:opacity-80"
              style={{
                borderColor: 'rgb(var(--border-strong))',
                color: 'rgb(var(--foreground))',
              }}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              GitHub
            </a>
            <Link
              href="/faq#hosting"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold"
              style={{
                backgroundColor: 'rgb(var(--primary))',
                color: 'rgb(var(--primary-foreground))',
              }}
            >
              FAQ ansehen
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================
          Table of Contents
          ============================================================ */}
      <section className="pb-6">
        <div className="mx-auto max-w-3xl px-6">
          <nav
            className="rounded-xl border p-5"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: 'rgb(var(--border))',
            }}
            aria-label="Seitennavigation"
          >
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Inhalt
            </p>
            <ol className="space-y-1.5 text-sm">
              {[
                ['#voraussetzungen', '1. Voraussetzungen'],
                ['#schnellstart', '2. Schnellstart'],
                ['#umgebungsvariablen', '3. Umgebungsvariablen'],
                ['#https', '4. HTTPS & Reverse Proxy'],
                ['#backup', '5. Datensicherung'],
                ['#updates', '6. Updates'],
                ['#support', '7. Support'],
              ].map(([href, label]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="hover:opacity-80 transition-opacity"
                    style={{ color: 'rgb(var(--primary))' }}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>

      {/* ============================================================
          Content sections
          ============================================================ */}
      <div className="pb-24">
        <div className="mx-auto max-w-3xl px-6 space-y-16">

          {/* --- 1. Voraussetzungen --- */}
          <section id="voraussetzungen" className="scroll-mt-24">
            <SectionHeading
              number="1"
              title="Voraussetzungen"
              subtitle="Stellen Sie sicher, dass folgende Software auf Ihrem Server installiert ist:"
            />
            <div
              className="rounded-xl border divide-y"
              style={{
                backgroundColor: 'rgb(var(--card))',
                borderColor: 'rgb(var(--border))',
                divideColor: 'rgb(var(--border))',
              }}
            >
              {[
                { label: 'Docker', version: '24.0 oder neuer', note: 'docker.com/get-docker' },
                { label: 'Docker Compose', version: 'v2 (Plugin)', note: 'Im Docker Desktop enthalten' },
                { label: 'PostgreSQL', version: '17 (via Docker)', note: 'Wird automatisch gestartet' },
                { label: 'RAM', version: 'min. 2 GB', note: '4 GB empfohlen fuer Produktion' },
                { label: 'Festplatte', version: 'min. 10 GB', note: 'Fuer Datenbank und Rechnungsarchiv' },
              ].map((req) => (
                <div key={req.label} className="flex items-start justify-between px-5 py-3.5">
                  <div>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'rgb(var(--foreground))' }}
                    >
                      {req.label}
                    </span>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      {req.note}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-medium shrink-0 ml-4"
                    style={{
                      backgroundColor: 'rgb(var(--primary) / 0.12)',
                      color: 'rgb(var(--primary))',
                    }}
                  >
                    {req.version}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* --- 2. Schnellstart --- */}
          <section id="schnellstart" className="scroll-mt-24">
            <SectionHeading
              number="2"
              title="Schnellstart"
              subtitle="Vier Schritte bis zur laufenden Instanz:"
            />

            <div className="space-y-6">
              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Schritt 1: Repository klonen
                </p>
                <CodeBlock language="bash">{`git clone https://github.com/sadanakb/rechnungswerk.git
cd rechnungswerk`}</CodeBlock>
              </div>

              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Schritt 2: Umgebungsvariablen konfigurieren
                </p>
                <CodeBlock language="bash">{`cp .env.example .env
# Bearbeiten Sie .env und setzen Sie Ihre Werte
nano .env`}</CodeBlock>
              </div>

              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Schritt 3: Container starten
                </p>
                <CodeBlock language="bash">{`docker compose up -d`}</CodeBlock>
              </div>

              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Schritt 4: Datenbank migrieren & ersten Admin anlegen
                </p>
                <CodeBlock language="bash">{`docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.cli create-admin`}</CodeBlock>
              </div>

              <div
                className="rounded-xl border p-4 text-sm leading-relaxed"
                style={{
                  backgroundColor: 'rgb(var(--primary) / 0.06)',
                  borderColor: 'rgb(var(--primary) / 0.3)',
                  color: 'rgb(var(--foreground-muted))',
                }}
              >
                <span
                  className="font-semibold"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Hinweis:
                </span>{' '}
                RechnungsWerk laeuft anschliessend unter{' '}
                <code
                  className="rounded px-1.5 py-0.5 text-xs font-mono"
                  style={{ backgroundColor: 'rgb(var(--border))' }}
                >
                  http://localhost:3000
                </code>
                . Fuer den Produktionsbetrieb konfigurieren Sie einen Reverse Proxy mit HTTPS (siehe Abschnitt 4).
              </div>
            </div>
          </section>

          {/* --- 3. Umgebungsvariablen --- */}
          <section id="umgebungsvariablen" className="scroll-mt-24">
            <SectionHeading
              number="3"
              title="Umgebungsvariablen"
              subtitle="Alle Variablen werden in der .env-Datei im Projektstamm konfiguriert."
            />

            <div
              className="rounded-xl border overflow-hidden"
              style={{
                backgroundColor: 'rgb(var(--card))',
                borderColor: 'rgb(var(--border))',
              }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      backgroundColor: 'rgb(var(--background))',
                      borderBottom: '1px solid rgb(var(--border))',
                    }}
                  >
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Variable
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Pflicht
                    </th>
                    <th
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide hidden md:table-cell"
                      style={{ color: 'rgb(var(--foreground-muted))' }}
                    >
                      Beschreibung
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ENV_VARS.map((env, i) => (
                    <tr
                      key={env.name}
                      style={{
                        borderTop: i > 0 ? '1px solid rgb(var(--border))' : undefined,
                      }}
                    >
                      <td className="px-4 py-3 align-top">
                        <code
                          className="text-xs font-mono rounded px-1.5 py-0.5"
                          style={{
                            backgroundColor: 'rgb(var(--border))',
                            color: 'rgb(var(--foreground))',
                          }}
                        >
                          {env.name}
                        </code>
                        <p
                          className="mt-1.5 text-xs font-mono md:hidden"
                          style={{ color: 'rgb(var(--foreground-muted))' }}
                        >
                          {env.example}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={
                            env.required
                              ? {
                                  backgroundColor: 'rgb(var(--primary) / 0.15)',
                                  color: 'rgb(var(--primary))',
                                }
                              : {
                                  backgroundColor: 'rgb(var(--border))',
                                  color: 'rgb(var(--foreground-muted))',
                                }
                          }
                        >
                          {env.required ? 'Ja' : 'Nein'}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 align-top hidden md:table-cell"
                        style={{ color: 'rgb(var(--foreground-muted))' }}
                      >
                        <p className="text-xs">{env.description}</p>
                        <p
                          className="mt-1 text-xs font-mono"
                          style={{ color: 'rgb(var(--foreground))' }}
                        >
                          {env.example}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <CodeBlock language=".env">{`# Minimal-Konfiguration fuer Selbst-Hosting
DATABASE_URL=postgresql://rw:geheim@db:5432/rechnungswerk
SECRET_KEY=ihr-zufaelliger-schluessel-hier
ALLOWED_ORIGINS=https://rechnung.meinefirma.de
CLOUD_MODE=false`}</CodeBlock>
            </div>
          </section>

          {/* --- 4. HTTPS & Reverse Proxy --- */}
          <section id="https" className="scroll-mt-24">
            <SectionHeading
              number="4"
              title="HTTPS &amp; Reverse Proxy"
              subtitle="Fuer den Produktionsbetrieb empfehlen wir Caddy (automatisches TLS) oder Nginx."
            />

            <div className="space-y-6">
              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Option A: Caddyfile (empfohlen — automatisches TLS via Let's Encrypt)
                </p>
                <CodeBlock language="Caddyfile">{`rechnung.meinefirma.de {
  reverse_proxy localhost:3000
}`}</CodeBlock>
              </div>

              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Option B: Nginx-Konfiguration
                </p>
                <CodeBlock language="nginx">{`server {
    listen 443 ssl http2;
    server_name rechnung.meinefirma.de;

    ssl_certificate     /etc/letsencrypt/live/rechnung.meinefirma.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rechnung.meinefirma.de/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}`}</CodeBlock>
              </div>
            </div>
          </section>

          {/* --- 5. Datensicherung --- */}
          <section id="backup" className="scroll-mt-24">
            <SectionHeading
              number="5"
              title="Datensicherung"
              subtitle="Sichern Sie regelmaessig Ihre PostgreSQL-Datenbank und das Rechnungsarchiv."
            />

            <div className="space-y-6">
              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Manuelles Datenbank-Backup mit pg_dump
                </p>
                <CodeBlock language="bash">{`docker compose exec db pg_dump \
  -U rw rechnungswerk \
  > backup_$(date +%Y%m%d_%H%M%S).sql`}</CodeBlock>
              </div>

              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Automatisches taegliches Backup (Cron-Job)
                </p>
                <CodeBlock language="bash">{`# In /etc/cron.d/rechnungswerk eintragen:
0 2 * * * root docker compose -f /opt/rechnungswerk/docker-compose.yml \\
  exec -T db pg_dump -U rw rechnungswerk \\
  > /backups/rechnungswerk_$(date +\%Y\%m\%d).sql`}</CodeBlock>
              </div>

              <div
                className="rounded-xl border p-4 text-sm leading-relaxed"
                style={{
                  backgroundColor: 'rgb(var(--card))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--foreground-muted))',
                }}
              >
                <span className="font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                  Empfohlene Backup-Strategie:
                </span>{' '}
                Taegliche Backups fuer 30 Tage, woechentliche Backups fuer 6 Monate aufbewahren.
                Gemaess GoBD muessen Rechnungsdaten 10 Jahre aufbewahrt werden.
                Speichern Sie Backups auf einem separaten System (z.B. S3-kompatiblem Object Storage).
              </div>
            </div>
          </section>

          {/* --- 6. Updates --- */}
          <section id="updates" className="scroll-mt-24">
            <SectionHeading
              number="6"
              title="Updates"
              subtitle="Neue Versionen werden als Docker-Images auf GitHub Container Registry veroffentlicht."
            />

            <div className="space-y-6">
              <div>
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'rgb(var(--foreground))' }}
                >
                  Update durchfuehren
                </p>
                <CodeBlock language="bash">{`# Neues Image ziehen und Container neu starten
docker compose pull
docker compose up -d

# Datenbankmigrationen ausfuehren (immer nach jedem Update!)
docker compose exec backend alembic upgrade head`}</CodeBlock>
              </div>

              <div
                className="rounded-xl border p-4 text-sm leading-relaxed"
                style={{
                  backgroundColor: 'rgb(var(--primary) / 0.06)',
                  borderColor: 'rgb(var(--primary) / 0.3)',
                  color: 'rgb(var(--foreground-muted))',
                }}
              >
                <span className="font-semibold" style={{ color: 'rgb(var(--foreground))' }}>
                  Wichtig:
                </span>{' '}
                Fuehren Sie{' '}
                <code
                  className="rounded px-1.5 py-0.5 text-xs font-mono"
                  style={{ backgroundColor: 'rgb(var(--border))' }}
                >
                  alembic upgrade head
                </code>{' '}
                nach jedem Update aus. Das CHANGELOG auf GitHub informiert Sie ueber Breaking Changes
                und ob ein Datenbank-Backup vor dem Update erforderlich ist.
              </div>
            </div>
          </section>

          {/* --- 7. Support --- */}
          <section id="support" className="scroll-mt-24">
            <SectionHeading
              number="7"
              title="Support"
            />

            <div
              className="rounded-xl border p-6"
              style={{
                backgroundColor: 'rgb(var(--card))',
                borderColor: 'rgb(var(--border))',
              }}
            >
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <h3
                    className="text-sm font-semibold mb-2"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    GitHub Issues
                  </h3>
                  <p
                    className="text-sm mb-3 leading-relaxed"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    Bugs und Feature-Anfragen werden auf GitHub verwaltet.
                    Bitte beschreiben Sie Ihr Problem ausfuehrlich und fuegen Sie Logs bei.
                  </p>
                  <a
                    href="https://github.com/sadanakb/rechnungswerk/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold hover:opacity-80"
                    style={{ color: 'rgb(var(--primary))' }}
                  >
                    Issues oeffnen
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>

                <div>
                  <h3
                    className="text-sm font-semibold mb-2"
                    style={{ color: 'rgb(var(--foreground))' }}
                  >
                    Haeufige Fragen
                  </h3>
                  <p
                    className="text-sm mb-3 leading-relaxed"
                    style={{ color: 'rgb(var(--foreground-muted))' }}
                  >
                    Antworten zu Betrieb, Konfiguration und Fehlerbehebung finden Sie in unserer FAQ.
                  </p>
                  <Link
                    href="/faq"
                    className="inline-flex items-center gap-2 text-sm font-semibold hover:opacity-80"
                    style={{ color: 'rgb(var(--primary))' }}
                  >
                    FAQ ansehen
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* ============================================================
          CTA
          ============================================================ */}
      <section
        className="py-16 border-t"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2
            className="text-2xl font-bold"
            style={{ color: 'rgb(var(--foreground))' }}
          >
            Lieber ohne Selbst-Hosting starten?
          </h2>
          <p
            className="mt-3 text-sm leading-relaxed max-w-md mx-auto"
            style={{ color: 'rgb(var(--foreground-muted))' }}
          >
            Die Cloud-Version von RechnungsWerk ist kostenlos nutzbar und sofort einsatzbereit.
            Keine Server-Konfiguration, kein Wartungsaufwand.
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
              Kostenlos in der Cloud starten
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
  )
}
